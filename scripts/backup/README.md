# Scripts Backup

This folder contains scripts that are no longer used by the main automation workflows but are kept for reference and potential future use.

## Moved Scripts

### `filter-non-artists.js`

- **Purpose**: Standalone script to filter out non-artist entries from the database
- **Status**: Functionality merged into other scripts (scrape-concerts.js, process-databases.js, etc.)
- **Reason for backup**: Filtering logic is now built into the main pipeline scripts

### `cleanup-empty-events.js`

- **Purpose**: Remove events that have no real artists after filtering
- **Status**: Functionality merged into `consolidated-cleanup.js`
- **Reason for backup**: Consolidated cleanup handles both artist and event cleanup in one script

### `verify-spotify-strict-recheck.js`

- **Purpose**: Recheck Spotify verification with stricter criteria
- **Status**: Duplicate of `verify-spotify-recheck-artists.js` functionality
- **Reason for backup**: Redundant with existing recheck script

### `verify-spotify-update-all-names.js`

- **Purpose**: One-off utility to update all artist names to official Spotify names
- **Status**: Not used in automation workflows
- **Reason for backup**: Useful utility script that might be needed for future data updates

## Active Scripts (Still in main scripts/ folder)

1. **`scrape-concerts.js`** - Weekly automation (scraping)
2. **`process-databases.js`** - Weekly automation (processing + imports verify-spotify-new-artists.js)
3. **`verify-spotify-new-artists.js`** - Weekly automation + imported by process-databases.js
4. **`verify-spotify-artists.js`** - Weekly automation (force revalidation option)
5. **`verify-spotify-recheck-artists.js`** - Monthly automation
6. **`consolidated-cleanup.js`** - Both weekly and monthly automation
7. **`verify-databases-clean.js`** - Both weekly and monthly automation

## Restoration

If any of these backup scripts are needed in the future, they can be moved back to the main scripts/ folder.
