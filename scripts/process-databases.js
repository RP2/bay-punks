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

// helper to create a unique slug
function createSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// helper to generate search URLs (fallback)
function generateSearchUrl(searchTerm) {
  const encodedTerm = encodeURIComponent(searchTerm);
  return `https://www.google.com/search?q=${encodedTerm}`;
}

// helper to find similar entries with fuzzy matching
function findSimilarEntry(map, normalizedText) {
  for (const [key, value] of map.entries()) {
    const normalizedKey = normalizeText(value.name);
    if (normalizedKey === normalizedText) {
      return key;
    }
  }
  return null;
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

// helper to apply spelling corrections
function applySpellingCorrection(text, type = "artist") {
  const normalized = normalizeText(text);
  const corrections =
    type === "artist" ? SPELLING_CORRECTIONS : VENUE_CORRECTIONS;

  // check for exact spelling correction
  if (corrections[normalized]) {
    return corrections[normalized];
  }

  // check for partial matches (e.g., "the nin" -> "nine inch nails")
  for (const [misspelling, correction] of Object.entries(corrections)) {
    if (normalized.includes(misspelling) || misspelling.includes(normalized)) {
      // calculate similarity to see if it's a likely match
      const distance = levenshteinDistance(normalized, misspelling);
      const maxLength = Math.max(normalized.length, misspelling.length);
      const similarity = 1 - distance / maxLength;

      if (similarity >= 0.8) {
        return correction;
      }
    }
  }

  // return original text if no correction found (not normalized)
  return text;
}

// helper to find the canonical (correctly spelled) version of an artist
function findCanonicalArtist(map, normalizedText) {
  // first apply spelling corrections
  const correctedText = applySpellingCorrection(normalizedText, "artist");

  // if correction was applied, look for the canonical version
  if (correctedText !== normalizedText) {
    for (const [key, value] of map.entries()) {
      const normalizedKey = normalizeText(value.name);
      if (normalizedKey === correctedText) {
        return { key, isSpellingCorrection: true, canonicalName: value.name };
      }
    }
  }

  return null;
}

// helper to find the canonical (correctly spelled) version of a venue
function findCanonicalVenue(map, normalizedText) {
  // first apply spelling corrections
  const correctedText = applySpellingCorrection(normalizedText, "venue");

  // if correction was applied, look for the canonical version
  if (correctedText !== normalizedText) {
    for (const [key, value] of map.entries()) {
      const normalizedKey = normalizeText(value.name);
      if (normalizedKey === correctedText) {
        return { key, isSpellingCorrection: true, canonicalName: value.name };
      }
    }
  }

  return null;
}

// helper to find fuzzy matches for duplicate detection
function findFuzzyMatch(
  map,
  normalizedText,
  threshold = 0.85,
  type = "artist",
) {
  let bestMatch = null;
  let bestScore = 0;

  // first check for spelling corrections
  const canonicalMatch =
    type === "artist"
      ? findCanonicalArtist(map, normalizedText)
      : findCanonicalVenue(map, normalizedText);

  if (canonicalMatch) {
    return {
      key: canonicalMatch.key,
      isSpellingCorrection: true,
      canonicalName: canonicalMatch.canonicalName,
    };
  }

  for (const [key, value] of map.entries()) {
    const normalizedKey = normalizeText(value.name);

    // exact match
    if (normalizedKey === normalizedText) {
      return { key, isSpellingCorrection: false };
    }

    // fuzzy match using similarity ratio
    const distance = levenshteinDistance(normalizedKey, normalizedText);
    const maxLength = Math.max(normalizedKey.length, normalizedText.length);
    const similarity = 1 - distance / maxLength;

    if (similarity >= threshold && similarity > bestScore) {
      bestScore = similarity;
      bestMatch = key;
    }
  }

  return bestMatch ? { key: bestMatch, isSpellingCorrection: false } : null;
}

// helper to merge artist data when combining duplicates
function mergeArtistData(existing, newData) {
  return {
    ...existing,
    // keep the most recent name if different
    name: existing.name,
    // merge search urls (keep existing if present)
    searchUrl: existing.searchUrl || newData.searchUrl,
    // preserve spotify data (never overwrite with null/false values)
    spotifyUrl: existing.spotifyUrl || newData.spotifyUrl || null,
    spotifyVerified:
      existing.spotifyVerified || newData.spotifyVerified || false,
    spotifyData: existing.spotifyData || newData.spotifyData || null,
    // update date ranges
    firstSeen:
      existing.firstSeen < newData.firstSeen
        ? existing.firstSeen
        : newData.firstSeen,
    lastSeen:
      existing.lastSeen > newData.lastSeen
        ? existing.lastSeen
        : newData.lastSeen,
    // combine counts
    showCount: existing.showCount + newData.showCount,
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
  return {
    ...existing,
    // keep the most recent name if different
    name: existing.name,
    // merge search urls (keep existing if present)
    searchUrl: existing.searchUrl || newData.searchUrl,
    // update date ranges
    firstSeen:
      existing.firstSeen < newData.firstSeen
        ? existing.firstSeen
        : newData.firstSeen,
    lastSeen:
      existing.lastSeen > newData.lastSeen
        ? existing.lastSeen
        : newData.lastSeen,
    // combine counts
    showCount: existing.showCount + newData.showCount,
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
  "membership meeting",
  "member meeting",
  "members meeting",
  "private event",
  "private party",
  "closed",
  "doors",
  "soundcheck",
  "cleanup",
  "setup",
  "teardown",
  "break",
  "intermission",
  "tbd",
  "tba",
  "to be announced",
  "to be determined",
  "venue meeting",
  "staff meeting",
  "volunteer meeting",
  "board meeting",
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

  // read the concerts data
  const concertsData = JSON.parse(
    await readFile("./src/data/concerts.json", "utf-8"),
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

  // initialize our databases
  const artists = new Map();
  const venues = new Map();

  let duplicatesFound = 0;
  let spellingCorrectionsFound = 0;

  // process each show
  concertsData.shows.forEach((show) => {
    show.events.forEach((event) => {
      // process venue
      if (event.venue?.text) {
        const normalizedVenue = normalizeText(event.venue.text);
        const matchResult = findFuzzyMatch(
          venues,
          normalizedVenue,
          0.9,
          "venue",
        );

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
            showCount: 1,
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
            showCount: 1,
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
          // filter out non-artist entries
          if (
            isNonArtist(band.text) ||
            isVenueAdministrative(band.text, [event.venue?.text])
          ) {
            return; // skip processing this band
          }

          const normalizedBand = normalizeText(band.text);
          const matchResult = findFuzzyMatch(
            artists,
            normalizedBand,
            0.85,
            "artist",
          );

          if (matchResult) {
            const existingArtistKey =
              typeof matchResult === "string" ? matchResult : matchResult.key;
            const isSpellingCorrection =
              matchResult.isSpellingCorrection || false;
            const canonicalName = matchResult.canonicalName;

            // merge with existing artist
            const existing = artists.get(existingArtistKey);

            // when merging due to spelling correction, use canonical name as primary
            const primaryName = isSpellingCorrection
              ? canonicalName || existing.name
              : existing.name;

            // check if we need to preserve spotify data from previous runs
            const normalizedPrimaryName = normalizeText(primaryName);
            const existingSpotifyData = existingArtistsByName.get(
              normalizedPrimaryName,
            );

            const newArtistData = {
              name: primaryName,
              searchUrl: band.href,
              // preserve any spotify data from previous database
              spotifyUrl: existingSpotifyData?.spotifyUrl || null,
              spotifyVerified: existingSpotifyData?.spotifyVerified || false,
              spotifyData: existingSpotifyData?.spotifyData || null,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              showCount: 1,
              venues: new Set([event.venue?.text]),
              aliases: new Set([band.text]),
            };

            const merged = mergeArtistData(existing, newArtistData);

            // add the current name as an alias if different from primary
            if (band.text !== primaryName) {
              merged.aliases.add(band.text);

              if (isSpellingCorrection) {
                console.log(
                  `corrected spelling: "${band.text}" -> "${canonicalName || existing.name}"`,
                );
                spellingCorrectionsFound++;
              } else {
                console.log(
                  `merged duplicate artist: "${band.text}" -> "${existing.name}"`,
                );
                duplicatesFound++;
              }
            }

            // log spotify data preservation
            if (
              existingSpotifyData &&
              (existingSpotifyData.spotifyUrl ||
                existingSpotifyData.spotifyVerified)
            ) {
              console.log(
                `  🔒 preserving spotify data for merged artist "${primaryName}"`,
              );
            }

            artists.set(existingArtistKey, merged);
          } else {
            // check if this is a new artist that needs spelling correction
            const correctedArtistName = applySpellingCorrection(
              band.text,
              "artist",
            );
            const useCorrection = correctedArtistName !== band.text;
            const finalArtistName = useCorrection
              ? correctedArtistName
              : band.text;

            if (useCorrection) {
              console.log(
                `applying spelling correction to new artist: "${band.text}" -> "${finalArtistName}"`,
              );
              spellingCorrectionsFound++;
            }

            // create new artist entry
            const artistSlug = createSlug(finalArtistName);
            const aliases = new Set([finalArtistName]);

            // add original misspelling as alias if different
            if (useCorrection && band.text !== finalArtistName) {
              aliases.add(band.text);
            }

            // check if this artist exists in our previous data (by name or alias)
            const normalizedFinalName = normalizeText(finalArtistName);
            const existingArtist =
              existingArtistsByName.get(normalizedFinalName);

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
              console.log(
                `  🔒 preserving spotify data for "${finalArtistName}"`,
              );
            }

            artists.set(artistSlug, {
              id: artistSlug,
              name: finalArtistName,
              searchUrl: band.href,
              ...spotifyData,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              showCount: 1,
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

  // sort arrays by show count (most frequent first)
  artistsArray.sort((a, b) => b.showCount - a.showCount);
  venuesArray.sort((a, b) => b.showCount - a.showCount);

  // preserve existing metadata
  const existingMetadata = existingArtistsData.spotifyVerification || {};

  // automatically verify new artists if spotify credentials are available (in-memory only)
  let newArtistVerificationStats = null;
  try {
    const { verifyArtistsInMemory } = await import(
      "./verify-spotify-new-artists.js"
    );

    // find new artists that need verification
    const newArtists = artistsArray.filter(
      (artist) => !artist.spotifyVerified && !artist.spotifyData?.notFound,
    );

    if (newArtists.length > 0) {
      console.log(
        `\n🎵 verifying ${Math.min(50, newArtists.length)} new artists on spotify...`,
      );

      // verify artists in-memory without touching files
      const verificationResults = await verifyArtistsInMemory(
        newArtists.slice(0, 50), // limit to 50 for automated runs
        { verbose: true },
      );

      // apply verification results directly to our in-memory data
      verificationResults.forEach((result) => {
        const artist = artistsArray.find((a) => a.id === result.id);
        if (artist) {
          artist.spotifyUrl = result.spotifyUrl;
          artist.spotifyVerified = result.spotifyVerified;
          artist.spotifyData = result.spotifyData;
        }
      });

      newArtistVerificationStats = {
        verified: verificationResults.length,
        found: verificationResults.filter((r) => r.spotifyVerified).length,
        errors: 0, // todo: track errors if needed
      };

      console.log(
        `✅ automatically verified ${newArtistVerificationStats.verified} new artists`,
      );
    }
  } catch (error) {
    console.log(`⚠️  spotify verification skipped: ${error.message}`);
    console.log(
      `   (this is normal if spotify credentials are not configured)`,
    );
  }

  // calculate spotify verification stats (after potential verification)
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
  console.log(`found and merged ${duplicatesFound} duplicates`);
  console.log(
    `found and corrected ${spellingCorrectionsFound} spelling errors`,
  );

  if (newArtistVerificationStats) {
    console.log(`\n🤖 automatic spotify verification:`);
    console.log(
      `  🔍 new artists verified: ${newArtistVerificationStats.verified}`,
    );
    console.log(`  ✅ found on spotify: ${newArtistVerificationStats.found}`);
    console.log(
      `  ❌ not found: ${newArtistVerificationStats.verified - newArtistVerificationStats.found}`,
    );
    if (newArtistVerificationStats.errors > 0) {
      console.log(`  ⚠️  errors: ${newArtistVerificationStats.errors}`);
    }
  }

  console.log(`\n🎵 spotify verification summary:`);
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
}

processDatabases().catch(console.error);
