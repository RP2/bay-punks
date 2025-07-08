# Database Management

This document covers the database management system for Bay Area Punk Shows, including data processing, filtering, and quality maintenance.

## Database Files

- **`src/data/raw.json`** - Raw scraped concert data (input)
- **`src/data/artists.json`** - Processed artist database with Spotify integration (output)
- **`src/data/venues.json`** - Processed venue database with normalization (output)
- **`src/data/calendar.json`** - Calendar data with processed artist/venue references (output)
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
- Handles special cases for problematic venues (like 924 Gilman)
- Ensures all venues have valid date ranges

**Key Features:**

- **Conservative artist matching**: Exact matches only for artist deduplication
- **Comprehensive filtering**: Removes non-music events through multiple techniques
- **Smart venue normalization**: Enhanced processing with abbreviation handling
- **Special case detection**: Custom handling for venues like 924 Gilman
- **Address-based matching**: Identifies same venue with different names
- **Multi-stage deduplication**: Four-step process for maximum consistency
- **Complete date ranges**: Ensures all venues have valid firstSeen/lastSeen dates
- **Alias preservation**: Maintains all known venue name variations as aliases

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

### `generate-calendar.js` - Calendar Data Creation

**Generates calendar.json from processed data:**

- Reads processed `artists.json` and `venues.json`
- Combines with `raw.json` show data
- Creates calendar entries with proper artist/venue IDs
- Includes Spotify verification status
- Filters to upcoming shows only
- Provides statistics and metadata

**Run manually:**

```bash
npm run generate-calendar
```

**Features:**

- Links to processed artist/venue data (not raw names)
- Includes Spotify URLs when available
- Preserves all calendar functionality
- Provides verification statistics

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

## Venue Deduplication

The system uses a sophisticated multi-stage approach to deduplicate venues:

### Normalization Techniques

- **Standardized abbreviation handling**: Converts between forms (st/street, ave/avenue, etc.)
- **Age restriction removal**: Strips age indicators (21+, 18+, All Ages, etc.)
- **City suffix removal**: Removes city names after commas for matching (", San Francisco", etc.)
- **Special suffix removal**: Removes "sold out", "presents" and similar non-identifying text
- **Address-based matching**: Identifies venues with different names but same location
- **Comprehensive text normalization**: Lowercase, special character removal, whitespace handling

### Special Case Handling

- **Custom pattern detection**: Identifies problematic venues through text patterns
- **Special case for 924 Gilman**: Specifically handles the multiple naming variations of this venue
- **Consistent data enrichment**: Maintains proper name, address, and location information
- **Future-proof architecture**: Easily extendable for additional special cases

### Multi-Stage Deduplication Process

1. **Initial Pass**: Basic venue processing with normalized name matching

   - Creates venue objects with aliases, addresses, and date ranges
   - Applies manual venue corrections from spelling-corrections.json

2. **Special Case Detection**: Identifies known problematic venues

   - Uses `isSpecialCaseVenue()` to detect and handle venues like 924 Gilman
   - Ensures consistent naming and complete address information
   - Preserves all alternate names as aliases

3. **Normalized Name Matching**: Groups venues by normalized name

   - Applies `normalizeVenueName()` for consistent comparison
   - Handles abbreviations, restrictions, and city information
   - Merges aliases, addresses, and date information

4. **Address-Based Matching**: Consolidates venues by location

   - Matches venues with different names but identical addresses
   - Creates comprehensive venue records with all known aliases
   - Preserves the earliest firstSeen and latest lastSeen dates

5. **Date Range Fixing**: Ensures all venues have valid dates
   - Fixes null firstSeen/lastSeen values with reasonable defaults
   - Ensures chronological consistency (firstSeen ≤ lastSeen)
   - Provides complete date ranges for all venue records

This sophisticated approach ensures consistent venue data even when source data contains variations in naming, formatting, or includes age restrictions and other temporary modifiers. The multi-stage process handles complex edge cases like "924 Gilman" which may appear as "924 Gilman Street", "924 Gilman St.", "Gilman", or other variations.

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

### Multi-Stage Deduplication Implementation

The venue deduplication process happens in four distinct stages:

1. **Initial Venue Processing**

   - Creates venue objects with normalized names and aliases
   - Applies manual venue corrections from spelling-corrections.json

2. **Special Case Detection**

   - Uses `isSpecialCaseVenue()` to detect and handle problematic venues
   - Ensures consistent venue data regardless of source formatting

3. **Final Deduplication Pass**

   - Groups venues by normalized name
   - Merges venues with same normalized name or address
   - Combines aliases, preserves address information, and updates date ranges

4. **Date Range Fixing**
   - Fixes null date ranges by applying sensible defaults
   - Ensures all venues have valid firstSeen/lastSeen dates

## Simplified Data Flow

1. **Scraping** (`scrape-concerts.js`) → `raw.json`
2. **Processing** (`process-databases.js`) → `artists.json` + `venues.json`
3. **Spotify Verification** (`spotify-verify.js`) → Enhanced `artists.json`
4. **Calendar Generation** (`generate-calendar.js`) → `calendar.json` (Enhanced `raw.json` based on `artists.json` + `venues.json`)

## Key Improvements

### Unified Processing

- Single script handles all data processing and cleanup
- No more redundant filtering steps
- Faster automation (66% reduction in workflow steps)

### Enhanced Venue Deduplication

- **Comprehensive normalization**: Handles abbreviations, age restrictions, and city names
- **Special case handling**: Dedicated processing for problematic venues like 924 Gilman
- **Address-based matching**: Identifies venues with different names but same location
- **Multi-stage processing**: Four-pass algorithm for maximum consistency
- **Complete date ranges**: Automatically ensures all venues have valid firstSeen/lastSeen dates
- **Alias preservation**: Maintains all known name variations as searchable aliases
- **Future-proof design**: Easily extendable for additional special cases

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
