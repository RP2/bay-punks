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
   # verify unverified artists only (recommended for regular use)
   node scripts/verify-spotify-artists.js

   # test with a small number of artists first
   node scripts/verify-spotify-artists.js --limit 10

   # verify all artists (force recheck)
   node scripts/verify-spotify-artists.js --force --all
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

### Rate Limiting

The script includes built-in rate limiting:

- 100ms delay between individual requests
- 1000ms delay between batches
- Automatic retry logic for rate limit responses
- Processes artists in batches of 10

## Commands

```bash
# Basic usage - verify unverified artists
node scripts/verify-spotify-artists.js

# Test with limited artists
node scripts/verify-spotify-artists.js --limit 10

# Force recheck all artists
node scripts/verify-spotify-artists.js --force --all

# Quiet mode (minimal output)
node scripts/verify-spotify-artists.js --quiet

# Help
node scripts/verify-spotify-artists.js --help
```

## Data Processing Workflow

1. **Scrape concerts** → `node scripts/scrape-concerts.js`
2. **Process databases** → `node scripts/process-databases.js`
3. **Verify Spotify artists** → `node scripts/verify-spotify-artists.js`

The verification step can be run independently and will only process new/unverified artists by default.

## Error Handling

The script handles:

- Rate limiting (429 responses)
- Network errors with retry logic
- Invalid credentials
- Artist not found scenarios
- Malformed API responses

Failed verifications are marked in the data for future retry attempts.
