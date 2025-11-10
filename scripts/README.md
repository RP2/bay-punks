# Scripts Directory

This directory contains various scripts for managing the bay-punks concert database.

## Main Processing Scripts

### Core Data Pipeline

- `scrape-concerts.js` - Scrapes concert data from sources
- `process-databases.js` - Processes and normalizes scraped data
- `generate-calendar.js` - Generates calendar view from processed data
- `spotify-verify.js` - Verifies and enriches artist data with Spotify information

## Utility Scripts

### Data Fixes (Manual Intervention)

- `fixes/` - **One-time fix scripts for data integrity issues**
  - `fix-artist-venue-references.js` - Fixes broken venue references in artists data
  - `fix-calendar-venue-references.js` - Fixes broken venue references in calendar data
  - See `fixes/README.md` for detailed documentation

### Backup & Archive

- `backup/` - Contains deprecated scripts kept for reference
  - Historical scripts that have been superseded or merged into other functionality
  - See `backup/README.md` for details

## Usage Patterns

### Regular Automated Processing

```bash
npm run scrape        # Run scraper
npm run process-db    # Process and normalize data
npm run spotify       # Verify Spotify data
```

### Manual Data Fixes (As Needed)

```bash
# After manual venue consolidations
node scripts/fixes/fix-artist-venue-references.js
node scripts/fixes/fix-calendar-venue-references.js
```

### Development & Debugging

Individual scripts can be run directly:

```bash
node scripts/process-databases.js
node scripts/spotify-verify.js
```

## Organization Philosophy

- **Main scripts**: Automated, part of regular data pipeline
- **fixes/**: Manual intervention for data integrity issues
- **backup/**: Historical scripts for reference

## Adding New Scripts

### Primary Processing Scripts

- Add to root of `scripts/` directory
- Include in package.json if part of regular workflow
- Document usage patterns above

### Fix Scripts

- Add to `scripts/fixes/` directory
- Update `fixes/README.md` with documentation
- Design for manual execution with human oversight

### Deprecated Scripts

- Move to `scripts/backup/` directory
- Update `backup/README.md` with reason for deprecation
