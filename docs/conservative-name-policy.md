# Conservative Artist Name Policy

## Overview

The Bay Punks database now uses an ultra-conservative approach to artist names to prevent unwanted name changes.

## Key Principles

### 1. Scraped Names Are Sacred

- **The name on the venue listing is always used** - This is what's actually being promoted
- No automatic spelling corrections or transformations
- No removal of "the" or other stylistic changes

### 2. Exact Duplicate Detection with "The" Flexibility

- Only merges artists if names are exactly the same (ignoring case/punctuation)
- Special handling for "The" prefix: "The Clash" matches "Clash" for deduplication
- When merging, always keeps the scraped name (never changes it)
- No fuzzy matching or similarity-based merging

### 3. Unified Spotify Script

- **`spotify-verify.js`** handles all verification scenarios while preserving scraped names
- Never changes artist names during verification process
- Spotify's official name stored separately in `spotifyData.spotifyName`
- Supports `--new`, `--failed`, and `--force` modes

### 4. Spelling Corrections Removed

- Removed problematic spelling corrections that changed "The Clash" to "Clash"
- Only kept true typo fixes like "blink182" to "blink-182"
- Artists: No spelling corrections applied during processing
- Venues: Limited to clear standardizations only

## Examples of What Changed

### Before (Problematic)

- "The Clash" → "Clash" (removed "the")
- "Rumors of Fleetwood Mac" → might get changed via Spotify matching
- Various abbreviations expanded automatically

### After (Conservative)

- "The Clash" stays "The Clash"
- "Rumors of Fleetwood Mac" stays exactly as listed
- Only merges obvious duplicates with 95%+ similarity

## Benefits

- Artist names match exactly what venues are promoting
- No surprises or unexpected name changes
- More accurate representation of how bands are actually billed
- Preserves tribute band names, local variations, etc.

## Files Updated

- `scripts/process-databases.js` - Main processing logic with conservative deduplication
- `scripts/spotify-verify.js` - Unified Spotify verification preserving names
- `src/data/spelling-corrections.json` - Reduced to minimal typo fixes only
