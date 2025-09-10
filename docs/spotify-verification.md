# Spotify Artist Verification

This feature verifies artists against the Spotify Web API to provide direct artist profile links instead of search links.

## ⚠️ **Important Accuracy Notice**

**Spotify verification is automated and not 100% accurate.** The verification process has several limitations:

### **Potential Issues:**

- **Name similarity matches**: Artists with similar names may be incorrectly linked
- **Common band names**: Generic names like "The Band" or "Sunset" may match wrong artists
- **Spelling variations**: Minor differences in spelling may cause mismatches
- **Multiple artists**: Popular names may link to the wrong artist of the same name
- **Local vs. famous artists**: Local bands may be matched to famous artists with similar names

### **Data Integrity:**

- **Original names preserved**: The `originalScrapedName` field always contains the source data
- **Match type tracking**: Exact vs. partial matches are recorded in `spotifyData.matchType`
- **Verification timestamps**: All verifications include `verifiedAt` or `nameUpdateDate` timestamps
- **Manual verification**: Users should verify critical information independently

### **Quality Indicators:**

- **Exact matches** (`matchType: "exact"`) are more reliable than partial matches
- **High follower counts** and **popularity scores** increase confidence
- **Genre alignment** with expected music style can help validate matches

### **Contributing Corrections:**

Found incorrect artist data? You can help improve accuracy by:

- **Opening an issue**: Report incorrect Spotify links or artist information on [GitHub Issues](https://github.com/RP2/bay-punks/issues)
- **Submitting corrections**: Edit the `artists.json` file directly and submit a [pull request](https://github.com/RP2/bay-punks/pulls)
- **Providing context**: Include details about why the current match is incorrect and what the correct information should be

## Setup

1. **Create a Spotify App:**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new app
   - Note down your `Client ID` and `Client Secret`

2. **Set Environment Variables:**

   ```bash
   export SPOTIFY_CLIENT_ID="your_client_id_here"
   export SPOTIFY_CLIENT_SECRET="your_client_secret_here"
   ```

3. **Run Verification:**

   ```bash
   # verify new artists only (recommended for regular use)
   node scripts/spotify-verify.js --new

   # test with a small number of artists first
   node scripts/spotify-verify.js --new --limit 10

   # recheck previously failed artists
   node scripts/spotify-verify.js --failed --limit 50

   # re-evaluate all previously verified artists with current stricter logic
   node scripts/spotify-verify.js --partial

   # verify all unverified artists (new + failed)
   node scripts/spotify-verify.js --all

   # force recheck all artists (use sparingly)
   node scripts/spotify-verify.js --force
   ```

## How It Works

### Data Structure

Each artist in the database now has these additional fields:

- `spotifyUrl`: Direct link to Spotify artist profile (if verified)
- `spotifyVerified`: Boolean indicating if the artist was found on Spotify
- `spotifyData`: Object containing Spotify metadata:
  - `id`: Spotify artist ID
  - `followers`: Number of followers
  - `popularity`: Spotify popularity score (0-100)
  - `genres`: Array of genres
  - `matchType`: "exact" or "partial" match
  - `verifiedAt`: Timestamp of verification

### Matching Logic

The verification script uses a two-step matching process:

1. **Exact Match**: Normalizes both the local artist name and Spotify results to find exact matches
2. **Partial Match**: For artists not found exactly, tries partial matching with popularity/follower thresholds

### UI Behavior

- If `spotifyUrl` exists: Shows "Spotify" link that goes directly to the artist profile
- If only `searchUrl` exists: Shows "Search" link that opens Spotify search
- The link text indicates whether it's a verified profile or a search

### Rate Limiting & Performance

The script includes built-in optimizations:

- **Faster processing**: 50ms delay between requests (vs. 100ms previously)
- **Larger batches**: Processes 20 artists per batch (vs. 10 previously)
- **Shorter batch delays**: 200ms delay between batches (vs. 500ms previously)
- **Automatic retry logic**: Handles rate limit responses intelligently
- **Incremental saves**: Data saved after each batch to prevent loss

### Verification Modes

#### **--new** (Default)

Verifies only artists that have never been checked against Spotify.

#### **--failed**

Rechecks artists that previously failed verification (network errors, API issues).

#### **--partial**

Re-evaluates all previously verified artists using the current matching logic. This is useful when:

- The matching algorithm has been improved
- You want to upgrade partial matches to exact matches
- You want to remove false positives with stricter criteria

**Current Status**: As of July 7, 2025, all bad partial matches have been cleaned up and converted to "not found" status. The `--partial` mode is properly implemented but currently has no artists to process. Future partial matches (if any) will use the improved conservative matching logic.

#### **--all**

Combines `--new` and `--failed` modes to verify all unverified artists.

#### **--force**

Forces re-verification of all artists, including those already successfully verified. Use sparingly.

## Commands

```bash
# Basic usage - verify new artists only (default)
node scripts/spotify-verify.js --new

# Test with limited artists
node scripts/spotify-verify.js --new --limit 10

# Recheck previously failed artists
node scripts/spotify-verify.js --failed --limit 50

# Re-evaluate all previously verified artists with current stricter logic
node scripts/spotify-verify.js --partial

# Verify all unverified artists (new + failed)
node scripts/spotify-verify.js --all

# Force recheck all artists (use sparingly)
node scripts/spotify-verify.js --force

# Run quietly with minimal output
node scripts/spotify-verify.js --new --quiet

# Help
node scripts/spotify-verify.js --help
```

## Data Safety & Backup System

The script includes robust data protection features:

### **Automatic Backup**

- **Single backup**: Creates one backup at the start of each run
- **Backup filename**: `src/data/artists.backup.YYYY-MM-DD-HH-MM-SS.json`
- **No backup spam**: Only one backup per script execution

### **Incremental Saving**

- **Progress protection**: Saves data after each batch (every 20 artists)
- **Crash protection**: Progress is never lost due to interruptions
- **Final save**: Complete save at the end of successful runs

### **Graceful Shutdown**

- **Ctrl+C handling**: Pressing Ctrl+C triggers an emergency save
- **Signal handling**: Responds to SIGINT and SIGTERM for clean exits
- **No data loss**: Even forced shutdowns preserve all progress

### **Data Integrity**

- **Conservative approach**: Script never modifies artist names
- **Verification only**: Only adds Spotify metadata to existing artists
- **Original preservation**: `originalScrapedName` field always preserved

## Data Processing Workflow

1. **Scrape concerts** → `node scripts/scrape-concerts.js`
2. **Process databases** → `node scripts/process-databases.js`
3. **Verify new Spotify artists** → `node scripts/spotify-verify.js --new`

The verification step can be run independently and will only process new/unverified artists by default.

## Error Handling

The script handles:

- Rate limiting (429 responses)
- Network errors with retry logic
- Invalid credentials
- Artist not found scenarios
- Malformed API responses

Failed verifications are marked in the data for future retry attempts.

## Recent Improvements: ✅ COMPLETED (July 2025)

### 🧹 **False Positive Cleanup (July 7, 2025)**

- **Bad partial matches removed**: All false positive partial matches converted to "not found"
- **Partial matching disabled**: Removed partial matching entirely due to false positives
- **Exact matches only**: Now only creates high-confidence exact matches
- **Data quality restored**: No more incorrect artist-to-Spotify mappings
- **Conservative verification**: When in doubt, marks as "not found" rather than false positive

### 🎯 **Exact Matching Only**

- **Improved exact matching**: Handles "The" prefix/suffix variations intelligently
- **Partial matching disabled**: Removed due to too many false matches ("Tina!!!" → "Bibi und Tina")
- **Conservative approach**: Only creates matches with high confidence
- **Future enhancement**: Could implement edit distance or word overlap matching
- **Quality assurance**: No more wrong Spotify artist links

### 🛡️ **Data Safety Enhancements**

- **Smart backup system**: Creates backup at start, removes on successful completion
- **Backup retention**: Backup files only remain if script crashes (for debugging)
- **Incremental saves**: Progress saved after each batch to prevent data loss
- **Graceful shutdown**: Ctrl+C handling with emergency save functionality
- **Name preservation**: Script never modifies original scraped artist names

### 📁 **Scripts Streamlined**

- **Unified verification**: Single `spotify-verify.js` script handles all verification modes
- **Cleaned up partials**: Bad historical matches removed from data
- **Backup scripts**: Moved redundant scripts to `scripts/backup/` folder
- **Active automation**: Only essential scripts remain in main workflow
