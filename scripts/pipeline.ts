// Pipeline orchestrator: scrape -> resolve -> verify -> build
// Replaces scrape-concerts.js, process-databases.js, generate-calendar.js

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

import { loadConfig, resolveDataPath } from "./lib/config.js";
import {
  normalizeText,
  normalizeVenueName,
  parseVenueLocation,
  isNonArtist,
  isVenueAdministrative,
  getPacificDateISO,
  createSlug,
} from "./lib/normalizers.js";
import {
  buildArtistIndex,
  buildVenueIndex,
  resolveEntity,
  mergeArtistData,
  mergeVenueData,
  buildVenueIdResolutionMap,
  resolveVenueId,
  filterExpiredEntities,
  applySpellingCorrection,
} from "./lib/entities.js";
import { scrape } from "./lib/fetcher.js";
import {
  RawDataSchema,
  ArtistsDataSchema,
  VenuesDataSchema,
  ShowsDataSchema,
  ShowVenueSchema,
  ShowBandSchema,
  ShowEventSchema,
  ShowSchema,
} from "./lib/schemas.js";
import type {
  Artist,
  Venue,
  Show,
  ShowEvent,
  ArtistsData,
  VenuesData,
  ShowsData,
} from "./lib/schemas.js";

// --- Resolve stage ---

async function resolve(): Promise<void> {
  const config = await loadConfig();

  console.log("loading data files...");
  const rawData = RawDataSchema.parse(
    JSON.parse(await readFile(resolveDataPath("raw.json"), "utf-8")),
  );

  // load existing databases (or start fresh)
  let existingArtists: Artist[] = [];
  let existingVenues: Venue[] = [];
  try {
    const artistsData = ArtistsDataSchema.parse(
      JSON.parse(await readFile(resolveDataPath("artists.json"), "utf-8")),
    );
    existingArtists = artistsData.artists;
    console.log(`loaded ${existingArtists.length} existing artists`);
  } catch {
    console.log("no existing artists data, starting fresh");
  }

  try {
    const venuesData = VenuesDataSchema.parse(
      JSON.parse(await readFile(resolveDataPath("venues.json"), "utf-8")),
    );
    existingVenues = venuesData.venues;
    console.log(`loaded ${existingVenues.length} existing venues`);
  } catch {
    console.log("no existing venues data, starting fresh");
  }

  // clean non-artist entries from existing data
  const originalArtistCount = existingArtists.length;
  existingArtists = existingArtists.filter(
    (a) => !isNonArtist(a.name, config.nonArtistFilters),
  );
  if (existingArtists.length !== originalArtistCount) {
    console.log(
      `removed ${originalArtistCount - existingArtists.length} non-artist entries from existing data`,
    );
  }

  // build indexes
  const artistIndex = buildArtistIndex(existingArtists);
  const venueIndex = buildVenueIndex(existingVenues);

  // prepare entity maps (mutable during processing)
  const artists = new Map<string, Artist>();
  const venues = new Map<string, Venue>();

  // pre-populate with existing data
  for (const artist of existingArtists) {
    artists.set(artist.id, {
      ...artist,
      venues: [...(artist.venues || [])],
      aliases: [...(artist.aliases || [])],
      firstSeen: null, // will be recalculated
      lastSeen: null,
    });
  }
  for (const venue of existingVenues) {
    venues.set(venue.id, {
      ...venue,
      aliases: [...(venue.aliases || [])],
      firstSeen: null, // will be recalculated
      lastSeen: null,
    });
  }

  console.log(
    `pre-populated with ${artists.size} artists and ${venues.size} venues`,
  );

  // venue text -> venue ID mapping for artist processing
  const venueTextToId = new Map<string, string>();

  let duplicatesFound = 0;
  let spellingCorrectionsFound = 0;

  // spelling correction maps
  const artistCorrections: Record<string, string> = {};
  for (const [k, v] of Object.entries(
    config.spellingCorrections.artist_corrections,
  )) {
    artistCorrections[normalizeText(k)] = v;
  }
  const venueCorrections: Record<string, string> = {};
  for (const [k, v] of Object.entries(
    config.spellingCorrections.venue_corrections,
  )) {
    venueCorrections[normalizeText(k)] = v;
  }

  // process each show
  for (const show of rawData.shows) {
    for (const event of show.events) {
      // --- process venue ---
      if (event.venue?.text) {
        const venueResult = resolveEntity(event.venue.text, venueIndex, {
          fuzzyThreshold: 0.85,
          corrections: venueCorrections,
          specialCases: config.venueRules.specialCases,
          type: "venue",
        });

        const locationInfo = parseVenueLocation(
          event.venue.text,
          config.venueRules.cityAbbreviations,
        );

        if (!venueResult.isNew) {
          // merge with existing venue
          const existing = venues.get(venueResult.id);
          if (existing) {
            const merged = mergeVenueData(existing, {
              name: venueResult.correctedName || event.venue.text,
              searchUrl: event.venue.href,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              address: locationInfo.address,
              city: locationInfo.city,
              aliases: new Set([
                event.venue.text,
                ...(venueResult.mergedAliases || []),
              ]),
            });
            venues.set(venueResult.id, merged);

            if (venueResult.mergedAliases.length > 0) {
              console.log(
                `  merged venue: "${event.venue.text}" -> "${existing.name}"`,
              );
              duplicatesFound++;
            }
            if (venueResult.correctedName) {
              console.log(
                `  corrected venue spelling: "${event.venue.text}" -> "${venueResult.correctedName}"`,
              );
              spellingCorrectionsFound++;
            }
          }
        } else {
          // create new venue
          const venueName =
            venueResult.correctedName || event.venue.text;
          const aliases = new Set([venueName]);
          if (event.venue.text !== venueName) {
            aliases.add(event.venue.text);
          }

          // check special cases for address/city
          let address = locationInfo.address;
          let city = locationInfo.city;
          for (const [, spec] of Object.entries(
            config.venueRules.specialCases,
          )) {
            if (
              spec.match.every((kw) =>
                event.venue.text.toLowerCase().includes(kw),
              )
            ) {
              address = spec.address || address || null;
              city = spec.city || city || null;
            }
          }

          const newVenue: Venue = {
            id: venueResult.id,
            name: venueName,
            searchUrl: event.venue.href || null,
            address,
            city,
            firstSeen: show.normalizedDate,
            lastSeen: show.normalizedDate,
            aliases: Array.from(aliases),
          };
          venues.set(venueResult.id, newVenue);

          // update index
          venueIndex.byId.set(venueResult.id, newVenue);
          venueIndex.byNormalizedName.set(
            normalizeText(venueName),
            venueResult.id,
          );
          for (const alias of newVenue.aliases) {
            venueIndex.byAlias.set(normalizeText(alias), venueResult.id);
          }
        }

        venueTextToId.set(event.venue.text, venueResult.id);
      }

      // --- process artists ---
      for (const band of event.bands) {
        if (!band.text) continue;

        if (isNonArtist(band.text, config.nonArtistFilters)) continue;
        if (isVenueAdministrative(band.text, [event.venue?.text || ""])) continue;

        const artistResult = resolveEntity(band.text, artistIndex, {
          fuzzyThreshold: 0.9,
          corrections: artistCorrections,
          type: "artist",
        });

        const venueId = venueTextToId.get(event.venue?.text || "");

        if (!artistResult.isNew) {
          // merge with existing artist
          const existing = artists.get(artistResult.id);
          if (existing) {
            const preferredName =
              artistResult.correctedName || band.text;
            const merged = mergeArtistData(existing, {
              name: preferredName,
              searchUrl: band.href,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              venues: new Set(venueId ? [venueId] : []),
              aliases: new Set([band.text, ...(artistResult.mergedAliases || [])]),
            });
            artists.set(artistResult.id, merged);

            if (band.text !== merged.name) {
              console.log(
                `  merged artist: "${band.text}" -> "${merged.name}"`,
              );
              duplicatesFound++;
            }
            if (artistResult.correctedName) {
              spellingCorrectionsFound++;
            }
          }
        } else {
          // create new artist
          const artistName =
            artistResult.correctedName || band.text;
          const aliases = new Set([band.text]);
          if (band.text !== artistName) {
            aliases.add(band.text);
          }

          // preserve spotify data from existing artists if available
          const existingArtist = existingArtists.find(
            (a) => a.id === artistResult.id,
          );
          const spotifyData = existingArtist
            ? {
                spotifyUrl: existingArtist.spotifyUrl || null,
                spotifyVerified: existingArtist.spotifyVerified || false,
                spotifyData: existingArtist.spotifyData || null,
              }
            : {
                spotifyUrl: null,
                spotifyVerified: false,
                spotifyData: null,
              };

          const newArtist: Artist = {
            id: artistResult.id,
            name: artistName,
            searchUrl: band.href || null,
            ...spotifyData,
            firstSeen: show.normalizedDate,
            lastSeen: show.normalizedDate,
            venues: venueId ? [venueId] : [],
            aliases: Array.from(aliases),
          };
          artists.set(artistResult.id, newArtist);

          // update index
          artistIndex.byId.set(artistResult.id, newArtist);
          artistIndex.byNormalizedName.set(
            normalizeText(artistName),
            artistResult.id,
          );
          for (const alias of newArtist.aliases) {
            artistIndex.byAlias.set(normalizeText(alias), artistResult.id);
          }
        }
      }
    }
  }

  // --- final venue deduplication ---
  console.log("performing final venue deduplication...");
  const normalizedVenueMap = new Map<string, string>();
  const venuesToRemove = new Set<string>();
  let dedupCount = 0;

  for (const [key, venue] of venues.entries()) {
    const normalizedName = normalizeVenueName(venue.name, config.venueRules);

    if (normalizedName.length < 4) {
      normalizedVenueMap.set(key, key);
      continue;
    }

    const existingKey = normalizedVenueMap.get(normalizedName);
    if (existingKey) {
      const existingVenue = venues.get(existingKey);
      if (existingVenue) {
        // merge aliases
        for (const alias of venue.aliases) {
          if (!existingVenue.aliases.includes(alias)) {
            existingVenue.aliases.push(alias);
          }
        }
        if (!existingVenue.aliases.includes(venue.name)) {
          existingVenue.aliases.push(venue.name);
        }
        // merge location data
        if (venue.city && !existingVenue.city) {
          existingVenue.city = venue.city;
        }
        if (venue.address && !existingVenue.address) {
          existingVenue.address = venue.address;
        }
        // update date ranges
        if (
          venue.firstSeen &&
          (!existingVenue.firstSeen || venue.firstSeen < existingVenue.firstSeen)
        ) {
          existingVenue.firstSeen = venue.firstSeen;
        }
        if (
          venue.lastSeen &&
          (!existingVenue.lastSeen || venue.lastSeen > existingVenue.lastSeen)
        ) {
          existingVenue.lastSeen = venue.lastSeen;
        }
        venuesToRemove.add(key);
        dedupCount++;
      }
    } else {
      normalizedVenueMap.set(normalizedName, key);
    }
  }

  for (const key of venuesToRemove) {
    venues.delete(key);
  }
  if (dedupCount > 0) {
    console.log(`  removed ${dedupCount} duplicate venues`);
  }

  // --- fix null dates ---
  const today = getPacificDateISO();
  for (const [, venue] of venues.entries()) {
    if (!venue.firstSeen) venue.firstSeen = today;
    if (!venue.lastSeen) venue.lastSeen = today;
  }
  for (const [, artist] of artists.entries()) {
    if (!artist.firstSeen) artist.firstSeen = today;
    if (!artist.lastSeen) artist.lastSeen = today;
  }

  // --- build shows.json with resolved IDs ---
  console.log("building shows.json with resolved IDs...");
  const venueIdMap = buildVenueIdResolutionMap(Array.from(venues.values()));

  const resolvedShows: Show[] = rawData.shows.map((show) => ({
    day: show.day,
    normalizedDate: show.normalizedDate,
    events: show.events.map((event) => ({
      venue: {
        text: event.venue.text,
        id: venueTextToId.get(event.venue.text) || createSlug(event.venue.text),
        href: event.venue.href,
        location: (() => {
          const venue = venues.get(
            venueTextToId.get(event.venue.text) || "",
          );
          if (venue) {
            const parts = [venue.address, venue.city].filter(Boolean);
            return parts.length > 0 ? parts.join(", ") : null;
          }
          return null;
        })(),
      },
      bands: event.bands
        .filter((band) => {
          if (!band.text) return false;
          if (isNonArtist(band.text, config.nonArtistFilters)) return false;
          return true;
        })
        .map((band) => {
          const artistResult = resolveEntity(band.text, artistIndex, {
            fuzzyThreshold: 0.9,
            corrections: artistCorrections,
            type: "artist",
          });
          return {
            text: band.text,
            id: artistResult.id,
            href: band.href,
            spotifyVerified:
              (artists.get(artistResult.id) as Artist | undefined)
                ?.spotifyVerified || false,
          };
        }),
      extra: event.extra,
    })),
  }));

  // --- apply data retention ---
  const retentionMonths = config.venueRules.retentionMonths || 6;
  const retentionDate = new Date();
  retentionDate.setMonth(retentionDate.getMonth() - retentionMonths);
  const retentionDateStr = retentionDate.toISOString().split("T")[0];

  // collect active IDs from shows
  const activeArtistIds = new Set<string>();
  const activeVenueIds = new Set<string>();
  for (const show of resolvedShows) {
    for (const event of show.events) {
      if (event.venue?.id) activeVenueIds.add(event.venue.id);
      for (const band of event.bands) {
        if (band.id) activeArtistIds.add(band.id);
      }
    }
  }

  // --- convert to arrays and sort ---
  let artistsArray = Array.from(artists.values());
  let venuesArray = Array.from(venues.values());

  // apply retention filter
  const preRetentionArtistCount = artistsArray.length;
  const preRetentionVenueCount = venuesArray.length;

  artistsArray = filterExpiredEntities(
    artistsArray,
    activeArtistIds,
    retentionDateStr,
  ) as Artist[];
  venuesArray = filterExpiredEntities(
    venuesArray,
    activeVenueIds,
    retentionDateStr,
  ) as Venue[];

  console.log(
    `retention: ${preRetentionArtistCount} -> ${artistsArray.length} artists, ${preRetentionVenueCount} -> ${venuesArray.length} venues`,
  );

  // sort alphabetically
  artistsArray.sort((a, b) => a.name.localeCompare(b.name));
  venuesArray.sort((a, b) => a.name.localeCompare(b.name));

  // --- write output files ---
  const showsData: ShowsData = {
    shows: resolvedShows,
    metadata: {
      lastUpdated: new Date().toISOString(),
      source: "raw.json",
    },
  };

  const artistsData: ArtistsData = {
    artists: artistsArray,
    total: artistsArray.length,
    lastUpdated: new Date().toISOString(),
  };

  const venuesData: VenuesData = {
    venues: venuesArray,
    total: venuesArray.length,
    lastUpdated: new Date().toISOString(),
  };

  // validate before writing
  ShowsDataSchema.parse(showsData);
  ArtistsDataSchema.parse(artistsData);
  VenuesDataSchema.parse(venuesData);

  await writeFile(
    resolveDataPath("shows.json"),
    JSON.stringify(showsData, null, 2),
  );
  await writeFile(
    resolveDataPath("artists.json"),
    JSON.stringify(artistsData, null, 2),
  );
  await writeFile(
    resolveDataPath("venues.json"),
    JSON.stringify(venuesData, null, 2),
  );

  console.log(`\nresolve complete:`);
  console.log(`  ${artistsArray.length} artists`);
  console.log(`  ${venuesArray.length} venues`);
  console.log(`  ${resolvedShows.length} show days`);
  console.log(`  ${duplicatesFound} duplicates merged`);
  console.log(`  ${spellingCorrectionsFound} spelling corrections`);
}

// --- Build stage ---

async function build(): Promise<void> {
  console.log("building calendar and frontend data...");

  const showsData = ShowsDataSchema.parse(
    JSON.parse(await readFile(resolveDataPath("shows.json"), "utf-8")),
  );
  const artistsData = ArtistsDataSchema.parse(
    JSON.parse(await readFile(resolveDataPath("artists.json"), "utf-8")),
  );
  const venuesData = VenuesDataSchema.parse(
    JSON.parse(await readFile(resolveDataPath("venues.json"), "utf-8")),
  );

  // load spotify overlay if it exists
  let spotifyOverlay: Record<string, any> = {};
  try {
    const overlayRaw = JSON.parse(
      await readFile(resolveDataPath("artists.spotify.json"), "utf-8"),
    );
    spotifyOverlay = overlayRaw.verifications || {};
    console.log(
      `loaded spotify overlay with ${Object.keys(spotifyOverlay).length} verifications`,
    );
  } catch {
    console.log("no spotify overlay found, skipping");
  }

  // merge spotify overlay into artists
  const mergedArtists = artistsData.artists.map((artist) => {
    const overlay = spotifyOverlay[artist.id];
    if (overlay) {
      return {
        ...artist,
        spotifyUrl: overlay.spotifyUrl ?? artist.spotifyUrl,
        spotifyVerified: overlay.spotifyVerified ?? artist.spotifyVerified,
        spotifyData: overlay.spotifyData ?? artist.spotifyData,
      };
    }
    return artist;
  });

  // filter to upcoming shows only
  const todayISOString = getPacificDateISO();
  const upcomingShows = showsData.shows.filter(
    (show) => show.normalizedDate >= todayISOString,
  );

  // collect active IDs
  const activeArtistIds = new Set<string>();
  const activeVenueIds = new Set<string>();
  for (const show of upcomingShows) {
    for (const event of show.events) {
      if (event.venue?.id) activeVenueIds.add(event.venue.id);
      for (const band of event.bands) {
        if (band.id) activeArtistIds.add(band.id);
      }
    }
  }

  // pre-compute nextShow for each artist
  const artistNextShow = new Map<
    string,
    { date: string; humanDate: string; venue: { id: string; text: string } }
  >();
  for (const show of upcomingShows) {
    for (const event of show.events) {
      for (const band of event.bands) {
        if (band.id && !artistNextShow.has(band.id)) {
          artistNextShow.set(band.id, {
            date: show.normalizedDate,
            humanDate: show.day,
            venue: {
              id: event.venue.id,
              text: event.venue.text,
            },
          });
        }
      }
    }
  }

  // pre-compute nextShow and display info for each venue
  const venueNextShow = new Map<
    string,
    { date: string; humanDate: string }
  >();
  for (const show of upcomingShows) {
    for (const event of show.events) {
      if (event.venue?.id && !venueNextShow.has(event.venue.id)) {
        venueNextShow.set(event.venue.id, {
          date: show.normalizedDate,
          humanDate: show.day,
        });
      }
    }
  }

  // build pruned artists with nextShow and genres
  const prunedArtists = mergedArtists
    .filter((artist) => activeArtistIds.has(artist.id))
    .map((artist) => ({
      ...artist,
      nextShow: artistNextShow.get(artist.id) || null,
      genres: artist.spotifyData?.genres || [],
    }));

  // build pruned venues with display info
  const prunedVenues = venuesData.venues
    .filter((venue) => activeVenueIds.has(venue.id))
    .map((venue) => {
      // compute displayName: prefer longest alias with location info
      let displayName = venue.name;
      if (venue.name.length < 10 && (venue.aliases || []).length > 0) {
        const detailedAliases = (venue.aliases || []).filter(
          (alias) =>
            alias.includes(",") ||
            alias.includes("Street") ||
            alias.includes("Ave") ||
            alias.includes("Blvd"),
        );
        const candidates = detailedAliases.length > 0 ? detailedAliases : venue.aliases;
        const longest = candidates.reduce(
          (a, b) => (a.length > b.length ? a : b),
          "",
        );
        if (longest) displayName = longest;
      }

      // compute locationString
      let locationString: string | null = null;
      if (venue.address && venue.city) {
        locationString = `${venue.address}, ${venue.city}`;
      } else if (venue.city) {
        locationString = venue.city;
      } else if (venue.address) {
        locationString = venue.address;
      }

      return {
        ...venue,
        displayName,
        locationString,
        nextShow: venueNextShow.get(venue.id) || null,
      };
    });

  // extract genres
  const activeGenres = new Set<string>();
  for (const artist of prunedArtists) {
    if (artist.spotifyData?.genres) {
      for (const genre of artist.spotifyData.genres) {
        activeGenres.add(genre);
      }
    }
  }
  const genresArray = Array.from(activeGenres).sort((a, b) =>
    a.localeCompare(b),
  );

  // build calendar
  const calendarData = {
    shows: upcomingShows,
    metadata: {
      totalShows: upcomingShows.length,
      totalEvents: upcomingShows.reduce(
        (sum, show) => sum + show.events.length,
        0,
      ),
      dateRange: {
        start: upcomingShows[0]?.normalizedDate || null,
        end: upcomingShows[upcomingShows.length - 1]?.normalizedDate || null,
      },
      lastUpdated: new Date().toISOString(),
      generatedFrom: {
        showsData: "shows.json",
        processedArtists: "artists.json",
        processedVenues: "venues.json",
      },
    },
  };

  // write all output files
  await writeFile(
    resolveDataPath("calendar.json"),
    JSON.stringify(calendarData, null, 2),
  );
  await writeFile(
    resolveDataPath("artists.json"),
    JSON.stringify({ artists: prunedArtists, total: prunedArtists.length, lastUpdated: new Date().toISOString() }, null, 2),
  );
  await writeFile(
    resolveDataPath("venues.json"),
    JSON.stringify({ venues: prunedVenues, total: prunedVenues.length, lastUpdated: new Date().toISOString() }, null, 2),
  );
  await writeFile(
    resolveDataPath("genres.json"),
    JSON.stringify({ genres: genresArray }, null, 2),
  );

  console.log(`\nbuild complete:`);
  console.log(`  ${calendarData.metadata.totalShows} upcoming show days`);
  console.log(`  ${calendarData.metadata.totalEvents} total events`);
  console.log(`  ${prunedArtists.length} active artists`);
  console.log(`  ${prunedVenues.length} active venues`);
  console.log(`  ${genresArray.length} genres`);
  console.log(
    `  date range: ${calendarData.metadata.dateRange.start} to ${calendarData.metadata.dateRange.end}`,
  );
}

// --- Full pipeline ---

async function full(): Promise<void> {
  console.log("=== FULL PIPELINE ===\n");

  console.log("--- Stage 1: Scrape ---");
  await scrape();

  console.log("\n--- Stage 2: Resolve ---");
  await resolve();

  console.log("\n--- Stage 3: Verify ---");
  console.log("(skipping spotify verification - run 'pipeline verify' separately)");

  console.log("\n--- Stage 4: Build ---");
  await build();

  console.log("\n=== PIPELINE COMPLETE ===");
}

// --- CLI entry point ---

const command = process.argv[2];

switch (command) {
  case "scrape":
    scrape().catch(console.error);
    break;
  case "resolve":
    resolve().catch(console.error);
    break;
  case "build":
    build().catch(console.error);
    break;
  case "full":
    full().catch(console.error);
    break;
  default:
    console.log(`Usage: npx tsx scripts/pipeline.ts <command>

Commands:
  scrape    Fetch data from foopee.com and produce raw.json
  resolve   Process raw.json into shows.json, artists.json, venues.json
  build     Generate calendar.json, genres.json, and pruned frontend data
  full      Run the complete pipeline (scrape -> resolve -> build)

Note: Spotify verification is a separate step:
  npx tsx scripts/spotify-verify.ts
`);
    process.exit(1);
}