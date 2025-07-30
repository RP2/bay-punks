# Utility Functions Refactoring Analysis

## Current State Analysis

### Functions Already in `shared-utils.js` ✅

- `normalizeText(text)` - basic text normalization
- `normalizeForMatching(text)` - flexible "the" handling
- `createSlug(text)` - URL-friendly slugs
- `levenshteinDistance(str1, str2)` - fuzzy matching
- `isNonArtist(artistName)` - basic non-artist detection
- `cleanArtistName(name)` - remove common prefixes/suffixes
- `shouldExcludeArtist(name)` - comprehensive artist exclusion
- `normalizeVenueName(text)` - venue name normalization
- `isSpecialCaseVenue(venueName)` - special venue handling
- `expandCityAbbreviations(locationText)` - city abbreviation expansion
- `parseVenueLocation(venueName)` - venue location parsing

### Functions Duplicated in Scripts (Need to be removed) ❌

#### For `scripts/process-databases.js`

- `normalizeText(text)` - DUPLICATE
- `normalizeForMatching(text)` - DUPLICATE
- `createSlug(text)` - DUPLICATE
- `levenshteinDistance(str1, str2)` - DUPLICATE
- `isNonArtist(artistName)` - ENHANCED VERSION (has NON_ARTIST_FILTERS)
- `normalizeVenueName(text)` - DUPLICATE
- `isSpecialCaseVenue(venueName)` - DUPLICATE
- `parseVenueLocation(venueName)` - DUPLICATE
- `expandCityAbbreviations(locationText)` - DUPLICATE

#### For `scripts/spotify-verify.js`

- `isNonArtist(artistName)` - DUPLICATE (simplified version)

#### For `scripts/generate-calendar.js`

- `normalizeText(text)` - DUPLICATE
- `findArtistId(artistName, processedArtists)` - LOCAL VERSION
- `findVenueId(venueName, processedVenues)` - LOCAL VERSION

#### For Astro Components

- `src/components/ArtistList.astro` - `normalizeText(text)` - DUPLICATE
- `src/components/VenueList.astro` - `normalizeText(text)` - DUPLICATE

### Functions Unique to Scripts (Need to be moved/consolidated) 🔄

#### The `scripts/process-databases.js`

- `getPreferredArtistName(scrapedName, existingName, aliases)` - UNIQUE
- `applySpellingCorrection(text, type)` - UNIQUE
- `findFuzzyMatch(map, normalizedText, type)` - UNIQUE
- `mergeArtistData(existing, newData)` - UNIQUE
- `mergeVenueData(existing, newData)` - UNIQUE
- `isVenueAdministrative(artist, venues)` - UNIQUE
- `NON_ARTIST_FILTERS` array - UNIQUE (enhanced filtering)
- `NON_ARTIST_PATTERNS` array - UNIQUE
- `CANCELLED_PATTERNS` array - UNIQUE

#### The `scripts/spotify-verify.js`

- `getVerificationStatus(artist)` - UNIQUE
- `delay(ms)` - UNIQUE
- `isVenueAdministrative(artist)` - UNIQUE (different implementation)

#### The `scripts/generate-calendar.js`

- Local `findArtistId` and `findVenueId` implementations

### Functions Already in `data-utils.js` ✅

- `findVenueId(venueName)` - async version
- `findArtistId(artistName)` - async version
- `getVenueId(venue)` - wrapper
- `getArtistId(artist)` - wrapper
- `findVenueIdSync(venueName, venuesData)` - sync version
- `findArtistIdSync(artistName, artistsData)` - sync version

## Refactoring Plan

### Phase 1: Enhance `shared-utils.js` with Missing Functions

1. Add `NON_ARTIST_FILTERS`, `NON_ARTIST_PATTERNS`, `CANCELLED_PATTERNS` arrays
2. Enhance `isNonArtist()` to use these arrays
3. Add `isVenueAdministrative()` function
4. Add `getPreferredArtistName()` function
5. Add `applySpellingCorrection()` function
6. Add `findFuzzyMatch()` function
7. Add `mergeArtistData()` and `mergeVenueData()` functions

### Phase 2: Update Import Statements

1. Update `scripts/process-databases.js` to import from shared-utils
2. Update `scripts/spotify-verify.js` to import from shared-utils
3. Update `scripts/generate-calendar.js` to import from shared-utils and data-utils
4. Update Astro components to import from shared-utils

### Phase 3: Remove Duplicate Functions

1. Remove duplicated functions from all script files
2. Remove duplicated functions from Astro components
3. Test that everything still works

## Files That Need Changes

### Import Updates

- `scripts/process-databases.js` - add imports, remove duplicates
- `scripts/spotify-verify.js` - add imports, remove duplicates
- `scripts/generate-calendar.js` - add imports, remove duplicates
- `src/components/ArtistList.astro` - add import, remove duplicate
- `src/components/VenueList.astro` - add import, remove duplicate

### No Changes Needed

- `src/lib/data-utils.ts` - already imports from shared-utils
- `scripts/data-utils.js` - already imports from shared-utils
