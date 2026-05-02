// Pure utility functions shared between pipeline and frontend.
// No side effects, no config dependencies.

// --- Text normalization ---

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

export function normalizeForMatching(text: string): string {
  let normalized = normalizeText(text);
  if (normalized.startsWith("the ")) {
    normalized = normalized.substring(4);
  }
  return normalized;
}

export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// --- Date utilities ---

export function getPacificDateISO(): string {
  const today = new Date();
  const pacificDate = new Date(
    today.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  return (
    pacificDate.getFullYear() +
    "-" +
    String(pacificDate.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(pacificDate.getDate()).padStart(2, "0")
  );
}

// --- Fuzzy matching ---

export function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
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

// --- Artist name cleaning ---

export function cleanArtistName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, "") // remove parenthetical text
    .trim();
}

// --- City abbreviation expansion ---

export function expandCityAbbreviations(
  locationText: string,
  abbreviations: Record<string, string>,
): string {
  if (!locationText) return locationText;

  const normalized = locationText.toLowerCase().trim();
  return abbreviations[normalized] || locationText;
}

// --- Non-artist filtering ---

export interface NonArtistFilters {
  exact: string[];
  patterns: string[];
  maxLength: number;
  maxSentences: number;
}

export function isNonArtist(
  artistName: string,
  filters: NonArtistFilters,
): boolean {
  const normalized = artistName.toLowerCase().trim();

  // comedian marker
  if (/\(comedian\)/i.test(artistName)) return true;

  // exact matches
  if (filters.exact.includes(normalized)) return true;

  // pattern matches (compile once per call, acceptable for pipeline)
  for (const pattern of filters.patterns) {
    try {
      if (new RegExp(pattern, "i").test(artistName)) return true;
    } catch {
      // skip invalid patterns
    }
  }

  // length filter
  if (artistName.length > filters.maxLength) return true;

  // multi-sentence filter
  if (
    artistName.includes(". ") &&
    artistName.split(". ").length > filters.maxSentences
  )
    return true;

  return false;
}

export function isVenueAdministrative(
  artistName: string,
  venueNames: string[],
): boolean {
  if (venueNames.length === 1) {
    const venueName = venueNames[0].toLowerCase();
    const name = artistName.toLowerCase();
    if (venueName.includes("924 gilman") && name.includes("meeting")) {
      return true;
    }
  }
  return false;
}

// --- Venue name normalization (for deduplication) ---

export function normalizeVenueName(
  text: string,
  rules: {
    stripSuffixes: string[];
    stripPrefixes: string[];
    ageRestrictions: string;
    citySuffixes: string[];
  },
): string {
  let normalized = normalizeText(text);

  // abbreviations for street types
  normalized = normalized
    .replace(/\bst\b|\bstreet\b/g, "st")
    .replace(/\bave\b|\bavenue\b/g, "ave")
    .replace(/\brd\b|\broad\b/g, "rd")
    .replace(/\bblvd\b|\bboulevard\b/g, "blvd")
    .replace(/\bdr\b|\bdrive\b/g, "dr")
    .replace(/\bln\b|\blane\b/g, "ln");

  // remove age restrictions
  normalized = normalized.replace(new RegExp(rules.ageRestrictions, "g"), "");
  normalized = normalized.replace(/\ball ages\b/g, "");

  // remove common non-identifying suffixes
  normalized = normalized.replace(/\bsold out\b/g, "");
  normalized = normalized.replace(/\bpresents\b/g, "");

  // remove city name suffixes (after comma)
  normalized = normalized.replace(/\s*,\s*[a-z\s.]+$/i, "");
  normalized = normalized.replace(/,\s*$/, "");

  // remove business type suffixes
  const suffixPattern = new RegExp(
    `\\b(${rules.stripSuffixes.join("|")})\\b$`,
    "gi",
  );
  normalized = normalized.replace(suffixPattern, "").trim();

  // remove common prefixes
  const prefixPattern = new RegExp(
    `^(${rules.stripPrefixes.join("|")})`,
    "gi",
  );
  normalized = normalized.replace(prefixPattern, "").trim();

  return normalized.trim();
}

// --- Venue location parsing ---

export function parseVenueLocation(
  venueName: string,
  cityAbbreviations: Record<string, string>,
): { address: string | null; city: string | null } {
  let cleaned = venueName;

  // remove age restrictions
  const ageMatch = cleaned.match(/(\d+[\+\-])(\s|$)/);
  if (ageMatch) {
    cleaned = cleaned.replace(ageMatch[0], "").trim();
  }

  const parts = cleaned.split(",").map((p) => p.trim());

  if (parts.length >= 3) {
    return {
      address: parts[1],
      city: expandCityAbbreviations(parts[2], cityAbbreviations),
    };
  }

  if (parts.length === 2) {
    const first = parts[0];
    const second = parts[1];

    const firstIsAddress =
      /\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Plaza|Court|Ct)/.test(
        first,
      );
    const secondIsAddress =
      /\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Plaza|Court|Ct)/.test(
        second,
      );

    if (firstIsAddress && !secondIsAddress) {
      return {
        address: first,
        city: expandCityAbbreviations(second, cityAbbreviations),
      };
    }
    if (secondIsAddress) {
      return { address: second, city: null };
    }
    return {
      address: null,
      city: expandCityAbbreviations(second, cityAbbreviations),
    };
  }

  return { address: null, city: null };
}

// --- Date normalization (for scraping) ---

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

export interface DateContext {
  lastDate: { year: number; monthNum: number; fullDate: string } | null;
}

export function normalizeDate(day: string, context: DateContext): string {
  const parts = day.toLowerCase().split(" ");
  const monthAbbr = parts[1];
  const dayNumber = parts[2];
  const month = MONTHS[monthAbbr];
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(dayNumber, 10);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  let year: number;

  if (!context.lastDate) {
    const candidates = [currentYear - 1, currentYear, currentYear + 1];
    let bestYear = currentYear;
    let bestDistance = Infinity;

    for (const candidateYear of candidates) {
      const candidateDate = new Date(candidateYear, monthNum - 1, dayNum);
      const today = new Date(currentYear, currentMonth - 1, currentDay);
      const distance = Math.abs(candidateDate.getTime() - today.getTime());
      if (distance < bestDistance) {
        bestDistance = distance;
        bestYear = candidateYear;
      }
    }
    year = bestYear;
  } else {
    year = context.lastDate.year;
    if (monthNum < context.lastDate.monthNum) {
      year = context.lastDate.year + 1;
    }
  }

  const fullDate = `${year}-${month}-${String(dayNumber).padStart(2, "0")}`;
  context.lastDate = { year, monthNum, fullDate };

  return fullDate;
}