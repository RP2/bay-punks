# Database Management Scripts

This directory contains scripts for managing the Bay Area punk show databases, including filtering out non-artist entries and maintaining data quality.

## Scripts Overview

### Core Processing

- **`process-databases.js`** - Main script that processes concert data and builds artist/venue databases
  - Now includes automatic filtering of non-artist entries during processing
  - Integrates spelling corrections and fuzzy matching

### Data Quality & Filtering

- **`consolidated-cleanup.js`** - Comprehensive cleanup script for both databases

  - Removes non-artist entries from both `artists.json` and `concerts.json`
  - Handles venue administrative entries, cancelled shows, etc.
  - Run with `--dry-run` to preview changes

- **`verify-databases-clean.js`** - Verification script to check database cleanliness

  - Reports any non-artist entries found in either database
  - Useful for ongoing monitoring

- **`filter-non-artists.js`** - Original artists-only filtering script (now superseded by consolidated script)

### Spotify Integration

- **`verify-spotify-artists.js`** - Enhanced with stricter matching criteria

  - More conservative partial matching (60% similarity, higher popularity/follower thresholds)
  - Falls back to search URLs when no good match found

- **`verify-spotify-strict-recheck.js`** - Re-evaluates existing Spotify matches with stricter criteria
  - Identifies loose matches from previous runs
  - Downgrades poor matches to search URLs

### Concert Scraping

- **`scrape-concerts.js`** - Updated with comprehensive non-artist filtering
  - Prevents non-artist entries from being added during scraping
  - Filters out venue administrative entries, cancelled shows, etc.

## Non-Artist Filtering

The system automatically filters out entries that are not musical artists:

### Venue Administrative Entries

- Membership meetings
- Staff meetings
- Private events
- Venue operations (cleanup, setup, etc.)

### Show Status Entries

- Cancelled shows (starting with "CANCELLED:", "CANCELED:", "PROBABLY CANCELLED:")
- Postponed/rescheduled shows
- Generic placeholders (TBD, TBA)

### Venue-Specific Logic

- 924 Gilman Street "Membership Meeting" entries are automatically identified and filtered

## Usage Examples

```bash
# Full cleanup of both databases
node scripts/consolidated-cleanup.js

# Preview what would be cleaned
node scripts/consolidated-cleanup.js --dry-run

# Verify databases are clean
node scripts/verify-databases-clean.js

# Re-process with stricter Spotify matching
node scripts/verify-spotify-strict-recheck.js --limit 50

# Main database processing (now includes filtering)
node scripts/process-databases.js
```

## Data Flow

1. **Scraping** (`scrape-concerts.js`) - Filters non-artists during collection
2. **Processing** (`process-databases.js`) - Additional filtering during database building
3. **Cleanup** (`consolidated-cleanup.js`) - Removes any remaining non-artist entries
4. **Verification** (`verify-databases-clean.js`) - Ongoing monitoring

## Recent Improvements

### Stricter Spotify Matching

- Increased minimum popularity threshold (5 → 10)
- Increased minimum followers threshold (50 → 500)
- Added similarity ratio requirement (60% minimum)
- Limited name length differences (max 10 characters)
- Fallback to search URLs instead of no match

### Consolidated Filtering

- Unified filtering logic across all scripts
- Comprehensive non-artist detection
- Metadata tracking of all removals
- Support for both artists and concerts databases

### Prevention

- Scraping script now prevents non-artist entries at source
- Processing script includes filtering during database building
- Multiple layers of protection against non-artist entries
