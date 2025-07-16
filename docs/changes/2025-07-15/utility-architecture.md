# Utility Files Architecture Overview

## Current Structure & Purpose

### 1. `src/lib/shared-utils.js` (JavaScript - Cross-Platform)

**Purpose**: Basic utility functions that can be shared between frontend (Astro) and backend (Node.js scripts)

**Current Functions**:

- `normalizeText()` - Basic text normalization
- `normalizeForMatching()` - Flexible "the" handling
- `createSlug()` - URL-friendly slugs
- `levenshteinDistance()` - Fuzzy matching distance calculation
- `isNonArtist()` - Basic non-artist detection (regex-based)
- `cleanArtistName()` - Remove common prefixes/suffixes
- `shouldExcludeArtist()` - Comprehensive artist exclusion
- `normalizeVenueName()` - Venue name normalization
- `isSpecialCaseVenue()` - Special venue handling
- `expandCityAbbreviations()` - City abbreviation expansion
- `parseVenueLocation()` - Venue location parsing

**Used By**:

- ✅ `src/lib/data-utils.ts` (imports `normalizeText`)
- ✅ `scripts/data-utils.js` (imports `normalizeText`)
- ❌ Should be used by Astro components (currently have duplicates)
- ❌ Should be used by scripts (currently have duplicates)

### 2. `src/lib/data-utils.ts` (TypeScript - Frontend Only)

**Purpose**: Frontend-specific data lookup functions for Astro components

**Current Functions**:

- `findVenueId()` - Find venue ID by name (uses imported JSON)
- `findArtistId()` - Find artist ID by name (uses imported JSON)
- `getVenueId()` - Wrapper for venue ID lookup
- `getArtistId()` - Wrapper for artist ID lookup

**Used By**:

- ✅ `src/pages/artist/[slug].astro`
- ✅ `src/pages/day/[slug].astro`
- ✅ `src/pages/venue/[slug].astro`
- ✅ `src/components/Day.astro`

### 3. `scripts/data-utils.js` (JavaScript - Node.js Scripts Only)

**Purpose**: Node.js script utilities for async file operations and data lookup

**Current Functions**:

- `loadVenuesData()` - Async load venues from file
- `loadArtistsData()` - Async load artists from file
- `findVenueId()` - Async venue ID lookup
- `findArtistId()` - Async artist ID lookup
- `getVenueId()` - Async wrapper
- `getArtistId()` - Async wrapper
- `findVenueIdSync()` - Sync venue ID lookup (with pre-loaded data)
- `findArtistIdSync()` - Sync artist ID lookup (with pre-loaded data)

**Used By**:

- ❌ Not currently used by any scripts (should be used by `generate-calendar.js`)

### 4. `src/lib/utils.ts` (TypeScript - Frontend Only)

**Purpose**: Frontend utility for className merging (shadcn/ui)

**Current Functions**:

- `cn()` - Merge className values using clsx and tailwind-merge

**Used By**:

- ✅ All shadcn/ui components
- ✅ All React components

## Problems Identified

### 1. Massive Code Duplication

- `normalizeText()` is duplicated in 6+ files
- `isNonArtist()` is duplicated in 3+ files
- `createSlug()` is duplicated in 2+ files
- Data lookup functions are duplicated in multiple files

### 2. Inconsistent Implementations

- `isNonArtist()` in shared-utils.js is basic (regex-based)
- `isNonArtist()` in process-databases.js is enhanced (with comprehensive arrays)
- Data lookup functions have different implementations

### 3. Unclear Boundaries

- Script-specific functionality mixed with reusable utilities
- No clear separation between frontend and backend utilities

## Proposed Solution

### Phase 1: Enhance shared-utils.js (Cross-Platform Core)

**Add missing but reusable functions:**

- Enhanced `isNonArtist()` with comprehensive filtering
- `isVenueAdministrative()` for venue-specific filtering
- Export filter arrays as constants for reuse

### Phase 2: Keep data-utils.ts (Frontend-Specific)

**Purpose**: TypeScript utilities for frontend components only

- Keep existing functions (they're frontend-specific)
- Import from shared-utils.js where appropriate

### Phase 3: Enhance scripts/data-utils.js (Node.js-Specific)

**Purpose**: Node.js utilities for scripts only

- Keep async file operations
- Import from shared-utils.js where appropriate
- Actually use this in scripts

### Phase 4: Clean Up Duplicates

**Remove duplicate implementations from:**

- All script files
- All Astro components
- Ensure consistent imports

## File Usage Matrix

| Function           | shared-utils.js | data-utils.ts | scripts/data-utils.js |
| ------------------ | --------------- | ------------- | --------------------- |
| `normalizeText()`  | ✅ Core         | Import        | Import                |
| `createSlug()`     | ✅ Core         | Import        | Import                |
| `isNonArtist()`    | ✅ Enhanced     | Import        | Import                |
| `findVenueId()`    | ❌              | ✅ Frontend   | ✅ Node.js            |
| `findArtistId()`   | ❌              | ✅ Frontend   | ✅ Node.js            |
| `loadVenuesData()` | ❌              | ❌            | ✅ Node.js            |
| `cn()`             | ❌              | ❌            | ❌ (utils.ts)         |

## Next Steps

1. **Enhance shared-utils.js** with missing reusable functions
2. **Update imports** in data-utils files to use shared-utils
3. **Refactor scripts** to use data-utils.js instead of duplicating functions
4. **Update Astro components** to import from shared-utils
5. **Remove all duplicate implementations**

This approach maintains clear boundaries while maximizing code reuse and consistency.
