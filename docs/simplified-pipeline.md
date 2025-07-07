# Bay Punks Data Pipeline - Simplified

## Overview

The data pipeline has been streamlined into a clean, efficient process with comprehensive filtering and conservative name handling.

## Data Flow

```mermaid
🕷️  scrape-concerts.js
    ↓
📄  src/data/raw.json (raw scraped data)
    ↓
🔄  process-databases.js (unified processing + filtering + cleanup)
    ↓
📄  src/data/artists.json + src/data/venues.json (clean databases)
    ↓
🎵  spotify-verify.js (optional verification)
    ↓
📄  Enhanced artists.json with Spotify data
```

## Scripts

### 1. 🕷️ Data Collection

```bash
node scripts/scrape-concerts.js
```

- Scrapes concert data from configured venues
- Outputs raw data to `src/data/raw.json`
- Basic filtering during collection

### 2. 🔄 Unified Processing

```bash
node scripts/process-databases.js
```

- **Reads** raw data from `raw.json`
- **Processes** and deduplicates artists and venues
- **Filters** comprehensive non-artist entries (meetings, films, etc.)
- **Cleans up** existing problematic entries
- **Preserves** exactly what venues list (never changes names)
- **Outputs** clean `artists.json` and `venues.json`
- **Conservative matching** (exact + flexible "The" handling only)

### 3. 🎵 Spotify Verification (Optional)

```bash
# Verify new artists only
node scripts/spotify-verify.js --new

# Recheck previously failed artists
node scripts/spotify-verify.js --failed

# Force recheck everything
node scripts/spotify-verify.js --force
```

- **Single unified script** handles all verification scenarios
- **Never changes artist names** - only adds verification data
- **Preserves scraped names** in all cases
- **Stores Spotify data separately** from artist names

## Simple Workflow

**For daily use:**

1. **Scrape**: `node scripts/scrape-concerts.js`
2. **Process**: `node scripts/process-databases.js` (includes all cleanup)
3. **Verify**: `node scripts/spotify-verify.js --new`
4. **Done!**

**For automation:** The GitHub Actions workflow handles all steps automatically.

## Key Improvements

### 🎯 **Unified Processing**

- Single script (`process-databases.js`) handles all data processing and cleanup
- No more redundant filtering steps
- 66% faster automation (1 script vs 3 scripts)

### 🛡️ **Conservative Name Policy**

- Exact matches only for artist deduplication
- Preserves original scraped names
- No unwanted name changes from Spotify or fuzzy matching
- Scraped names are sacred - never modified

### 🧹 **Comprehensive Filtering**

- Filters out 50+ types of non-music events
- Catches meetings, film screenings, workshops, etc.
- Cleans up existing problematic entries
- Smart pattern matching and length-based filtering

### 📦 **Simplified Architecture**

- Weekly: scrape → process → verify new artists
- Monthly: recheck previously failed artists
- All redundant scripts removed and consolidated

## Database Files

- `src/data/raw.json` - Raw scraped data (input)
- `src/data/artists.json` - Processed artist database (output)
- `src/data/venues.json` - Processed venue database (output)
- `src/data/spelling-corrections.json` - Manual corrections for true typos

## Active Scripts

- `scripts/scrape-concerts.js` - Data collection
- `scripts/process-databases.js` - Unified processing and filtering
- `scripts/spotify-verify.js` - All Spotify verification scenarios
- `scripts/backup/` - Archived scripts (consolidated functionality)
