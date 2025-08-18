import { readFile, writeFile } from "fs/promises";

// load spelling corrections from external file
let SPELLING_CORRECTIONS = {};
let VENUE_CORRECTIONS = {};
let CITY_CORRECTIONS = {};

async function loadSpellingCorrections() {
  try {
    const correctionsData = JSON.parse(
      await readFile("./src/data/spelling-corrections.json", "utf-8"),
    );
    // Normalize all correction keys to lowercase for robust, case-insensitive matching
    SPELLING_CORRECTIONS = {};
    for (const [k, v] of Object.entries(
      correctionsData.artist_corrections || {},
    )) {
      SPELLING_CORRECTIONS[normalizeText(k)] = v;
    }
    VENUE_CORRECTIONS = {};
    for (const [k, v] of Object.entries(
      correctionsData.venue_corrections || {},
    )) {
      VENUE_CORRECTIONS[normalizeText(k)] = v;
    }
    CITY_CORRECTIONS = {};
    for (const [k, v] of Object.entries(
      correctionsData.city_corrections || {},
    )) {
      CITY_CORRECTIONS[normalizeText(k)] = v;
    }
    console.log(
      `loaded ${Object.keys(SPELLING_CORRECTIONS).length} artist corrections, ${Object.keys(VENUE_CORRECTIONS).length} venue corrections, and ${Object.keys(CITY_CORRECTIONS).length} city corrections`,
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
  let corrections = SPELLING_CORRECTIONS;
  if (type === "venue") corrections = VENUE_CORRECTIONS;
  if (type === "city") corrections = CITY_CORRECTIONS;

  // special case for "1,000 Dreams" - handle the "000 Dreams" variant
  if (type === "artist" && normalized === "000 dreams") {
    return "1,000 Dreams";
  }

  // only check for exact spelling correction matches (case-insensitive)
  if (corrections[normalized]) {
    return corrections[normalized];
  }

  // return original text if no exact correction found
  return text;
}

// helper to apply city corrections
function applyCityCorrection(city) {
  return applySpellingCorrection(city, "city");
}

// helper to find matches for duplicate detection
function findFuzzyMatch(map, normalizedText, type = "artist") {
  // for artists: allow fuzzy matching with high threshold (0.9), plus alias and normalization logic
  if (type === "artist") {
    const normalizedForMatching = normalizeForMatching(normalizedText);
    let bestMatch = null;
    let bestScore = 0.0;

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

      // check aliases if they exist
      if (value.aliases && Array.isArray(value.aliases)) {
        for (const alias of value.aliases) {
          const normalizedAlias = normalizeText(alias);
          if (normalizedAlias === normalizedText) {
            return { key, isSpellingCorrection: false };
          }
        }
      }

      // fuzzy match: use Levenshtein distance on normalized names
      const distance = levenshteinDistance(normalizedKey, normalizedText);
      const maxLength = Math.max(normalizedKey.length, normalizedText.length);
      const similarity = maxLength > 0 ? 1 - distance / maxLength : 0;
      if (similarity >= 0.9 && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = key;
      }

      // also check aliases for fuzzy match
      if (value.aliases && Array.isArray(value.aliases)) {
        for (const alias of value.aliases) {
          const normalizedAlias = normalizeText(alias);
          const aliasDistance = levenshteinDistance(
            normalizedAlias,
            normalizedText,
          );
          const aliasMaxLength = Math.max(
            normalizedAlias.length,
            normalizedText.length,
          );
          const aliasSimilarity =
            aliasMaxLength > 0 ? 1 - aliasDistance / aliasMaxLength : 0;
          if (aliasSimilarity >= 0.9 && aliasSimilarity > bestScore) {
            bestScore = aliasSimilarity;
            bestMatch = key;
          }
        }
      }
    }

    if (bestMatch) {
      return { key: bestMatch, isSpellingCorrection: false };
    }
    // no match found for artists
    return null;
  } // for venues, we can still do some fuzzy matching but with a high threshold
  if (type === "venue") {
    let bestMatch = null;
    let bestScore = 0;
    let debugInfo = null;

    // First, try to find an exact match after normalizing venue name to remove age restrictions, cities, etc.
    const normalizedVenueName = normalizeVenueName(normalizedText);

    // Skip very short normalized names (probably not useful for deduplication)
    if (normalizedVenueName.length < 4) {
      // For very short names, require higher similarity
      bestScore = 0.95;
    }

    for (const [key, value] of map.entries()) {
      // Use the pre-calculated normalized name if available, otherwise calculate it
      const normalizedExistingVenue =
        value.normalizedName || normalizeVenueName(value.name);

      // If we find an exact match after normalization, return it immediately
      // This is the primary way we detect duplicates with city/age restriction differences
      if (
        normalizedExistingVenue === normalizedVenueName &&
        normalizedVenueName.length >= 4
      ) {
        console.log(
          `Normalized venue match found: "${normalizedText}" matches "${value.name}" (normalized: "${normalizedVenueName}")`,
        );
        return { key, isSpellingCorrection: false };
      }

      // Also check all aliases with normalization
      if (value.aliases && value.aliases.size > 0) {
        for (const alias of value.aliases) {
          const normalizedAlias = normalizeVenueName(alias);
          if (
            normalizedAlias === normalizedVenueName &&
            normalizedVenueName.length >= 4
          ) {
            console.log(
              `Normalized venue alias match found: "${normalizedText}" matches alias "${alias}" of "${value.name}"`,
            );
            return { key, isSpellingCorrection: false };
          }
        }
      }

      // Address-based matching for venues with addresses
      if (
        value.address &&
        normalizedText.includes(normalizeText(value.address))
      ) {
        const similarity = 0.95; // High confidence for address matches
        if (similarity > bestScore) {
          bestScore = similarity;
          bestMatch = key;
          debugInfo = `address match: ${value.address}`;
        }
      }

      // Fall back to traditional fuzzy matching with Levenshtein distance
      const normalizedKey = normalizeText(value.name);

      // Only do fuzzy matching if the normalized names are different
      if (normalizedKey !== normalizedText) {
        const distance = levenshteinDistance(normalizedKey, normalizedText);
        const maxLength = Math.max(normalizedKey.length, normalizedText.length);
        const similarity = 1 - distance / maxLength;

        if (similarity >= 0.85 && similarity > bestScore) {
          // Lower threshold for better matching
          bestScore = similarity;
          bestMatch = key;
          debugInfo = `fuzzy match: similarity ${similarity.toFixed(2)}`;
        }
      }
    }

    if (bestMatch && debugInfo) {
      console.log(
        `Fuzzy venue match: "${normalizedText}" -> "${map.get(bestMatch).name}" (${debugInfo})`,
      );
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

  // use preferred name logic that prioritizes Spotify canonical name if verified, then scraped names
  let finalName = getPreferredArtistName(
    newData.name,
    existing.name,
    Array.from(existing.aliases || []),
  );

  // if we have a verified Spotify name, use it as the canonical name
  // spotifyData.name is the canonical name from Spotify
  const spotifyName =
    (newData.spotifyVerified &&
      newData.spotifyData &&
      newData.spotifyData.name) ||
    (existing.spotifyVerified &&
      existing.spotifyData &&
      existing.spotifyData.name);
  if (
    spotifyName &&
    typeof spotifyName === "string" &&
    spotifyName.length > 1
  ) {
    // add all previous names as aliases if not already present
    const allAliases = new Set([
      ...Array.from(existing.aliases || []),
      ...Array.from(newData.aliases || []),
      finalName,
      existing.name,
      newData.name,
    ]);
    finalName = spotifyName;
    // remove the canonical name from aliases if present
    allAliases.delete(spotifyName);
    return {
      ...existing,
      name: finalName,
      searchUrl: existing.searchUrl || newData.searchUrl,
      spotifyUrl: existing.spotifyUrl || newData.spotifyUrl || null,
      spotifyVerified:
        existing.spotifyVerified || newData.spotifyVerified || false,
      spotifyData: existing.spotifyData || newData.spotifyData || null,
      firstSeen: firstSeen,
      lastSeen: lastSeen,
      venues: new Set([...newData.venues]),
      aliases: allAliases,
    };
  }

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
    // only use venue IDs - ignore old venue names from existing data
    venues: new Set([...newData.venues]),
    aliases: new Set([...existing.aliases, ...newData.aliases]),
  };
}

// helper to extract and format venue location information
function parseVenueLocation(venueName) {
  // Clean up the venue name by removing age restrictions before parsing
  let cleanedVenueName = venueName;

  // Remove age restriction patterns (16+, 18+, 21+, 16-, 18-, etc.)
  const ageRestrictionMatch = cleanedVenueName.match(/(\d+[\+\-])(\s|$)/);
  if (ageRestrictionMatch) {
    cleanedVenueName = cleanedVenueName
      .replace(ageRestrictionMatch[0], "")
      .trim();
  }

  // parse the cleaned venue name to extract address and city
  const parts = cleanedVenueName.split(",").map((part) => part.trim());

  if (parts.length >= 3) {
    // format: [Venue Name], [Address], [City]
    return {
      address: parts[1],
      city: applyCityCorrection(expandCityAbbreviations(parts[2])),
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
        city: applyCityCorrection(expandCityAbbreviations(secondPart)),
      };
    } else if (secondPartIsAddress) {
      // second part is address (e.g., "Venue Name, 123 Main Street")
      return {
        address: secondPart,
        city: null,
      };
    } else {
      // neither part looks like an address, assume second part is city
      return {
        address: null,
        city: applyCityCorrection(expandCityAbbreviations(secondPart)),
      };
    }
  }

  return {
    address: null,
    city: null,
  };
}

// helper to expand city abbreviations for display
function expandCityAbbreviations(locationText) {
  if (!locationText) return locationText;

  return locationText
    .replace(/S\.F\.?/gi, "San Francisco")
    .replace(/\bSF\b/gi, "San Francisco")
    .replace(/\bOakland\b/gi, "Oakland")
    .replace(/\bBerkeley\b/gi, "Berkeley")
    .replace(/\bSan Jose\b/gi, "San Jose")
    .replace(/\bMountain View\b/gi, "Mountain View")
    .replace(/\bPalo Alto\b/gi, "Palo Alto")
    .replace(/\bSanta Cruz\b/gi, "Santa Cruz")
    .replace(/\bSanta Rosa\b/gi, "Santa Rosa");
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

  // Ensure we have a normalized name
  const normalizedName =
    existing.normalizedName || normalizeVenueName(existing.name);

  return {
    ...existing,
    // keep the most recent name if different
    name: existing.name,
    // preserve or add normalized name for better matching
    normalizedName: normalizedName,
    // merge search urls (keep existing if present)
    searchUrl: existing.searchUrl || newData.searchUrl,
    // update date ranges
    firstSeen: firstSeen,
    lastSeen: lastSeen,
    // merge location fields (prefer non-null values, but allow new data to override null existing data)
    address: newData.address || existing.address,
    city: newData.city || existing.city,
    // merge aliases
    aliases: new Set([...existing.aliases, ...newData.aliases]),
  };
}

// non-artist filtering - list of entries that are not actual artists
const NON_ARTIST_FILTERS = [
  // invalid/fragment entries
  "1", // fragment from "1,000 Dreams" splitting

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

// helper to normalize venue names by removing age restrictions and other common suffixes
function normalizeVenueName(text) {
  // First do basic text normalization
  let normalized = normalizeText(text);

  // Handle various abbreviations for street, avenue, etc.
  normalized = normalized
    .replace(/\bst\b|\bstreet\b/g, "st")
    .replace(/\bave\b|\bavenue\b/g, "ave")
    .replace(/\brd\b|\broad\b/g, "rd")
    .replace(/\bblvd\b|\bboulevard\b/g, "blvd")
    .replace(/\bdr\b|\bdrive\b/g, "dr")
    .replace(/\bln\b|\blane\b/g, "ln");

  // Remove common age restriction patterns (16+, 18+, 21+, 16-, 18-, etc.)
  normalized = normalized.replace(/\b\d+[\+\-](\s|$)/g, "");

  // Remove 'all ages' indicator
  normalized = normalized.replace(/\ball ages\b/g, "");

  // Remove other common non-identifying suffixes
  normalized = normalized.replace(/\bsold out\b/g, "");
  normalized = normalized.replace(/\bpresents\b/g, "");

  // Remove common city name suffixes (after comma)
  // This is important for deduplication to work properly
  normalized = normalized.replace(/\s*,\s*[a-z\s\.]+$/i, "");

  // Remove any trailing commas and whitespace
  normalized = normalized.replace(/,\s*$/, "");

  return normalized.trim();
}

// Check for the specific 924 Gilman case - this venue is especially problematic
function isSpecialCaseVenue(venueName) {
  // Normalize the name for consistent checking
  const normalized = normalizeText(venueName);

  // Special case for 924 Gilman
  if (normalized.includes("924") && normalized.includes("gilman")) {
    return {
      name: "924 Gilman Street",
      id: "924-gilman-street-berkeley",
      address: "924 Gilman Street",
      city: "Berkeley",
    };
  }

  // Add other special cases here as needed

  return null;
}

// Process the concert data to extract artists and venues
async function processDatabases() {
  // global artist id lookup for this run
  let artistIdLookup = new Map();
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

    // apply spelling correction to existing venue names for consistency
    const correctedVenueName = applySpellingCorrection(venue.name, "venue");
    const finalVenueName =
      correctedVenueName !== venue.name ? correctedVenueName : venue.name;

    if (correctedVenueName !== venue.name) {
      console.log(
        `applying spelling correction to existing venue: "${venue.name}" -> "${finalVenueName}"`,
      );
    }

    // Create additional venue lookup with normalized name (no city, no age restrictions)
    // This helps with more robust deduplication
    const normalizedVenueName = normalizeVenueName(finalVenueName);

    venues.set(venueKey, {
      ...venue,
      name: finalVenueName,
      normalizedName: normalizedVenueName, // Store normalized name for better matching
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

  // create a mapping from venue text to venue ID for artist processing
  const venueTextToId = new Map();

  // process each show
  concertsData.shows.forEach((show) => {
    show.events.forEach((event) => {
      // process venue
      if (event.venue?.text) {
        // Check for special case venues that need custom handling
        const specialCase = isSpecialCaseVenue(event.venue.text);

        if (specialCase) {
          // Handle special case venue (like 924 Gilman)
          console.log(
            `Special case venue detected: "${event.venue.text}" -> "${specialCase.name}"`,
          );

          let existingVenue = null;
          // Check if we already have this special case venue
          for (const [key, venue] of venues.entries()) {
            if (venue.id === specialCase.id) {
              existingVenue = { key, venue };
              break;
            }
          }

          if (existingVenue) {
            // Update the existing venue
            const merged = mergeVenueData(existingVenue.venue, {
              name: specialCase.name,
              searchUrl: event.venue.href,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              address: specialCase.address,
              city: specialCase.city,
              aliases: new Set([event.venue.text]),
            });

            // Add the current name as an alias if different
            if (
              event.venue.text !== specialCase.name &&
              !merged.aliases.has(event.venue.text)
            ) {
              merged.aliases.add(event.venue.text);
            }

            venues.set(existingVenue.key, merged);
            // map venue text to venue ID for artist processing
            venueTextToId.set(event.venue.text, existingVenue.key);
            console.log(`Updated special case venue: "${specialCase.name}"`);
            // Skip regular venue processing by returning from this event
            return;
          } else {
            // Create a new special case venue
            const aliases = new Set([specialCase.name, event.venue.text]);

            venues.set(specialCase.id, {
              id: specialCase.id,
              name: specialCase.name,
              normalizedName: normalizeVenueName(specialCase.name),
              searchUrl: event.venue.href,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              address: specialCase.address,
              city: specialCase.city,
              aliases: aliases,
            });
            // map venue text to venue ID for artist processing
            venueTextToId.set(event.venue.text, specialCase.id);
            console.log(`Created special case venue: "${specialCase.name}"`);
            // Skip regular venue processing by returning early
            return;
          }
        }

        // Normal venue processing for non-special cases
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
            address: locationInfo.address,
            city: locationInfo.city,
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
          // map venue text to venue ID for artist processing
          venueTextToId.set(event.venue.text, existingVenueKey);
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
          const normalizedVenueName = normalizeVenueName(finalVenueName);

          // add original misspelling as alias if different
          if (useCorrection && event.venue.text !== finalVenueName) {
            aliases.add(event.venue.text);
          }

          // Add original venue name with suffix as an alias if it's different after normalization
          if (normalizeText(finalVenueName) !== normalizedVenueName) {
            console.log(
              `Adding original venue name as alias: "${finalVenueName}" (normalized: "${normalizedVenueName}")`,
            );
            if (!aliases.has(finalVenueName)) {
              aliases.add(finalVenueName);
            }
          }

          venues.set(venueSlug, {
            id: venueSlug,
            name: finalVenueName,
            normalizedName: normalizedVenueName, // Store normalized name for better matching
            searchUrl: event.venue.href,
            firstSeen: show.normalizedDate,
            lastSeen: show.normalizedDate,
            address: locationInfo.address,
            city: locationInfo.city,
            aliases: aliases,
          });
          // map venue text to venue ID for artist processing
          venueTextToId.set(event.venue.text, venueSlug);
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

          // apply spelling correction to artist names
          const correctedBandName = applySpellingCorrection(
            band.text,
            "artist",
          );
          const normalizedBand = normalizeText(correctedBandName);
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
              correctedBandName,
              existing.name,
              Array.from(existing.aliases || []),
            );

            // check if we need to preserve spotify data from previous runs
            const normalizedPreferredName = normalizeText(preferredName);
            const existingSpotifyData = existingArtistsByName.get(
              normalizedPreferredName,
            );

            // get the venue ID from the mapping
            const venueId = venueTextToId.get(event.venue?.text);

            const newArtistData = {
              name: preferredName, // use the scraped name (most accurate)
              searchUrl: band.href,
              // preserve any spotify data from previous database
              spotifyUrl: existingSpotifyData?.spotifyUrl || null,
              spotifyVerified: existingSpotifyData?.spotifyVerified || false,
              spotifyData: existingSpotifyData?.spotifyData || null,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              venues: new Set([venueId]),
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
            // create new artist entry using the corrected name
            const artistSlug = createSlug(correctedBandName);
            const aliases = new Set([band.text]);

            // check if this artist exists in our previous data (by name or alias)
            const normalizedName = normalizeText(correctedBandName);
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
              console.log(
                `  🔒 preserving spotify data for "${correctedBandName}"`,
              );
            }

            // get the venue ID from the mapping
            const venueId = venueTextToId.get(event.venue?.text);

            artists.set(artistSlug, {
              id: artistSlug,
              name: correctedBandName,
              searchUrl: band.href,
              ...spotifyData,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              venues: new Set([venueId]),
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

  // Final venue deduplication check using normalized names
  console.log("Performing final venue deduplication check...");
  const normalizedVenueMap = new Map();
  const venuesToRemove = new Set();
  let finalDeduplicationCount = 0;

  // Create a simple address-based lookup for detecting duplicates based on similar addresses
  // (This helps catch cases where names differ but addresses match)
  const addressMap = new Map();

  // First, find any venues with null dates - we'll need to handle these specially
  const venuesWithNullDates = [];
  const venuesWithValidDates = [];

  for (const [key, venue] of venues.entries()) {
    // Add venue to proper category based on dates
    if (venue.firstSeen === null || venue.lastSeen === null) {
      venuesWithNullDates.push([key, venue]);
    } else {
      venuesWithValidDates.push([key, venue]);

      // Build address-based lookup (only for venues with valid dates)
      if (venue.address) {
        const normalizedAddress = normalizeText(venue.address);
        if (normalizedAddress.length > 5) {
          // Only use meaningful addresses
          if (!addressMap.has(normalizedAddress)) {
            addressMap.set(normalizedAddress, []);
          }
          addressMap.get(normalizedAddress).push([key, venue]);
        }
      }
    }
  }

  console.log(`Found ${venuesWithNullDates.length} venues with null dates`);

  // First pass: process venues with valid dates and build our normalized venue map
  for (const [key, venue] of venuesWithValidDates) {
    const normalizedName =
      venue.normalizedName || normalizeVenueName(venue.name);

    // Skip very short normalized names (probably not useful for deduplication)
    if (normalizedName.length < 4) {
      normalizedVenueMap.set(key, venue); // Use key as map key to avoid collisions with short names
      continue;
    }

    if (normalizedVenueMap.has(normalizedName)) {
      // We found a duplicate that wasn't caught earlier
      const existingVenue = normalizedVenueMap.get(normalizedName);
      console.log(
        `Final deduplication: "${venue.name}" duplicates "${existingVenue.name}" (normalized: "${normalizedName}")`,
      );

      // Merge the aliases
      venue.aliases.forEach((alias) => existingVenue.aliases.add(alias));
      if (!existingVenue.aliases.has(venue.name)) {
        existingVenue.aliases.add(venue.name);
      }

      // If this venue has a city and the existing one doesn't, use this one's city
      if (venue.city && !existingVenue.city) {
        existingVenue.city = venue.city;
      }

      // If this venue has an address and the existing one doesn't, use this one's address
      if (venue.address && !existingVenue.address) {
        existingVenue.address = venue.address;
      }

      // Update date ranges
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

      // Mark this venue for removal
      venuesToRemove.add(key);
      finalDeduplicationCount++;
    } else {
      // First time seeing this normalized venue name
      normalizedVenueMap.set(normalizedName, venue);
    }
  }

  // Second pass: Try to match venues with null dates against our normalized map
  for (const [key, venue] of venuesWithNullDates) {
    const normalizedName =
      venue.normalizedName || normalizeVenueName(venue.name);
    let matched = false;

    // First try exact match with normalized name
    if (normalizedVenueMap.has(normalizedName) && normalizedName.length >= 4) {
      const existingVenue = normalizedVenueMap.get(normalizedName);
      console.log(
        `Matching null-date venue: "${venue.name}" with "${existingVenue.name}" (normalized: "${normalizedName}")`,
      );

      // Merge the aliases
      venue.aliases.forEach((alias) => existingVenue.aliases.add(alias));
      if (!existingVenue.aliases.has(venue.name)) {
        existingVenue.aliases.add(venue.name);
      }

      // If this venue has a city and the existing one doesn't, use this one's city
      if (venue.city && !existingVenue.city) {
        existingVenue.city = venue.city;
      }

      // If this venue has an address and the existing one doesn't, use this one's address
      if (venue.address && !existingVenue.address) {
        existingVenue.address = venue.address;
      }

      // Don't update date ranges - the existing venue has valid dates

      // Mark this venue for removal
      venuesToRemove.add(key);
      finalDeduplicationCount++;
      matched = true;
    }

    // If not matched by name, try matching by address
    if (!matched && venue.address) {
      const normalizedAddress = normalizeText(venue.address);
      if (normalizedAddress.length > 5 && addressMap.has(normalizedAddress)) {
        const matchingVenues = addressMap.get(normalizedAddress);
        if (matchingVenues.length > 0) {
          const [matchKey, matchVenue] = matchingVenues[0]; // Use the first match
          console.log(
            `Address-matched null-date venue: "${venue.name}" with "${matchVenue.name}" (address: "${venue.address}")`,
          );

          // Merge the aliases
          venue.aliases.forEach((alias) => matchVenue.aliases.add(alias));
          if (!matchVenue.aliases.has(venue.name)) {
            matchVenue.aliases.add(venue.name);
          }

          // Mark this venue for removal
          venuesToRemove.add(key);
          finalDeduplicationCount++;
          matched = true;
        }
      }
    }

    // If still no match, keep this venue but try to get dates from similar venues
    if (!matched) {
      // For now, just keep it as is
      // We'll fix the dates in the third pass
    }
  }

  // Remove duplicates
  venuesToRemove.forEach((key) => {
    venues.delete(key);
  });

  // Final pass: try to fix any remaining null dates using fuzzy matching
  const remainingNullDateVenues = Array.from(venues.entries()).filter(
    ([_, venue]) => venue.firstSeen === null || venue.lastSeen === null,
  );

  if (remainingNullDateVenues.length > 0) {
    console.log(
      `Attempting to fix ${remainingNullDateVenues.length} venues with null dates`,
    );

    // Use a default date range if we can't match
    const oldestDate = "2025-01-01"; // A reasonable default start date
    const newestDate = new Date().toISOString().split("T")[0]; // Today's date

    for (const [key, venue] of remainingNullDateVenues) {
      // Fix null dates with sensible defaults
      if (venue.firstSeen === null) {
        venue.firstSeen = oldestDate;
        console.log(
          `Fixed null firstSeen for "${venue.name}" with default date ${oldestDate}`,
        );
      }

      if (venue.lastSeen === null) {
        venue.lastSeen = newestDate;
        console.log(
          `Fixed null lastSeen for "${venue.name}" with default date ${newestDate}`,
        );
      }
    }
  }

  if (finalDeduplicationCount > 0) {
    console.log(
      `Final deduplication removed ${finalDeduplicationCount} duplicate venues`,
    );
  } else {
    console.log("No additional duplicates found in final check");
  }

  // convert venues Map to array
  const venuesArray = Array.from(venues.values()).map((venue) => {
    // Remove normalizedName from final output as it's just for processing
    const { normalizedName, ...venueWithoutNormalized } = venue;
    return {
      ...venueWithoutNormalized,
      aliases: Array.from(venue.aliases).filter(Boolean),
    };
  });

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

  // Load calendar data before post-processing so it is available
  let calendarData;
  try {
    calendarData = JSON.parse(
      await readFile("./src/data/calendar.json", "utf-8"),
    );
  } catch (e) {
    console.error("Failed to read calendar.json", e);
    calendarData = { shows: [] };
  }

  // --- POST-PROCESS: ENSURE ALL CALENDAR BANDS HAVE VALID ARTIST IDS ---
  // For any band in the calendar with a null id, try spelling correction, normalization, and fuzzy/alias match before creating a new artist
  // Rebuild the artistIdLookup for canonical artist id by normalized name and aliases
  artistIdLookup = new Map();
  for (const artist of artistsArray) {
    artistIdLookup.set(normalizeText(artist.name), artist.id);
    if (artist.aliases) {
      for (const alias of artist.aliases) {
        artistIdLookup.set(normalizeText(alias), artist.id);
      }
    }
  }

  // Helper for fuzzy/alias matching
  function findFuzzyArtistId(name, threshold = 0.85) {
    let bestId = null;
    let bestScore = 0;
    const normalizedName = normalizeText(name);
    for (const artist of artistsArray) {
      const normArtistName = normalizeText(artist.name);
      const distance = levenshteinDistance(normArtistName, normalizedName);
      const maxLength = Math.max(normArtistName.length, normalizedName.length);
      const similarity = maxLength > 0 ? 1 - distance / maxLength : 0;
      if (similarity >= threshold && similarity > bestScore) {
        bestScore = similarity;
        bestId = artist.id;
      }
      if (artist.aliases) {
        for (const alias of artist.aliases) {
          const normAlias = normalizeText(alias);
          const aliasDistance = levenshteinDistance(normAlias, normalizedName);
          const aliasMaxLength = Math.max(
            normAlias.length,
            normalizedName.length,
          );
          const aliasSimilarity =
            aliasMaxLength > 0 ? 1 - aliasDistance / aliasMaxLength : 0;
          if (aliasSimilarity >= threshold && aliasSimilarity > bestScore) {
            bestScore = aliasSimilarity;
            bestId = artist.id;
          }
        }
      }
    }
    return bestId;
  }

  // For each band in each event, if id is null, try to match or create
  for (const show of calendarData.shows) {
    for (const event of show.events) {
      if (Array.isArray(event.bands)) {
        for (const band of event.bands) {
          if (band && band.text && !band.id) {
            // 1. Apply spelling correction
            let candidateName = applySpellingCorrection(band.text, "artist");
            // 2. Normalize
            let normalized = normalizeText(candidateName);
            // 3. Try exact/alias match
            let id = artistIdLookup.get(normalized) || null;
            // 4. Try fuzzy/alias match if still not found
            if (!id) {
              id = findFuzzyArtistId(candidateName, 0.85);
            }
            // 5. If found, assign id and add original as alias if needed
            if (id) {
              band.id = id;
              const artist = artistsArray.find((a) => a.id === id);
              if (artist && !artist.aliases.includes(band.text)) {
                artist.aliases.push(band.text);
              }
            } else {
              // 6. If still not found, create a new artist entry
              const newId = createSlug(candidateName);
              // Prevent non-artist entries from being created
              if (isNonArtist(candidateName)) continue;
              if (!artistsArray.some((a) => a.id === newId)) {
                // Try to merge in spotify data and venues from previous artists data
                let prevArtist = null;
                let prevVenues = [];
                let prevSpotifyUrl = null;
                let prevSpotifyVerified = false;
                let prevSpotifyData = null;
                // Try to find by normalized name or alias
                for (const oldArtist of existingArtistsData.artists || []) {
                  if (
                    normalizeText(oldArtist.name) === normalized ||
                    (oldArtist.aliases &&
                      oldArtist.aliases.map(normalizeText).includes(normalized))
                  ) {
                    prevArtist = oldArtist;
                    prevVenues = oldArtist.venues || [];
                    prevSpotifyUrl = oldArtist.spotifyUrl || null;
                    prevSpotifyVerified = oldArtist.spotifyVerified || false;
                    prevSpotifyData = oldArtist.spotifyData || null;
                    break;
                  }
                }
                // If not found, try to populate venues from this event
                if (!prevVenues || prevVenues.length === 0) {
                  prevVenues = [];
                  if (event.venue && event.venue.text) {
                    // Try to get venue id from mapping or slug
                    let venueId = null;
                    if (event.venue.id) {
                      venueId = event.venue.id;
                    } else {
                      venueId = createSlug(event.venue.text);
                    }
                    prevVenues.push(venueId);
                  }
                }
                artistsArray.push({
                  id: newId,
                  name: candidateName,
                  searchUrl: null,
                  spotifyUrl: prevSpotifyUrl,
                  spotifyVerified: prevSpotifyVerified,
                  spotifyData: prevSpotifyData,
                  firstSeen: show.normalizedDate,
                  lastSeen: show.normalizedDate,
                  venues: prevVenues,
                  aliases: [band.text],
                });
                artistIdLookup.set(normalized, newId);
                band.id = newId;
              } else {
                // fallback: assign anyway if id exists
                band.id = newId;
              }
            }
          }
        }
      }
      // Set event.venue.location from address/city for frontend display
      if (
        event.venue &&
        (event.venue.location === undefined || event.venue.location === null)
      ) {
        const venueObj = venues.get(event.venue.id) || null;
        let address = null;
        let city = null;
        if (venueObj) {
          address = venueObj.address || null;
          city = venueObj.city || null;
        } else {
          // fallback: parse from venue text
          const locInfo = parseVenueLocation(event.venue.text);
          address = locInfo.address;
          city = locInfo.city;
        }
        if (address && city) {
          event.venue.location = `${address}, ${city}`;
        } else if (city) {
          event.venue.location = city;
        } else if (address) {
          event.venue.location = address;
        } else {
          event.venue.location = null;
        }
      }
    }
  }

  // --- SYNC ARTIST IDS TO CALENDAR ---
  // calendarData already loaded above
  // build a lookup for canonical artist id by normalized name and aliases
  // ...existing code uses artistIdLookup defined at top...

  // helper for fuzzy matching
  function findFuzzyArtistId(name, threshold = 0.85) {
    let bestId = null;
    let bestScore = 0;
    const normalizedName = normalizeText(name);
    for (const artist of artistsArray) {
      const normArtistName = normalizeText(artist.name);
      const distance = levenshteinDistance(normArtistName, normalizedName);
      const maxLength = Math.max(normArtistName.length, normalizedName.length);
      const similarity = maxLength > 0 ? 1 - distance / maxLength : 0;
      if (similarity >= threshold && similarity > bestScore) {
        bestScore = similarity;
        bestId = artist.id;
      }
      if (artist.aliases) {
        for (const alias of artist.aliases) {
          const normAlias = normalizeText(alias);
          const aliasDistance = levenshteinDistance(normAlias, normalizedName);
          const aliasMaxLength = Math.max(
            normAlias.length,
            normalizedName.length,
          );
          const aliasSimilarity =
            aliasMaxLength > 0 ? 1 - aliasDistance / aliasMaxLength : 0;
          if (aliasSimilarity >= threshold && aliasSimilarity > bestScore) {
            bestScore = aliasSimilarity;
            bestId = artist.id;
          }
        }
      }
    }
    return bestId;
  }

  // update each band in each event with canonical id, using fuzzy match if needed
  for (const show of calendarData.shows) {
    for (const event of show.events) {
      if (Array.isArray(event.bands)) {
        for (const band of event.bands) {
          if (band && band.text) {
            const normalized = normalizeText(band.text);
            let id = artistIdLookup.get(normalized) || null;
            if (!id) {
              // try fuzzy match
              id = findFuzzyArtistId(band.text, 0.85);
              if (id) {
                // add this misspelling as an alias to the canonical artist
                const artist = artistsArray.find((a) => a.id === id);
                if (artist && !artist.aliases.includes(band.text)) {
                  artist.aliases.push(band.text);
                }
              }
            }
            band.id = id || null;
          }
        }
      }
    }
  }

  // FINAL SYNC: Ensure every band.id in the calendar has a corresponding artist in artistsArray
  const existingArtistIds = new Set(artistsArray.map((a) => a.id));
  for (const show of calendarData.shows) {
    for (const event of show.events) {
      if (Array.isArray(event.bands)) {
        for (const band of event.bands) {
          // Prevent non-artist entries from being created in final sync
          if (
            band &&
            band.id &&
            !existingArtistIds.has(band.id) &&
            !isNonArtist(band.text)
          ) {
            // Try to merge in spotify data and venues from previous artists data
            let prevArtist = null;
            let prevSpotifyUrl = null;
            let prevSpotifyVerified = false;
            let prevSpotifyData = null;
            // Try to find by id, normalized name, or alias
            for (const oldArtist of existingArtistsData.artists || []) {
              if (
                oldArtist.id === band.id ||
                normalizeText(oldArtist.name) === normalizeText(band.text) ||
                (oldArtist.aliases &&
                  oldArtist.aliases
                    .map(normalizeText)
                    .includes(normalizeText(band.text)))
              ) {
                prevArtist = oldArtist;
                prevSpotifyUrl = oldArtist.spotifyUrl || null;
                prevSpotifyVerified = oldArtist.spotifyVerified || false;
                prevSpotifyData = oldArtist.spotifyData || null;
                break;
              }
            }
            // Always scan all events for this artist and collect all unique venue IDs
            const foundVenues = new Set();
            for (const s of calendarData.shows) {
              for (const e of s.events) {
                if (Array.isArray(e.bands)) {
                  for (const b of e.bands) {
                    if (b && b.id === band.id) {
                      if (e.venue && e.venue.text) {
                        let venueId = e.venue.id || createSlug(e.venue.text);
                        foundVenues.add(venueId);
                      }
                    }
                  }
                }
              }
            }
            const venuesArr = Array.from(foundVenues);
            artistsArray.push({
              id: band.id,
              name: band.text,
              searchUrl: null,
              spotifyUrl: prevSpotifyUrl,
              spotifyVerified: prevSpotifyVerified,
              spotifyData: prevSpotifyData,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              venues: venuesArr,
              aliases: [band.text],
            });
            existingArtistIds.add(band.id);
          }
        }
      }
    }
  }

  // FINAL PURGE: Remove any non-artist entries from artistsArray before writing
  for (let i = artistsArray.length - 1; i >= 0; i--) {
    if (isNonArtist(artistsArray[i].name)) {
      artistsArray.splice(i, 1);
    }
  }

  // FINAL SWEEP: Ensure all artists have valid firstSeen and lastSeen dates
  const defaultDate = new Date().toISOString().split("T")[0];
  for (const artist of artistsArray) {
    if (!artist.firstSeen || !artist.lastSeen) {
      let minDate = null;
      let maxDate = null;
      const normalized = normalizeText(artist.name);
      for (const show of calendarData.shows) {
        for (const event of show.events) {
          if (Array.isArray(event.bands)) {
            for (const band of event.bands) {
              if (
                band &&
                normalizeText(band.text) === normalized &&
                show.normalizedDate
              ) {
                if (!minDate || show.normalizedDate < minDate)
                  minDate = show.normalizedDate;
                if (!maxDate || show.normalizedDate > maxDate)
                  maxDate = show.normalizedDate;
              }
            }
          }
        }
      }
      artist.firstSeen = minDate || artist.firstSeen || defaultDate;
      artist.lastSeen = maxDate || artist.lastSeen || defaultDate;
    }
  }

  await writeFile(
    "./src/data/calendar.json",
    JSON.stringify(calendarData, null, 2),
  );

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
