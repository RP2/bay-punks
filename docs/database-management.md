# Database Management

This document covers the database management system for Bay Area Punk Shows, including data processing, filtering, and quality maintenance.

## Database Files

- **`src/data/raw.json`** - Raw scraped concert data (input)
- **`src/data/artists.json`** - Processed artist database with Spotify integration (output)
- **`src/data/venues.json`** - Processed venue database with normalization (output)
- **`src/data/spelling-corrections.json`** - Manual corrections for venues and true typos

## Core Processing Script

### `process-databases.js` - Unified Processing

**The main script that handles everything:**

- Reads raw scraped data from `raw.json`
- Processes and deduplicates artists and venues
- Applies comprehensive non-artist filtering
- Cleans up existing problematic entries
- Preserves Spotify verification data
- Outputs clean `artists.json` and `venues.json`

**Key Features:**

- Conservative name handling (exact matches only)
- Comprehensive filtering of non-music events
- Automatic cleanup of legacy data issues
- Built-in duplicate detection and merging

## Additional Scripts

### `scrape-concerts.js` - Data Collection

- Scrapes concert data from configured venues
- Outputs raw data to `raw.json`
- Includes basic filtering during collection

### `spotify-verify.js` - Unified Spotify Integration

- Handles all Spotify verification scenarios
- Never changes artist names (preserves scraped names)
- Supports `--new`, `--failed`, `--force`, `--partial` modes
- **Exact matching only** for high quality results (partial matching disabled)
- **Smart backup system**: Creates backup at start, removes on successful completion
- **Graceful shutdown**: Ctrl+C handling to save progress on interruption
- **Data protection**: Built-in safeguards prevent data loss during verification

## Removed Scripts (Consolidated)

The following scripts were consolidated into `process-databases.js`:

- ~~`consolidated-cleanup.js`~~ - Functionality moved to main script
- ~~`verify-databases-clean.js`~~ - No longer needed
- Multiple old Spotify scripts - Unified into `spotify-verify.js`

## Non-Artist Filtering

The system automatically filters out entries that are not musical artists:

### Exact Match Filters

- Meetings (membership, venue, staff, board)
- Private events, closures, venue operations
- Placeholders (TBD, TBA)
- Film screenings, movies, documentaries
- Workshops, talks, lectures, comedy shows
- And 50+ other non-music event types

### Pattern Matching

- `screening of [movie]`, `[movie] screening`
- `film: [title]`, `documentary: [title]`
- `benefit for [cause]`, `memorial for [person]`
- Cancelled/postponed events (`cancelled:`, `postponed:`)

### Smart Filtering

- Event descriptions over 100 characters
- Multi-sentence announcements
- Venue-specific administrative content

## Usage Examples

```bash
# Main processing (includes all filtering and cleanup)
node scripts/process-databases.js

# Scrape new concert data
node scripts/scrape-concerts.js

# Verify new artists on Spotify
node scripts/spotify-verify.js --new

# Recheck failed Spotify verifications
node scripts/spotify-verify.js --failed

# Recheck partial matches with updated logic
node scripts/spotify-verify.js --partial

# Force revalidation of all artists
node scripts/spotify-verify.js --force
```

## Simplified Data Flow

1. **Scraping** (`scrape-concerts.js`) → `raw.json`
2. **Processing** (`process-databases.js`) → `artists.json` + `venues.json`
3. **Spotify Verification** (`spotify-verify.js`) → Enhanced `artists.json`

## Key Improvements

### Unified Processing

- Single script handles all data processing and cleanup
- No more redundant filtering steps
- Faster automation (66% reduction in workflow steps)

### Conservative Name Policy

- Exact matches only for artist deduplication
- Preserves original scraped names
- No unwanted name changes from Spotify or fuzzy matching

### Exact Match Spotify Verification

- **Partial matching disabled** due to false positive issues
- Only creates exact matches or marks as "not found"
- Prevents incorrect artist-to-Spotify mappings
- High quality, conservative verification approach

### Comprehensive Filtering

- Blocks meetings, events, movie screenings at source
- Cleans up existing problematic entries
- Multiple layers of non-artist detection

### Streamlined Workflows

- Weekly automation: scrape → process → verify new artists
- Monthly recheck: verify previously failed artists
- All redundant cleanup scripts moved to backup folder
