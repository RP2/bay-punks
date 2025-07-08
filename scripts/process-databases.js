import { readFile, writeFile } from "fs/promises";

// load spelling corrections from external file
let SPELLING_CORRECTIONS = {};
let VENUE_CORRECTIONS = {};

async function loadSpellingCorrections() {
  try {
    const correctionsData = JSON.parse(
      await readFile("./src/data/spelling-corrections.json", "utf-8"),
    );
    SPELLING_CORRECTIONS = correctionsData.artist_corrections || {};
    VENUE_CORRECTIONS = correctionsData.venue_corrections || {};
    console.log(
      `loaded ${Object.keys(SPELLING_CORRECTIONS).length} artist corrections and ${Object.keys(VENUE_CORRECTIONS).length} venue corrections`,
    );
  } catch (error) {
    console.warn(
      "could not load spelling corrections, using empty dictionary:",
      error.message,
    );
    SPELLING_CORRECTIONS = {};
    VENUE_CORRECTIONS = {};
  }
}

// helper to normalize text (remove special characters, lowercase)
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// helper to normalize text with flexible "the" handling for artist matching
function normalizeForMatching(text) {
  let normalized = normalizeText(text);

  // remove "the" prefix for flexible matching (both "The Band" and "Band" match)
  if (normalized.startsWith("the ")) {
    normalized = normalized.substring(4);
  }

  return normalized;
}

// helper to create a unique slug
function createSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// helper to calculate levenshtein distance for fuzzy matching
function levenshteinDistance(str1, str2) {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

// helper to restore proper artist names from scraped data
// this helps fix any existing data where names were previously changed incorrectly
function getPreferredArtistName(scrapedName, existingName, aliases = []) {
  // ALWAYS prefer the scraped name (what's actually being promoted/listed)
  // the scraped name is what the venue/promoter is using, so it's the most accurate

  // only use existing name if scraped name is clearly incomplete or truncated
  if (existingName && scrapedName.length < 3) {
    return existingName;
  }

  // otherwise, always use the scraped name
  return scrapedName;
}

// apply spelling corrections (conservative approach)
function applySpellingCorrection(text, type = "artist") {
  const normalized = normalizeText(text);
  const corrections =
    type === "artist" ? SPELLING_CORRECTIONS : VENUE_CORRECTIONS;

  // only check for exact spelling correction matches (be very conservative)
  if (corrections[normalized]) {
    return corrections[normalized];
  }

  // return original text if no exact correction found
  return text;
}

// helper to find matches for duplicate detection
function findFuzzyMatch(map, normalizedText, type = "artist") {
  // for artists: only exact matches with flexible "The" handling
  // for venues: fuzzy matching with high threshold (0.9)

  if (type === "artist") {
    const normalizedForMatching = normalizeForMatching(normalizedText);

    for (const [key, value] of map.entries()) {
      const normalizedKey = normalizeText(value.name);
      const normalizedKeyForMatching = normalizeForMatching(value.name);

      // exact match after normalization (case-insensitive, no punctuation)
      if (normalizedKey === normalizedText) {
        return { key, isSpellingCorrection: false };
      }

      // flexible "the" matching - "The Band" matches "Band" and vice versa
      if (
        normalizedKeyForMatching === normalizedForMatching &&
        normalizedKeyForMatching !== normalizedKey
      ) {
        return { key, isSpellingCorrection: false };
      }
    }

    // no match found for artists (only exact matches allowed)
    return null;
  }

  // for venues, we can still do some fuzzy matching but with a high threshold
  if (type === "venue") {
    let bestMatch = null;
    let bestScore = 0;

    for (const [key, value] of map.entries()) {
      const normalizedKey = normalizeText(value.name);

      if (normalizedKey !== normalizedText) {
        const distance = levenshteinDistance(normalizedKey, normalizedText);
        const maxLength = Math.max(normalizedKey.length, normalizedText.length);
        const similarity = 1 - distance / maxLength;

        if (similarity >= 0.9 && similarity > bestScore) {
          bestScore = similarity;
          bestMatch = key;
        }
      }
    }

    return bestMatch ? { key: bestMatch, isSpellingCorrection: false } : null;
  }

  // no match found for artists (only exact matches allowed)
  return null;
}

// helper to merge artist data when combining duplicates
function mergeArtistData(existing, newData) {
  // calculate date ranges, handling null values from pre-population
  let firstSeen = newData.firstSeen;
  let lastSeen = newData.lastSeen;

  if (existing.firstSeen && existing.lastSeen) {
    firstSeen =
      existing.firstSeen < newData.firstSeen
        ? existing.firstSeen
        : newData.firstSeen;
    lastSeen =
      existing.lastSeen > newData.lastSeen
        ? existing.lastSeen
        : newData.lastSeen;
  }

  // use preferred name logic that prioritizes scraped names
  let finalName = getPreferredArtistName(
    newData.name,
    existing.name,
    Array.from(existing.aliases || []),
  );

  return {
    ...existing,
    // use the more conservative name selection logic
    name: finalName,
    // merge search urls (keep existing if present)
    searchUrl: existing.searchUrl || newData.searchUrl,
    // preserve spotify data (never overwrite with null/false values)
    spotifyUrl: existing.spotifyUrl || newData.spotifyUrl || null,
    spotifyVerified:
      existing.spotifyVerified || newData.spotifyVerified || false,
    spotifyData: existing.spotifyData || newData.spotifyData || null,
    // update date ranges
    firstSeen: firstSeen,
    lastSeen: lastSeen,
    // merge venues and aliases
    venues: new Set([...existing.venues, ...newData.venues]),
    aliases: new Set([...existing.aliases, ...newData.aliases]),
  };
}

// helper to extract and format venue location information
function parseVenueLocation(venueName) {
  // parse the venue name to extract address and city
  const parts = venueName.split(",").map((part) => part.trim());

  if (parts.length >= 3) {
    // format: [Venue Name], [Address], [City]
    return {
      address: parts[1],
      city: parts[2],
      displayLocation: `${parts[1]}, ${parts[2]}`,
    };
  } else if (parts.length === 2) {
    // format: [Venue Name/Address], [City] or [Venue Name], [Address]
    const firstPart = parts[0];
    const secondPart = parts[1];

    // check if the first part looks like a street address (venue name is the address)
    const firstPartIsAddress =
      /\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Plaza|Court|Ct)/.test(
        firstPart,
      );

    // check if the second part looks like a street address
    const secondPartIsAddress =
      /\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Plaza|Court|Ct)/.test(
        secondPart,
      );

    if (firstPartIsAddress && !secondPartIsAddress) {
      // first part is address, second part is city (e.g., "924 Gilman Street, Berkeley")
      return {
        address: firstPart,
        city: secondPart,
        displayLocation: `${firstPart}, ${secondPart}`,
      };
    } else if (secondPartIsAddress) {
      // second part is address (e.g., "Venue Name, 123 Main Street")
      return {
        address: secondPart,
        city: null,
        displayLocation: secondPart,
      };
    } else {
      // neither part looks like an address, assume second part is city
      return {
        address: null,
        city: secondPart,
        displayLocation: secondPart,
      };
    }
  }

  return {
    address: null,
    city: null,
    displayLocation: null,
  };
}

// helper to merge venue data when combining duplicates
function mergeVenueData(existing, newData) {
  // calculate date ranges, handling null values from pre-population
  let firstSeen = newData.firstSeen;
  let lastSeen = newData.lastSeen;

  if (existing.firstSeen && existing.lastSeen) {
    firstSeen =
      existing.firstSeen < newData.firstSeen
        ? existing.firstSeen
        : newData.firstSeen;
    lastSeen =
      existing.lastSeen > newData.lastSeen
        ? existing.lastSeen
        : newData.lastSeen;
  }

  return {
    ...existing,
    // keep the most recent name if different
    name: existing.name,
    // merge search urls (keep existing if present)
    searchUrl: existing.searchUrl || newData.searchUrl,
    // update date ranges
    firstSeen: firstSeen,
    lastSeen: lastSeen,
    // merge location fields (prefer non-null values)
    location: existing.location || newData.location,
    address: existing.address || newData.address,
    city: existing.city || newData.city,
    displayLocation: existing.displayLocation || newData.displayLocation,
    // merge aliases
    aliases: new Set([...existing.aliases, ...newData.aliases]),
  };
}

// non-artist filtering - list of entries that are not actual artists
const NON_ARTIST_FILTERS = [
  // meetings and administrative
  "membership meeting",
  "member meeting",
  "members meeting",
  "venue meeting",
  "staff meeting",
  "volunteer meeting",
  "board meeting",

  // private events
  "private event",
  "private party",
  "closed",

  // venue operations
  "doors",
  "soundcheck",
  "cleanup",
  "setup",
  "teardown",
  "break",
  "intermission",

  // placeholder entries
  "tbd",
  "tba",
  "to be announced",
  "to be determined",

  // movie screenings and film events
  "screening",
  "film screening",
  "movie screening",
  "documentary screening",
  "film",
  "movie",
  "documentary",
  "cinema",

  // other events and activities
  "workshop",
  "talk",
  "lecture",
  "discussion",
  "fundraiser",
  "benefit",
  "memorial",
  "tribute",
  "open mic",
  "karaoke",
  "trivia",
  "trivia night",
  "comedy",
  "comedy show",
  "stand-up",
  "standup",
  "poetry",
  "poetry reading",
  "book reading",
  "art opening",
  "art show",
  "gallery opening",
  "exhibition",
  "book launch",
  "author reading",
  "panel discussion",
  "q&a",
  "meet and greet",
  "signing",
  "dj set", // might be borderline, but often not a band name
];

// patterns for non-artist entries (more flexible matching)
const NON_ARTIST_PATTERNS = [
  /^screening\s+of\s+/i, // "screening of [movie]"
  /\s+screening$/i, // "[movie] screening"
  /^film\s+screening/i, // "film screening [title]"
  /^movie\s+screening/i, // "movie screening [title]"
  /^film:\s+/i, // "film: [title]"
  /^movie:\s+/i, // "movie: [title]"
  /^documentary:\s+/i, // "documentary: [title]"
  /\s+presents\s+/i, // "[venue] presents [event]"
  /\s+featuring\s+/i, // might be event description
  /^benefit\s+for\s+/i, // "benefit for [cause]"
  /^memorial\s+for\s+/i, // "memorial for [person]"
  /^tribute\s+to\s+/i, // "tribute to [person]"
  /^fundraiser\s+for\s+/i, // "fundraiser for [cause]"
  /open\s+mic(\s+night)?$/i, // "open mic" or "open mic night"
  /comedy\s+(show|night)$/i, // "comedy show" or "comedy night"
  /trivia\s+night$/i, // "trivia night"
  /^dj\s+night$/i, // "dj night"
  /^karaoke$/i, // "karaoke" as standalone
];

const CANCELLED_PATTERNS = [
  /^cancelled:/i,
  /^canceled:/i,
  /^probably cancelled:/i,
  /^postponed:/i,
  /^moved:/i,
  /^rescheduled:/i,
];

// check if an artist name matches non-artist filters
function isNonArtist(artistName) {
  const normalized = artistName.toLowerCase().trim();

  // check exact matches for non-artist terms
  if (NON_ARTIST_FILTERS.includes(normalized)) {
    return true;
  }

  // check for cancelled/postponed patterns at the beginning
  if (CANCELLED_PATTERNS.some((pattern) => pattern.test(artistName))) {
    return true;
  }

  // check for non-artist patterns (movie screenings, events, etc.)
  if (NON_ARTIST_PATTERNS.some((pattern) => pattern.test(artistName))) {
    return true;
  }

  // filter out very long names that are likely event descriptions
  if (artistName.length > 100) {
    return true;
  }

  // filter out entries that are obviously announcements (multiple sentences)
  if (artistName.includes(". ") && artistName.split(". ").length > 2) {
    return true;
  }

  return false;
}

// check if an entry is venue-specific administrative content
function isVenueAdministrative(artist, venues = null) {
  const venueList = venues || (artist.venues ? artist.venues : []);
  if (venueList.length === 1) {
    const venueName = venueList[0].toLowerCase();
    const artistName = (artist.name || artist).toLowerCase();
    if (venueName.includes("924 gilman") && artistName.includes("meeting")) {
      return true;
    }
  }
  return false;
}

async function processDatabases() {
  // load spelling corrections first
  await loadSpellingCorrections();

  // read the raw scraped data
  const concertsData = JSON.parse(
    await readFile("./src/data/raw.json", "utf-8"),
  );

  // load existing artists data to preserve spotify verification info
  let existingArtistsData = { artists: [] };
  try {
    existingArtistsData = JSON.parse(
      await readFile("./src/data/artists.json", "utf-8"),
    );
    console.log(
      `loaded ${existingArtistsData.artists.length} existing artists for data preservation`,
    );
  } catch (error) {
    console.log("no existing artists data found, starting fresh");
  }

  // clean up existing artists data - remove non-artist entries
  const originalCount = existingArtistsData.artists.length;
  existingArtistsData.artists = existingArtistsData.artists.filter((artist) => {
    if (isNonArtist(artist.name)) {
      console.log(
        `Removing non-artist entry from existing data: "${artist.name}"`,
      );
      return false;
    }
    return true;
  });

  if (originalCount !== existingArtistsData.artists.length) {
    console.log(
      `Cleaned up ${originalCount - existingArtistsData.artists.length} non-artist entries from existing data`,
    );
  }

  // create lookup map for existing artists by normalized name
  const existingArtistsByName = new Map();
  existingArtistsData.artists.forEach((artist) => {
    const normalizedName = normalizeText(artist.name);
    existingArtistsByName.set(normalizedName, artist);

    // also index by aliases for better matching
    if (artist.aliases) {
      artist.aliases.forEach((alias) => {
        const normalizedAlias = normalizeText(alias);
        if (!existingArtistsByName.has(normalizedAlias)) {
          existingArtistsByName.set(normalizedAlias, artist);
        }
      });
    }
  });

  // load existing venues data to preserve any metadata
  let existingVenuesData = { venues: [] };
  try {
    existingVenuesData = JSON.parse(
      await readFile("./src/data/venues.json", "utf-8"),
    );
    console.log(
      `loaded ${existingVenuesData.venues.length} existing venues for data preservation`,
    );
  } catch (error) {
    console.log("no existing venues data found, starting fresh");
  }

  // create lookup map for existing venues by normalized name
  const existingVenuesByName = new Map();
  existingVenuesData.venues.forEach((venue) => {
    const normalizedName = normalizeText(venue.name);
    existingVenuesByName.set(normalizedName, venue);

    // also index by aliases for better matching
    if (venue.aliases) {
      venue.aliases.forEach((alias) => {
        const normalizedAlias = normalizeText(alias);
        if (!existingVenuesByName.has(normalizedAlias)) {
          existingVenuesByName.set(normalizedAlias, venue);
        }
      });
    }
  });

  // initialize our databases with existing data
  const artists = new Map();
  const venues = new Map();

  // pre-populate artists map with existing artists to prevent data loss
  existingArtistsData.artists.forEach((artist) => {
    const artistKey = artist.id || createSlug(artist.name);
    artists.set(artistKey, {
      ...artist,
      venues: new Set(artist.venues || []),
      aliases: new Set(artist.aliases || []),
      // reset these to be recalculated from current data
      firstSeen: null,
      lastSeen: null,
    });
  });

  // pre-populate venues map with existing venues to prevent data loss
  existingVenuesData.venues.forEach((venue) => {
    const venueKey = venue.id || createSlug(venue.name);
    venues.set(venueKey, {
      ...venue,
      aliases: new Set(venue.aliases || []),
      // reset these to be recalculated from current data
      firstSeen: null,
      lastSeen: null,
    });
  });

  console.log(
    `pre-populated with ${artists.size} existing artists and ${venues.size} existing venues`,
  );

  let duplicatesFound = 0;
  let spellingCorrectionsFound = 0;

  // process each show
  concertsData.shows.forEach((show) => {
    show.events.forEach((event) => {
      // process venue
      if (event.venue?.text) {
        const normalizedVenue = normalizeText(event.venue.text);
        const matchResult = findFuzzyMatch(venues, normalizedVenue, "venue");

        if (matchResult) {
          const existingVenueKey =
            typeof matchResult === "string" ? matchResult : matchResult.key;
          const isSpellingCorrection =
            matchResult.isSpellingCorrection || false;
          const canonicalName = matchResult.canonicalName;

          // merge with existing venue
          const existing = venues.get(existingVenueKey);

          // when merging due to spelling correction, use canonical name as primary
          const primaryName = isSpellingCorrection
            ? canonicalName || existing.name
            : existing.name;

          const locationInfo = parseVenueLocation(event.venue.text);

          const merged = mergeVenueData(existing, {
            name: primaryName,
            searchUrl: event.venue.href,
            firstSeen: show.normalizedDate,
            lastSeen: show.normalizedDate,
            location: locationInfo.address || locationInfo.city,
            address: locationInfo.address,
            city: locationInfo.city,
            displayLocation: locationInfo.displayLocation,
            aliases: new Set([event.venue.text]),
          });

          // add the current name as an alias if different from primary
          if (event.venue.text !== primaryName) {
            merged.aliases.add(event.venue.text);

            if (isSpellingCorrection) {
              console.log(
                `corrected venue spelling: "${event.venue.text}" -> "${canonicalName || existing.name}"`,
              );
              spellingCorrectionsFound++;
            } else {
              console.log(
                `merged duplicate venue: "${event.venue.text}" -> "${existing.name}"`,
              );
              duplicatesFound++;
            }
          }

          venues.set(existingVenueKey, merged);
        } else {
          // check if this is a new venue that needs spelling correction
          const correctedVenueName = applySpellingCorrection(
            event.venue.text,
            "venue",
          );
          const useCorrection = correctedVenueName !== event.venue.text;
          const finalVenueName = useCorrection
            ? correctedVenueName
            : event.venue.text;

          if (useCorrection) {
            console.log(
              `applying spelling correction to new venue: "${event.venue.text}" -> "${finalVenueName}"`,
            );
            spellingCorrectionsFound++;
          }

          // create new venue entry
          const venueSlug = createSlug(finalVenueName);
          const aliases = new Set([finalVenueName]);
          const locationInfo = parseVenueLocation(finalVenueName);

          // add original misspelling as alias if different
          if (useCorrection && event.venue.text !== finalVenueName) {
            aliases.add(event.venue.text);
          }

          venues.set(venueSlug, {
            id: venueSlug,
            name: finalVenueName,
            searchUrl: event.venue.href,
            firstSeen: show.normalizedDate,
            lastSeen: show.normalizedDate,
            location: locationInfo.address || locationInfo.city,
            address: locationInfo.address,
            city: locationInfo.city,
            displayLocation: locationInfo.displayLocation,
            aliases: aliases,
          });
        }
      }

      // process artists
      event.bands.forEach((band) => {
        if (band.text) {
          // filter out non-artist entries (meetings, events, movie screenings, etc.)
          if (
            isNonArtist(band.text) ||
            isVenueAdministrative(band.text, [event.venue?.text])
          ) {
            return; // skip processing this band
          }

          const normalizedBand = normalizeText(band.text);
          const matchResult = findFuzzyMatch(artists, normalizedBand, "artist");

          if (matchResult) {
            const existingArtistKey =
              typeof matchResult === "string" ? matchResult : matchResult.key;
            const isSpellingCorrection =
              matchResult.isSpellingCorrection || false;

            // merge with existing artist
            const existing = artists.get(existingArtistKey);

            // ALWAYS use the scraped name - it's what's actually being promoted
            const preferredName = getPreferredArtistName(
              band.text,
              existing.name,
              Array.from(existing.aliases || []),
            );

            // check if we need to preserve spotify data from previous runs
            const normalizedPreferredName = normalizeText(preferredName);
            const existingSpotifyData = existingArtistsByName.get(
              normalizedPreferredName,
            );

            const newArtistData = {
              name: preferredName, // use the scraped name (most accurate)
              searchUrl: band.href,
              // preserve any spotify data from previous database
              spotifyUrl: existingSpotifyData?.spotifyUrl || null,
              spotifyVerified: existingSpotifyData?.spotifyVerified || false,
              spotifyData: existingSpotifyData?.spotifyData || null,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              venues: new Set([event.venue?.text]),
              aliases: new Set([band.text]),
            };

            const merged = mergeArtistData(existing, newArtistData);

            // add the current name as an alias if different from final name
            if (band.text !== merged.name) {
              merged.aliases.add(band.text);
              console.log(
                `merged duplicate artist: "${band.text}" -> using preferred "${merged.name}"`,
              );
              duplicatesFound++;
            }

            // log if we updated the name from previous data
            if (preferredName !== existing.name) {
              console.log(
                `  🔧 updated to current name: "${existing.name}" -> "${preferredName}"`,
              );
            }

            // log spotify data preservation
            if (
              existingSpotifyData &&
              (existingSpotifyData.spotifyUrl ||
                existingSpotifyData.spotifyVerified)
            ) {
              console.log(
                `  🔒 preserving spotify data for merged artist "${preferredName}"`,
              );
            }

            artists.set(existingArtistKey, merged);
          } else {
            // create new artist entry using exactly what was scraped
            const artistSlug = createSlug(band.text);
            const aliases = new Set([band.text]);

            // check if this artist exists in our previous data (by name or alias)
            const normalizedName = normalizeText(band.text);
            const existingArtist = existingArtistsByName.get(normalizedName);

            // preserve spotify verification data if available
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

            if (
              existingArtist &&
              (existingArtist.spotifyUrl || existingArtist.spotifyVerified)
            ) {
              console.log(`  🔒 preserving spotify data for "${band.text}"`);
            }

            artists.set(artistSlug, {
              id: artistSlug,
              name: band.text,
              searchUrl: band.href,
              ...spotifyData,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              venues: new Set([event.venue?.text]),
              aliases: aliases,
            });
          }
        }
      });
    });
  });

  // convert artists Map to array and process venues
  const artistsArray = Array.from(artists.values()).map((artist) => ({
    ...artist,
    venues: Array.from(artist.venues).filter(Boolean),
    aliases: Array.from(artist.aliases).filter(Boolean),
  }));

  // convert venues Map to array
  const venuesArray = Array.from(venues.values()).map((venue) => ({
    ...venue,
    aliases: Array.from(venue.aliases).filter(Boolean),
  }));

  // sort arrays alphabetically by name
  artistsArray.sort((a, b) => a.name.localeCompare(b.name));
  venuesArray.sort((a, b) => a.name.localeCompare(b.name));

  // preserve existing metadata but remove automatic spotify verification
  // spotify verification is now handled separately by spotify-verify.js
  const existingMetadata = existingArtistsData.spotifyVerification || {};

  // calculate spotify verification stats (existing data only)
  const spotifyStats = {
    totalArtists: artistsArray.length,
    spotifyVerified: artistsArray.filter((a) => a.spotifyVerified).length,
    spotifyUrls: artistsArray.filter((a) => a.spotifyUrl).length,
    notFound: artistsArray.filter((a) => a.spotifyData?.notFound).length,
    unverified: artistsArray.filter(
      (a) => !a.spotifyVerified && !a.spotifyData?.notFound,
    ).length,
  };
  await writeFile(
    "./src/data/artists.json",
    JSON.stringify(
      {
        artists: artistsArray,
        total: artistsArray.length,
        lastUpdated: new Date().toISOString(),
        spotifyVerification: {
          ...existingMetadata,
          lastProcessed: new Date().toISOString(),
          stats: spotifyStats,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    "./src/data/venues.json",
    JSON.stringify(
      {
        venues: venuesArray,
        total: venuesArray.length,
        lastUpdated: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(
    `processed ${artistsArray.length} artists and ${venuesArray.length} venues`,
  );
  console.log(`found and merged ${duplicatesFound} duplicate entries`);
  console.log(
    `found ${spellingCorrectionsFound} spelling variations (prioritized scraped names)`,
  );
  console.log(
    `enhanced filtering now blocks: meetings, events, movie screenings, and other non-artist entries`,
  );

  console.log(`\n🎵 spotify verification summary (existing data):`);
  console.log(`  📊 total artists: ${spotifyStats.totalArtists}`);
  console.log(
    `  ✅ spotify verified: ${spotifyStats.spotifyVerified} (${Math.round((spotifyStats.spotifyVerified / spotifyStats.totalArtists) * 100)}%)`,
  );
  console.log(`  🔗 spotify urls: ${spotifyStats.spotifyUrls}`);
  console.log(`  ❌ not found: ${spotifyStats.notFound}`);
  console.log(`  ⏳ unverified: ${spotifyStats.unverified}`);
  console.log(
    `\ndata written to src/data/artists.json and src/data/venues.json`,
  );
  console.log(
    `\n💡 to verify new artists on spotify, run: node scripts/spotify-verify.js --new`,
  );
  console.log(
    `\n🧹 comprehensive filtering active: this script now handles all cleanup tasks`,
  );
}

processDatabases().catch(console.error);
