# Bay Area Live Shows

A simple & accessible list of upcoming music concerts in the Bay Area inspired by the classic FooPee punk l## Contributing

I welcome contributions from the community! Here's how you can help:

- **Suggest Shows**: Have a show in mind? Let me know and I'll add it to the list.
- **Report Issues**: If there's an error or missing information, please report it on the [GitHub issues page](https://github.com/RP2/bay-punks/issues).
- **Submit Pull Requests**: Feel free to submit improvements directly through [pull requests](https://github.com/RP2/bay-punks/pulls).
- **Correct Artist Data**: Found incorrect Spotify links or artist information? You can:
  - Edit the `artists.json` file directly to fix Spotify URIs or names
  - Submit a pull request with corrections and explanations
  - Open an issue describing the incorrect data for reviewrrently a work in progress).

## Overview

This project aims to create an easy-to-navigate and search website of upcoming punk rock and alternative music shows throughout the Bay Area. It serves as a community-driven platform for fans to discover new bands, venues, and events that celebrate punk culture.

## Features

- **Upcoming Shows**: Easily find upcoming punk shows in your area with detailed show information.
- **Tabbed Navigation**: Browse shows by date, or explore dedicated artist and venue directories.
- **Artist Profiles**: Comprehensive artist database with verified Spotify links when available, fallback to search.
- **Venue Directory**: Complete venue listings with location details and show history.
- **Spotify Integration**: Automated artist verification against Spotify's database for direct profile links.
- **Smart Search Fallbacks**: Artists not verified on Spotify automatically get search links.
- **Show Statistics**: Track artist show counts, venue usage, and date ranges for comprehensive insights.

## How to Use

1. Visit the list at [shows.wtf](https://shows.wtf) to browse by calendar, artist, and venue.
2. Use the **Shows** tab to view upcoming concerts by date.
3. Explore the **Artists** tab to discover bands with direct Spotify links when available.
4. Check the **Venues** tab to find show locations and their event history.
5. Contribute by suggesting new shows, venues, or artist information right here on GitHub.

## Spotify Integration

The site features intelligent Spotify integration that:

- **Automatically verifies** artists against Spotify's database
- **Updates artist names** to official Spotify capitalization (e.g., "ramones" → "Ramones", "who" → "The Who")
- **Preserves original scraped names** in `originalScrapedName` field for data integrity
- **Provides direct links** to verified artist profiles
- **Falls back to search** for artists not found on Spotify
- **Minimizes API calls** through smart caching and duplicate detection
- **Tracks verification status** to avoid unnecessary re-processing

### ⚠️ **Accuracy Disclaimer**

**Spotify verification is automated and not 100% accurate.** The system may occasionally:

- Link to artists with similar names instead of the correct artist
- Miss artists due to naming variations or spelling differences
- Update artist names that don't match the actual performing artist

**Original scraped names are always preserved** in the `originalScrapedName` field for data integrity. Users should verify artist information independently when needed.

**Found incorrect data?** Help improve the project by [reporting issues](https://github.com/RP2/bay-punks/issues) or [submitting corrections](https://github.com/RP2/bay-punks/pulls) via GitHub pull requests.

Run `npm run verify-spotify` to update artist Spotify links. The system is optimized to make minimal API calls by skipping already verified artists and detecting duplicates. All verification scripts now automatically update artist names to match official Spotify capitalization while preserving the original scraped names.

## Artist Name Standardization

The project includes intelligent artist name correction that automatically updates scraped artist names to match official Spotify capitalization:

### 🎯 **Automatic Name Updates**

- **During verification**: All Spotify verification scripts update names when artists are found
- **Bulk updates**: Use `npm run verify-spotify-update-all-names` to update all existing artists
- **Data preservation**: Original scraped names are preserved in `originalScrapedName` field
- **Clear feedback**: Console output shows "(name updated)" when changes are made

### 📝 **Examples of Name Corrections**

- `ramones` → `Ramones`
- `who` → `The Who`
- `black flag` → `Black Flag`
- `dead kennedys` → `Dead Kennedys`

### 🔧 **Available Scripts**

- `npm run verify-spotify-new-artists`: Verifies and updates names for new artists
- `npm run verify-spotify-recheck-artists`: Rechecks failed artists and updates names
- `npm run verify-spotify-update-all-names`: Bulk updates all artist names (supports `--dry-run`)
- `npm run verify-spotify`: General verification with name updates

## Automated Maintenance

The project features a comprehensive automated maintenance system via GitHub Actions:

### 🤖 **Weekly Maintenance Workflow**

Runs every Monday at 12AM Pacific Time:

1. **Scrapes** new concert data from sources
2. **Processes** databases with duplicate detection and merging
3. **Preserves** Spotify verification data during processing
4. **Verifies** only new artists against Spotify (saves API calls)
5. **Updates** artist names to official Spotify capitalization
6. **Commits** and pushes changes to trigger deployment

### 🔄 **Monthly Recheck Workflow**

Runs on the 1st of each month at 2AM Pacific Time:

1. **Identifies** previously unverified artists
2. **Rechecks** them against Spotify API
3. **Updates** verification status and artist names
4. **Commits** any newly verified artists

### 🎛️ **Manual Controls**

- **Weekly workflow options**:

  - `force_spotify: true`: Force revalidation of all artists
  - `max_artists`: Limit validation to a specific number

- **Monthly recheck options**:

  - `limit`: Set maximum artists to recheck (default: 100)
  - `dry_run`: Preview without making changes

- **Run locally**: `npm run maintenance` or `npm run verify-spotify-recheck-artists`

### 🏷️ **Name Update Controls**

- **Bulk name updates**: `npm run verify-spotify-update-all-names`
  - `--dry-run`: Preview name changes without applying them
  - `--limit N`: Limit to N artists for testing
- **Individual verification**: All verification scripts update names automatically

### 📊 **Smart Optimizations**

- **In-memory verification**: Prevents file corruption during processing
- **Focused verification**: Only processes truly new artists
- **Conservative rate limiting**: Prevents API throttling in CI environment
- **Smart persistence**: Preserves existing Spotify data during database rebuilding
- **Name standardization**: Automatic updates to official Spotify capitalization
- **Data preservation**: Original scraped names preserved in `originalScrapedName` field
- **Two-tier approach**: New artist verification + monthly rechecking

## Contributing

I welcome contributions from the community! Here’s how you can help:

- **Suggest Shows**: Have a show in mind? Let me know and I’ll add it to the list.
- **Report Issues**: If there's an error or missing information, please report it on the [GitHub issues page](https://github.com/RP2/bay-punks/issues).
- **Submit Pull Requests**: Feel free to submit improvements directly through [pull requests](https://github.com/RP2/bay-punks/pulls).

## Acknowledgments

A special thanks to the FooPee list for inspiration in curating a big list of shows. I also appreciate all community members who contribute their knowledge and passion to keep this project going.

This project is a work in progress, and I am excited about its potential to connect Bay Area locals with vibrant live music events. Stay tuned for more features and updates!

## Coming Soon

- [x] Artist pages with Spotify integration
- [x] Venue pages with show history
- [x] Tabbed navigation (Shows/Artists/Venues)
- [x] Unique search per tab
- [x] Automated Spotify artist verification
- [x] Calendar view
- [ ] Show filtering
- [ ] Artist genre filters
- [ ] Mobile app
- [ ] User favorites and notifications
- [ ] Add to calendar functionality

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                                   | Action                                                              |
| :---------------------------------------- | :------------------------------------------------------------------ |
| `npm install`                             | Installs dependencies                                               |
| `npm run dev`                             | Starts local dev server at `localhost:4321`                         |
| `npm run build`                           | Build your production site to `./dist/`                             |
| `npm run preview`                         | Preview your build locally, before deploying                        |
| `npm run format`                          | Use Prettier to format all files                                    |
| `npm run scrape`                          | Run the script to scrape concert data                               |
| `npm run process-db`                      | Run the process-database script with duplicate detection            |
| `npm run verify-spotify`                  | Validate all artists against Spotify API                            |
| `npm run verify-spotify-new-artists`      | Validate only new artists (never checked before)                    |
| `npm run verify-spotify-recheck-artists`  | Recheck previously unverified artists                               |
| `npm run verify-spotify-update-all-names` | Update all artist names to official Spotify capitalization          |
| `npm run maintenance`                     | Weekly maintenance pipeline (scrape → process → verify new artists) |
| `npm run prepare`                         | Runs scrape, process-db, formats files (full data pipeline)         |
