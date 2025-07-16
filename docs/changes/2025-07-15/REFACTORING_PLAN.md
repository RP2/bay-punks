# Script Refactoring Opportunities

## Summary of Duplicated Functions Found

### 1. **Text Normalization Functions** (Found in multiple scripts)

- `normalizeText()` - Found in: process-databases.js, generate-calendar.js, spotify-verify.js
- `normalizeForMatching()` - Found in: process-databases.js
- `createSlug()` - Found in: process-databases.js
- **✅ SOLUTION**: All moved to `src/lib/shared-utils.js`

### 2. **Fuzzy Matching Functions**

- `levenshteinDistance()` - Found in: process-databases.js
- `findFuzzyMatch()` - Found in: process-databases.js
- **✅ SOLUTION**: Moved to `src/lib/shared-utils.js`

### 3. **Artist/Venue ID Finding Functions**

- `findArtistId()` - Found in: generate-calendar.js, process-databases.js (similar logic)
- `findVenueId()` - Found in: generate-calendar.js, process-databases.js (similar logic)
- **✅ SOLUTION**: Standardized versions created in `scripts/data-utils.js`

### 4. **Validation Functions**

- `isNonArtist()` - Found in: process-databases.js, spotify-verify.js
- `cleanArtistName()` - Found in: scrape-concerts.js
- `shouldExcludeArtist()` - Found in: scrape-concerts.js
- **✅ SOLUTION**: All moved to `src/lib/shared-utils.js`

### 5. **Venue Processing Functions**

- `normalizeVenueName()` - Found in: process-databases.js
- `parseVenueLocation()` - Found in: process-databases.js
- `isSpecialCaseVenue()` - Found in: process-databases.js
- `expandCityAbbreviations()` - Found in: process-databases.js
- **✅ SOLUTION**: All moved to `src/lib/shared-utils.js`

## Files Created

### 1. `src/lib/shared-utils.js`

**Purpose**: Universal utilities that work in both browser and Node.js
**Contains**:

- Text normalization functions
- Fuzzy matching algorithms
- Artist/venue validation
- Name cleaning and processing
- Location parsing

### 2. `scripts/data-utils.js`

**Purpose**: Node.js specific data utilities for scripts
**Contains**:

- Async data loading functions
- ID finding functions that work with script data
- Synchronous versions for already-loaded data

### 3. Updated `src/lib/data-utils.ts`

**Purpose**: Browser-specific data utilities (TypeScript)
**Contains**:

- Frontend-optimized ID finding functions
- Uses shared utilities for text processing

## Refactoring Recommendations

### High Priority (Immediate Benefits)

1. **generate-calendar.js**: Replace duplicate `normalizeText()` and ID finding functions
2. **process-databases.js**: Replace all text processing functions with shared utilities
3. **spotify-verify.js**: Replace `normalizeText()` with shared utility

### Medium Priority (Code Quality)

1. **scrape-concerts.js**: Use shared artist validation functions
2. **process-databases.js**: Use shared venue processing functions

### Low Priority (Nice to Have)

1. Create a shared Spotify utilities module for common API patterns
2. Extract common file I/O patterns into utilities

## Example Usage

### Before (in scripts):

```javascript
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function findArtistId(artistName, artists) {
  const normalized = normalizeText(artistName);
  return artists.find((a) => normalizeText(a.name) === normalized)?.id || null;
}
```

### After (in scripts):

```javascript
import { normalizeText } from "../src/lib/shared-utils.js";
import { findArtistIdSync } from "./data-utils.js";

// Use shared utilities
const artistId = findArtistIdSync(artistName, artistsData);
```

## Benefits of This Refactoring

1. **Consistency**: All text normalization uses the same logic
2. **Maintainability**: Fix a bug once, it's fixed everywhere
3. **Testability**: Shared utilities can be unit tested
4. **Performance**: Reduced code duplication
5. **Type Safety**: Frontend utilities are TypeScript typed
6. **Reusability**: Scripts and frontend use the same core logic

## Next Steps

1. Update `generate-calendar.js` to use `scripts/data-utils.js`
2. Update `process-databases.js` to use `src/lib/shared-utils.js`
3. Consider creating a shared Spotify utilities module
4. Add unit tests for the shared utilities
