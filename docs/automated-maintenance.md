# Automated Maintenance System

This document explains the automated maintenance system for Bay Area Punk Shows.

## Overview

The project uses GitHub Actions to automatically maintain data freshness and quality through two automated workflows:

1. **Weekly Automation** - Weekly scraping, processing, and new artist verification
2. **Monthly Recheck** - Monthly revalidation of previously unverified artists

## Weekly Automation Workflow

Runs every Monday at 12AM Pacific Time (7AM UTC).

### 1. 🚀 **Streamlined Processing**

- Runs the integrated `automate-weekly.js` script
- Scrapes new concert data from configured sources
- Processes data with duplicate detection and merging
- Automatically verifies new artists on Spotify (in-memory)
- Preserves existing Spotify verification data

### 2. 📊 **Smart Statistics**

- Tracks new artists added
- Shows Spotify verification progress
- Provides comprehensive logging

### 3. 📝 **Automated Commits**

- Creates detailed commit messages with statistics
- Only commits if there are actual changes
- Triggers deployment through git push

## Monthly Recheck Workflow

Runs on the 1st of each month at 2AM Pacific Time (9AM UTC).

### 1. 🔄 **Intelligent Rechecking**

- Identifies artists that should be rechecked:
  - Previously marked as "not found"
  - Artists with no verification data
  - Artists with old verification data (30+ days)
- Uses conservative limits (100 artists by default)

### 2. 🎵 **Targeted Validation**

- Only processes artists that need rechecking
- Avoids re-verifying already confirmed artists
- Updates verification timestamps

## Manual Controls

### Weekly Automation Options

You can manually trigger the weekly workflow with these options:

- **`force_spotify`**: Force revalidation of all artists (bypasses weekly automation)
- **`max_artists`**: Limit validation to N artists (useful for testing)

### Monthly Recheck Options

You can manually trigger the monthly recheck with:

- **`limit`**: Limit recheck to N artists (default: 100)
- **`dry_run`**: Preview what would be rechecked without making changes

## Local Development Commands

For local testing and development, you can use these npm scripts:

```bash
# Run the complete weekly automation locally
npm run automate-weekly

# Individual components
npm run scrape                          # scrape concert data only
npm run process-db                      # process databases only
npm run verify-spotify-new-artists      # verify new artists only
npm run verify-spotify-recheck-artists  # recheck previously unverified artists

# Testing with limits
node scripts/verify-spotify-new-artists.js --limit 10
node scripts/verify-spotify-recheck-artists.js --limit 5 --dry-run
```

## Environment Variables

For Spotify verification to work, you need these environment variables:

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

### Local Development

Create a `.env` file in the project root with these values for local development.

### GitHub Actions

For the GitHub Actions workflows, add these as repository secrets:

1. Go to your repository settings
2. Navigate to Secrets and Variables > Actions
3. Add two repository secrets:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`

### Environment Variable Handling

The scripts will:

1. Try to load variables from `.env` file (local development)
2. Fall back to process environment variables (GitHub Actions)
3. Provide clear error messages if credentials are missing
4. Skip Spotify verification gracefully if credentials are unavailable

## API Optimization Features

### Spotify API Efficiency

The system includes multiple layers of optimization:

1. **Pre-filtering**: Skip artists with existing valid Spotify URLs
2. **New artist detection**: Only process artists without any Spotify data
3. **Duplicate prevention**: Avoid multiple API calls for same artist name
4. **Similar name detection**: Skip very similar artist names
5. **Conservative rate limiting**: Designed for CI environment stability

### Cost Management

- **Default limit**: 50 artists per automated run
- **Typical API calls**: 5-20 calls per week for new artists
- **Full revalidation**: Manual trigger only
- **Efficiency tracking**: Reports API calls made vs saved

## Configuration

### Required GitHub Secrets

Add these secrets to your GitHub repository:

- `SPOTIFY_CLIENT_ID`: Your Spotify app client ID
- `SPOTIFY_CLIENT_SECRET`: Your Spotify app client secret
- `SECRET_PUNK`: GitHub token for automated commits

### Customization

Modify these values in the workflow file:

```yaml
# Schedule (Monday 12AM Pacific = 8AM UTC)
cron: "0 7 * * 1"

# Default CI limits
DEFAULT_CI_LIMIT: 50
BATCH_SIZE: 5
RATE_LIMIT_DELAY: 200ms
```

## Monitoring

### Workflow Outputs

Each run provides detailed summaries:

- 📊 **Data changes**: Artists/venues added/modified
- 🎵 **Spotify validation**: New verifications and API efficiency
- 📝 **Deployment status**: Whether changes were committed

### Success Metrics

- **Data freshness**: New concerts scraped weekly
- **API efficiency**: >90% API calls avoided through caching
- **Automation reliability**: Consistent weekly updates
- **Error handling**: Graceful failure with detailed logs

## Troubleshooting

### Common Issues

1. **API Rate Limits**: Automatically handled with retry logic
2. **No new artists**: Workflow skips Spotify validation (normal)
3. **Scraping failures**: Check source website changes
4. **Duplicate secrets**: Ensure GitHub secrets are properly set

### Debug Mode

For detailed debugging, run locally:

```bash
# Enable verbose output
node scripts/verify-spotify-new-artists.js --limit 5

# Check for processing issues
node scripts/process-databases.js
```

### Manual Recovery

If automation fails:

```bash
# Run full maintenance manually
npm run scrape
npm run process-db
npm run verify-spotify-new
git add src/data/
git commit -m "manual: maintenance recovery"
git push
```

## Future Enhancements

- [ ] Slack/Discord notifications for weekly summaries
- [ ] Dynamic rate limiting based on API quotas
- [ ] Venue verification against Google Places API
- [ ] Artist social media link validation
- [ ] Automated show recommendation engine
