// comprehensive utilities that can be shared between frontend and scripts

// ===== TEXT NORMALIZATION =====

// helper to normalize text (remove special characters, lowercase)
export function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// helper to normalize text with flexible "the" handling for artist matching
export function normalizeForMatching(text) {
  let normalized = normalizeText(text);

  // remove "the" prefix for flexible matching (both "The Band" and "Band" match)
  if (normalized.startsWith("the ")) {
    normalized = normalized.substring(4);
  }

  return normalized;
}

// helper to create a unique slug
export function createSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// ===== FUZZY MATCHING =====

// helper to calculate levenshtein distance for fuzzy matching
export function levenshteinDistance(str1, str2) {
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

// ===== ARTIST/VENUE VALIDATION =====

// comprehensive filters for non-artist entries
export const NON_ARTIST_FILTERS = [
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
export const NON_ARTIST_PATTERNS = [
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

export const CANCELLED_PATTERNS = [
  /^cancelled:/i,
  /^canceled:/i,
  /^probably cancelled:/i,
  /^postponed:/i,
  /^moved:/i,
  /^rescheduled:/i,
];

// helper to check if a name is a non-artist (enhanced version)
export function isNonArtist(artistName) {
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

  // legacy regex patterns for backward compatibility
  const name = artistName.toLowerCase().trim();

  // time patterns
  if (/^\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/.test(name)) return true;
  if (
    /^\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\s*-\s*\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/.test(
      name,
    )
  )
    return true;

  // price patterns
  if (/^\$\d+(\.\d{2})?(\s*-\s*\$\d+(\.\d{2})?)?$/.test(name)) return true;
  if (/^\$\d+(\.\d{2})?\s*\/\s*\$\d+(\.\d{2})?$/.test(name)) return true;

  // additional legacy patterns
  const legacyPatterns = [
    /^(free|sold out|cancelled|postponed|tbd|tbh|tba)$/,
    /^(doors?|show|music|live|event|concert|performance)\s*(at|@)?\s*\d/,
    /^(early show|late show|matinee|all ages|21\+|18\+|over \d+)$/,
    /^(advance|presale|at door|online|tickets?)$/,
    /^(info|information|details|more info|website|link)$/,
    /^(featuring|feat\.|ft\.|with|w\/|and|&|\+)$/,
    /^(dj|mc|host|hosted by|presents?|proudly presents?)$/,
    /^(special guests?|surprise guests?|more tba|lineup tba)$/,
    /^(opening|opener|support|supporting)$/,
  ];

  return legacyPatterns.some((pattern) => pattern.test(name));
}

// helper to check if an entry is venue-specific administrative content
export function isVenueAdministrative(artist, venues = null) {
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

// ===== ARTIST NAME PROCESSING =====

// helper to clean artist names (remove common prefixes/suffixes)
export function cleanArtistName(name) {
  let cleaned = name.trim();

  // remove common prefixes
  const prefixes = [
    /^(dj|mc|the|a|an)\s+/i,
    /^(feat\.|featuring|ft\.|with|w\/)\s+/i,
  ];

  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, "");
  }

  // remove common suffixes
  const suffixes = [
    /\s+(band|group|duo|trio|quartet|quintet|orchestra|ensemble)$/i,
    /\s+(live|acoustic|electric|unplugged)$/i,
    /\s+(dj\s+set|live\s+set|performance)$/i,
  ];

  for (const suffix of suffixes) {
    cleaned = cleaned.replace(suffix, "");
  }

  return cleaned.trim();
}

// helper to check if an artist name should be excluded
export function shouldExcludeArtist(name) {
  const cleaned = cleanArtistName(name);

  // exclude if it becomes empty after cleaning
  if (!cleaned || cleaned.length < 2) return true;

  // exclude if it's a non-artist
  if (isNonArtist(cleaned)) return true;

  // exclude common venue-related terms
  const venueTerms = [
    /^(venue|location|address|directions)$/i,
    /^(parking|valet|street parking)$/i,
    /^(food|drinks|bar|kitchen|menu)$/i,
    /^(capacity|seating|standing room)$/i,
  ];

  return venueTerms.some((term) => term.test(cleaned));
}

// helper to get preferred artist name (for data processing)
export function getPreferredArtistName(
  scrapedName,
  existingName,
  aliases = [],
) {
  // ALWAYS prefer the scraped name (what's actually being promoted/listed)
  // the scraped name is what the venue/promoter is using, so it's the most accurate

  // only use existing name if scraped name is clearly incomplete or truncated
  if (existingName && scrapedName.length < 3) {
    return existingName;
  }

  // otherwise, always use the scraped name
  return scrapedName;
}

// helper to apply spelling corrections (requires corrections object)
export function applySpellingCorrection(text, corrections, type = "artist") {
  const normalized = normalizeText(text);

  // special case for "1,000 Dreams" - handle the "000 Dreams" variant
  if (type === "artist" && normalized === "000 dreams") {
    return "1,000 Dreams";
  }

  // only check for exact spelling correction matches (be very conservative)
  if (corrections && corrections[normalized]) {
    return corrections[normalized];
  }

  // return original text if no exact correction found
  return text;
}

// ===== VENUE PROCESSING =====

// helper to normalize venue names (more aggressive than general text normalization)
export function normalizeVenueName(text) {
  let normalized = normalizeText(text);

  // remove common venue suffixes that don't affect identity
  const suffixes = [
    /\s+(venue|hall|center|centre|theatre|theater|club|bar|pub|lounge|cafe|restaurant)$/,
    /\s+(sf|san francisco|oakland|berkeley|san jose|palo alto|mountain view)$/,
    /\s+(ca|california|bay area)$/,
  ];

  for (const suffix of suffixes) {
    normalized = normalized.replace(suffix, "");
  }

  return normalized.trim();
}

// helper to check if a venue name is a special case that should be handled differently
export function isSpecialCaseVenue(venueName) {
  const name = venueName.toLowerCase().trim();

  // venues that are commonly confused or have similar names
  const specialCases = [
    /^(the|a|an)\s+/,
    /\s+(the|a|an)$/,
    /\s+(north|south|east|west|downtown|uptown)$/,
    /\s+(old|new|original|classic)$/,
  ];

  return specialCases.some((pattern) => pattern.test(name));
}

// ===== CITY/LOCATION PROCESSING =====

// helper to expand common city abbreviations
export function expandCityAbbreviations(locationText) {
  const abbreviations = {
    sf: "San Francisco",
    "s.f.": "San Francisco",
    "san fran": "San Francisco",
    frisco: "San Francisco",
    oak: "Oakland",
    berk: "Berkeley",
    berkeley: "Berkeley",
    sj: "San Jose",
    "san jose": "San Jose",
    mv: "Mountain View",
    pa: "Palo Alto",
    "palo alto": "Palo Alto",
    "redwood city": "Redwood City",
    rc: "Redwood City",
  };

  const normalized = locationText.toLowerCase().trim();
  return abbreviations[normalized] || locationText;
}

// helper to parse venue location information
export function parseVenueLocation(venueName) {
  // common patterns for venue names with location
  const patterns = [
    /^(.+?),\s*(.+?)$/, // "Venue Name, City"
    /^(.+?)\s+@\s+(.+?)$/, // "Venue Name @ Location"
    /^(.+?)\s+in\s+(.+?)$/, // "Venue Name in City"
    /^(.+?)\s+-\s+(.+?)$/, // "Venue Name - City"
  ];

  for (const pattern of patterns) {
    const match = venueName.match(pattern);
    if (match) {
      return {
        venueName: match[1].trim(),
        location: expandCityAbbreviations(match[2].trim()),
      };
    }
  }

  return {
    venueName: venueName.trim(),
    location: null,
  };
}
