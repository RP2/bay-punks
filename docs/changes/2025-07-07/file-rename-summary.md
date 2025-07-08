# File Rename Update: concerts.json → raw.json

## Summary

Updated all references from `concerts.json` to `raw.json` to better reflect that this file contains the initial scraped data before processing.

## Files Updated

### ✅ Active Scripts

- **`scripts/process-databases.js`** - Updated file path and comment
- **`scripts/scrape-concerts.js`** - Updated output path and log message

### ✅ Astro Components

- **`src/components/ArtistList.astro`** - Updated import path
- **`src/components/VenueList.astro`** - Updated import path

### ✅ Astro Pages

- **`src/pages/index.astro`** - Updated import path
- **`src/pages/artist/[slug].astro`** - Updated import path
- **`src/pages/day/[slug].astro`** - Updated import path
- **`src/pages/venue/[slug].astro`** - Updated import path

### ✅ GitHub Actions

- **`.github/workflows/weekly-automation.yml`** - Updated backup file reference

### ✅ Documentation

- **`docs/database-management.md`** - Updated reference in cleanup description

## Files NOT Updated (Intentionally)

### 📁 Backup Scripts

- `scripts/backup/**/*.js` - These are inactive backups, no need to update
- `scripts/backup/redundant-cleanup-scripts/*.js` - Already moved to backup

### 📄 Other Documentation

- Most documentation refers to "concert data" generally, not specific filenames
- Only updated docs that specifically mentioned the filename

## Data Flow After Update

```text
🕷️  scrape-concerts.js
     ↓
📄  src/data/raw.json (raw scraped data)
     ↓
🔄  process-databases.js
     ↓
📄  src/data/artists.json + src/data/venues.json (processed data)
     ↓
🌐  Astro components (import raw.json for concert listings)
```

## Verification

- ✅ `raw.json` file exists in `src/data/`
- ✅ All import paths updated in Astro files
- ✅ All script file paths updated
- ✅ GitHub Actions workflow updated
- ✅ No breaking changes to functionality

The rename makes the data flow clearer:

- **`raw.json`** = Initial scraped data (input)
- **`artists.json`** = Processed artist database (output)
- **`venues.json`** = Processed venue database (output)
