// Entity resolution engine for artists and venues.
// Replaces the scattered fuzzy matching logic from process-databases.js
// with a single, testable, parameterized module.

import {
  normalizeText,
  normalizeForMatching,
  createSlug,
  levenshteinDistance,
  normalizeVenueName,
  parseVenueLocation,
  expandCityAbbreviations,
  isNonArtist,
  isVenueAdministrative,
} from "./normalizers.js";
import type {
  Artist,
  Venue,
  NonArtistFiltersConfig,
  VenueRulesConfig,
  SpellingCorrectionsConfig,
} from "./schemas.js";

// --- Index types ---

export interface EntityIndex {
  byId: Map<string, Artist | Venue>;
  byNormalizedName: Map<string, string>; // normalized name -> id
  byAlias: Map<string, string>; // normalized alias -> id
}

export interface ResolveResult {
  id: string;
  isNew: boolean;
  mergedAliases: string[];
  correctedName?: string; // set if a spelling correction was applied
}

export interface ResolveOptions {
  fuzzyThreshold: number;
  corrections: Record<string, string>; // normalized -> corrected
  specialCases?: Record<
    string,
    { match: string[]; canonicalName: string; address?: string; city?: string }
  >;
  type: "artist" | "venue";
}

// --- Build indexes ---

export function buildArtistIndex(artists: Artist[]): EntityIndex {
  const byId = new Map<string, Artist>();
  const byNormalizedName = new Map<string, string>();
  const byAlias = new Map<string, string>();

  for (const artist of artists) {
    byId.set(artist.id, artist);
    byNormalizedName.set(normalizeText(artist.name), artist.id);
    for (const alias of artist.aliases || []) {
      const normalizedAlias = normalizeText(alias);
      if (!byAlias.has(normalizedAlias)) {
        byAlias.set(normalizedAlias, artist.id);
      }
    }
  }

  return { byId, byNormalizedName, byAlias };
}

export function buildVenueIndex(venues: Venue[]): EntityIndex {
  const byId = new Map<string, Venue>();
  const byNormalizedName = new Map<string, string>();
  const byAlias = new Map<string, string>();

  for (const venue of venues) {
    byId.set(venue.id, venue);
    byNormalizedName.set(normalizeText(venue.name), venue.id);
    for (const alias of venue.aliases || []) {
      const normalizedAlias = normalizeText(alias);
      if (!byAlias.has(normalizedAlias)) {
        byAlias.set(normalizedAlias, venue.id);
      }
    }
  }

  return { byId, byNormalizedName, byAlias };
}

// --- Spelling correction ---

export function applySpellingCorrection(
  text: string,
  corrections: Record<string, string>,
  type: "artist" | "venue" | "city" = "artist",
): string {
  const normalized = normalizeText(text);

  // special case for "1,000 Dreams"
  if (type === "artist" && normalized === "000 dreams") {
    return "1,000 Dreams";
  }

  if (corrections[normalized]) {
    return corrections[normalized];
  }

  return text;
}

// --- Core resolution ---

export function resolveEntity(
  name: string,
  index: EntityIndex,
  options: ResolveOptions,
): ResolveResult {
  // 1. Check special cases first (venue-specific)
  if (options.specialCases) {
    for (const [, spec] of Object.entries(options.specialCases)) {
      if (spec.match.every((keyword) => name.toLowerCase().includes(keyword))) {
        const existingId = index.byNormalizedName.get(
          normalizeText(spec.canonicalName),
        );
        if (existingId) {
          return {
            id: existingId,
            isNew: false,
            mergedAliases: [name],
          };
        }
        return {
          id: createSlug(spec.canonicalName),
          isNew: true,
          mergedAliases: [name],
        };
      }
    }
  }

  // 2. Apply spelling correction
  const correctedName = applySpellingCorrection(
    name,
    options.corrections,
    options.type,
  );
  const normalized = normalizeText(correctedName);

  // 3. Exact match on normalized name
  const exactMatch = index.byNormalizedName.get(normalized);
  if (exactMatch) {
    return {
      id: exactMatch,
      isNew: false,
      mergedAliases: correctedName !== name ? [name] : [],
      correctedName: correctedName !== name ? correctedName : undefined,
    };
  }

  // 4. "The" handling: "The Band" matches "Band" and vice versa
  const normalizedForMatching = normalizeForMatching(correctedName);
  if (normalizedForMatching !== normalized) {
    const theMatch = index.byNormalizedName.get(normalizedForMatching);
    if (theMatch) {
      return {
        id: theMatch,
        isNew: false,
        mergedAliases: [name],
      };
    }
  }

  // 5. Alias match
  const aliasMatch = index.byAlias.get(normalized);
  if (aliasMatch) {
    return {
      id: aliasMatch,
      isNew: false,
      mergedAliases: [],
    };
  }

  // 6. Fuzzy match (Levenshtein distance)
  const fuzzyResult = findFuzzyMatch(
    normalized,
    index,
    options.fuzzyThreshold,
    options.type,
  );
  if (fuzzyResult) {
    return {
      id: fuzzyResult,
      isNew: false,
      mergedAliases: [name],
    };
  }

  // 7. No match found — create new entity
  return {
    id: createSlug(correctedName),
    isNew: true,
    mergedAliases: correctedName !== name ? [name] : [],
    correctedName: correctedName !== name ? correctedName : undefined,
  };
}

function findFuzzyMatch(
  normalizedText: string,
  index: EntityIndex,
  threshold: number,
  type: "artist" | "venue",
): string | null {
  let bestId: string | null = null;
  let bestScore = 0;

  for (const [id, entity] of index.byId.entries()) {
    const entityName = (entity as Artist | Venue).name;
    const normalizedEntity = normalizeText(entityName);

    // skip exact match (already handled)
    if (normalizedEntity === normalizedText) continue;

    // for venues, also try normalized venue name matching
    if (type === "venue") {
      const venue = entity as Venue;
      const venueNormalizedName = venue.address
        ? normalizeText(venue.name)
        : normalizeVenueName(venue.name, {
            stripSuffixes: [],
            stripPrefixes: [],
            ageRestrictions: "",
            citySuffixes: [],
          });

      // address-based matching
      if (venue.address) {
        const normalizedAddress = normalizeText(venue.address);
        if (
          normalizedAddress.length > 5 &&
          normalizedText.includes(normalizedAddress)
        ) {
          return id;
        }
      }

      // skip very short names for fuzzy matching
      if (venueNormalizedName.length < 4) continue;
    }

    // Levenshtein distance
    const distance = levenshteinDistance(normalizedEntity, normalizedText);
    const maxLength = Math.max(normalizedEntity.length, normalizedText.length);
    const similarity = maxLength > 0 ? 1 - distance / maxLength : 0;

    const effectiveThreshold = type === "venue" ? 0.85 : 0.9;

    if (similarity >= effectiveThreshold && similarity > bestScore) {
      bestScore = similarity;
      bestId = id;
    }

    // also check aliases
    const aliases = (entity as Artist | Venue).aliases || [];
    for (const alias of aliases) {
      const normalizedAlias = normalizeText(alias);
      if (normalizedAlias === normalizedText) {
        return id; // exact alias match
      }

      const aliasDistance = levenshteinDistance(normalizedAlias, normalizedText);
      const aliasMaxLength = Math.max(
        normalizedAlias.length,
        normalizedText.length,
      );
      const aliasSimilarity =
        aliasMaxLength > 0 ? 1 - aliasDistance / aliasMaxLength : 0;

      if (aliasSimilarity >= effectiveThreshold && aliasSimilarity > bestScore) {
        bestScore = aliasSimilarity;
        bestId = id;
      }
    }
  }

  return bestId;
}

// --- Merge functions ---

export function mergeArtistData(
  existing: Artist,
  newData: {
    name: string;
    searchUrl?: string | null;
    spotifyUrl?: string | null;
    spotifyVerified?: boolean;
    spotifyData?: any;
    firstSeen: string | null;
    lastSeen: string | null;
    venues: Set<string>;
    aliases: Set<string>;
  },
): Artist {
  // compute date ranges
  let firstSeen = newData.firstSeen;
  let lastSeen = newData.lastSeen;

  if (existing.firstSeen && existing.lastSeen) {
    firstSeen =
      existing.firstSeen < (newData.firstSeen || "")
        ? existing.firstSeen
        : newData.firstSeen || existing.firstSeen;
    lastSeen =
      existing.lastSeen > (newData.lastSeen || "")
        ? existing.lastSeen
        : newData.lastSeen || existing.lastSeen;
  }

  // prefer scraped name unless it's clearly truncated
  let finalName = newData.name;
  if (existing.name && newData.name.length < 3) {
    finalName = existing.name;
  }

  // if we have a verified Spotify name, use it as canonical
  const spotifyName =
    (newData.spotifyVerified && newData.spotifyData?.name) ||
    (existing.spotifyVerified && existing.spotifyData?.spotifyName);

  if (spotifyName && typeof spotifyName === "string" && spotifyName.length > 1) {
    const allAliases = new Set([
      ...existing.aliases,
      ...newData.aliases,
      finalName,
      existing.name,
    ]);
    allAliases.delete(spotifyName);

    return {
      ...existing,
      name: spotifyName,
      searchUrl: existing.searchUrl || newData.searchUrl || null,
      spotifyUrl: existing.spotifyUrl || newData.spotifyUrl || null,
      spotifyVerified: existing.spotifyVerified || newData.spotifyVerified || false,
      spotifyData: existing.spotifyData || newData.spotifyData || null,
      firstSeen: firstSeen || existing.firstSeen,
      lastSeen: lastSeen || existing.lastSeen,
      venues: Array.from(new Set([...existing.venues, ...newData.venues])),
      aliases: Array.from(allAliases),
    };
  }

  return {
    ...existing,
    name: finalName,
    searchUrl: existing.searchUrl || newData.searchUrl || null,
    spotifyUrl: existing.spotifyUrl || newData.spotifyUrl || null,
    spotifyVerified: existing.spotifyVerified || newData.spotifyVerified || false,
    spotifyData: existing.spotifyData || newData.spotifyData || null,
    firstSeen: firstSeen || existing.firstSeen,
    lastSeen: lastSeen || existing.lastSeen,
    venues: Array.from(new Set([...existing.venues, ...newData.venues])),
    aliases: Array.from(new Set([...existing.aliases, ...newData.aliases])),
  };
}

export function mergeVenueData(
  existing: Venue,
  newData: {
    name: string;
    searchUrl?: string | null;
    firstSeen: string | null;
    lastSeen: string | null;
    address?: string | null;
    city?: string | null;
    aliases: Set<string>;
  },
): Venue {
  let firstSeen = newData.firstSeen;
  let lastSeen = newData.lastSeen;

  if (existing.firstSeen && existing.lastSeen) {
    firstSeen =
      existing.firstSeen < (newData.firstSeen || "")
        ? existing.firstSeen
        : newData.firstSeen || existing.firstSeen;
    lastSeen =
      existing.lastSeen > (newData.lastSeen || "")
        ? existing.lastSeen
        : newData.lastSeen || existing.lastSeen;
  }

  return {
    ...existing,
    name: existing.name, // keep existing name
    searchUrl: existing.searchUrl || newData.searchUrl || null,
    firstSeen: firstSeen || existing.firstSeen,
    lastSeen: lastSeen || existing.lastSeen,
    address: newData.address || existing.address || null,
    city: newData.city || existing.city || null,
    aliases: Array.from(new Set([...existing.aliases, ...newData.aliases])),
  };
}

// --- Venue ID resolution ---

export function buildVenueIdResolutionMap(venues: Venue[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const venue of venues) {
    map.set(venue.id, venue.id);
    for (const alias of venue.aliases || []) {
      const potentialOldId = createSlug(alias);
      if (!map.has(potentialOldId)) {
        map.set(potentialOldId, venue.id);
      }
    }
  }

  return map;
}

export function resolveVenueId(venueId: string, resolutionMap: Map<string, string>): string {
  return resolutionMap.get(venueId) || venueId;
}

// --- Data retention ---

export function filterExpiredEntities(
  entities: (Artist | Venue)[],
  activeIds: Set<string>,
  retentionDate: string,
): (Artist | Venue)[] {
  return entities.filter((entity) => {
    // keep if currently active
    if (activeIds.has(entity.id)) return true;
    // keep if seen within retention window
    if (entity.lastSeen && entity.lastSeen >= retentionDate) return true;
    // remove if expired
    return false;
  });
}