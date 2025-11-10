# Data Fix Scripts

This folder contains scripts for fixing data integrity issues that may arise from manual data edits, consolidations, or other one-time corrections.

## When to Use These Scripts

These scripts are designed for **manual intervention** scenarios and should be run locally when data inconsistencies are detected. They are **not automated** because:

1. **Data errors require human judgment** - Understanding why data is broken and what the correct fix should be
2. **One-time fixes** - These issues typically arise from manual consolidations or data migrations
3. **Verification needed** - Results should be reviewed before applying changes
4. **Safety** - Running these scripts automatically could mask underlying issues in the main processing pipeline

## Available Fix Scripts

### `fix-artist-venue-references.js`

**Purpose**: Fixes broken venue ID references in artists data after venue consolidations

**When to use**:

- After manually consolidating duplicate venues in `venues.json`
- When artists are pointing to old/removed venue IDs
- After venue alias updates

**Usage**:

```bash
node scripts/fixes/fix-artist-venue-references.js
```

**What it does**:

- Builds a venue ID resolution map from current venues and their aliases
- Scans all artists for venue references
- Updates broken venue IDs to point to correct consolidated venues
- Reports number of fixes made

### `fix-calendar-venue-references.js`

**Purpose**: Fixes broken venue ID references in calendar data after venue consolidations

**When to use**:

- After manually consolidating duplicate venues in `venues.json`
- When calendar events are pointing to old/removed venue IDs
- As a safety check after venue changes

**Usage**:

```bash
node scripts/fixes/fix-calendar-venue-references.js
```

**What it does**:

- Builds a venue ID resolution map from current venues and their aliases
- Scans all calendar events for venue references
- Updates broken venue IDs to point to correct consolidated venues
- Reports number of fixes made

## Best Practices

1. **Run after venue consolidations**: Always run these scripts after manually consolidating venues
2. **Review output**: Check the console output to understand what's being changed
3. **Backup first**: Consider backing up data files before running fixes
4. **Test processing**: Run `npm run process-db` after fixes to ensure everything works
5. **One at a time**: Run and verify one fix script at a time rather than batch processing

## Integration with Main Processing

The main `process-databases.js` script now includes automatic venue ID resolution to prevent these issues in future processing. However, these fix scripts are still needed for:

- Fixing existing broken references
- One-time cleanups after manual data edits
- Recovery from data integrity issues

## Adding New Fix Scripts

When creating new fix scripts:

1. Follow the naming pattern: `fix-[problem-description].js`
2. Include detailed console logging of what's being changed
3. Provide counts of affected records
4. Add documentation to this README
5. Consider making them idempotent (safe to run multiple times)

## Automation Considerations

These scripts are intentionally **not automated** because:

- Data fixes require human oversight
- Automated fixes could hide underlying data quality issues
- Manual intervention ensures fixes are appropriate for the specific situation
- One-time nature doesn't justify automation complexity

If you find yourself running the same fix repeatedly, consider:

1. Improving the main processing pipeline to prevent the issue
2. Adding validation to catch the problem earlier
3. Updating data entry processes to avoid the issue
