# Bay Punks - Bay Area Live Music

A simple & accessible calendar of upcoming live music concerts in the San Francisco Bay Area, inspired by the classic FooPee punk list.

🌐 **Live Site**: [shows.wtf](https://shows.wtf)

## Features

- **📅 Calendar View**: Browse upcoming shows by date with clean, searchable interface
- **🎤 Artist Directory**: Discover artists with verified Spotify links and show history
- **🏟️ Venue Directory**: Explore venues with location details and event listings
- **🔍 Smart Search**: Real-time search across shows, artists, and venues
- **📱 Responsive Design**: Works perfectly on desktop and mobile
- **🎵 Spotify Integration**: Automated artist verification with 85%+ accuracy rate
- **♿ Accessibility**: Built with semantic HTML and ARIA attributes

## How to Use

1. **Calendar Tab**: View upcoming concerts chronologically
2. **Artists Tab**: Browse artists with Spotify links and show counts
3. **Venues Tab**: Find venues and their upcoming/past events
4. **Search**: Use the search bar to find specific shows, artists, or venues

## Data Pipeline

The site automatically updates every Monday with fresh concert data:

1. **Scrapes** concert listings from trusted sources (FooPee's "The List")
2. **Processes** and deduplicates venue and artist information with comprehensive filtering
3. **Verifies** new artists against Spotify's database (preserving original names)
4. **Filters** out non-music events, meetings, and administrative entries
5. **Deploys** updated site with new shows

## Contributing

- **🐛 Report Issues**: Found a bug or incorrect data? [Open an issue](https://github.com/RP2/bay-punks/issues)
- **💡 Suggest Shows**: Missing a show? Let us know via GitHub issues
- **🔧 Submit Fixes**: Feel free to submit [pull requests](https://github.com/RP2/bay-punks/pulls)
- **📝 Improve Data**: Help correct artist Spotify links or venue information

## Tech Stack

- **Framework**: [Astro](https://astro.build) with TypeScript
- **UI Components**: [shadcn/ui](https://ui.shadcn.com) with Tailwind CSS
- **Animations**: [Motion](https://motion.dev) for smooth interactions
- **Deployment**: Automated via GitHub Actions
- **Data Sources**: FooPee's "The List" + Spotify API integration

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Format code
npm run format
```

## Documentation

For detailed information about the project's automation and scripts:

### Core Documentation

- **[Documentation Overview](docs/README.md)**: Navigation guide to all documentation
- **[Simplified Pipeline](docs/simplified-pipeline.md)**: Data flow architecture overview
- **[Database Management](docs/database-management.md)**: Data processing and script usage
- **[Automated Maintenance](docs/automated-maintenance.md)**: GitHub Actions workflows and scheduling

### Features & Policies

- **[Spotify Verification](docs/spotify-verification.md)**: Artist verification process and accuracy
- **[Conservative Name Policy](docs/conservative-name-policy.md)**: Artist name handling and deduplication rules
- **[Non-Artist Protection](docs/non-artist-protection.md)**: Filtering system to prevent non-music entries

## Spotify Integration

The site features intelligent Spotify integration with **85%+ verification rate**:

- ✅ **Automatic verification** of artists against Spotify's database
- 🏷️ **Name preservation** - always keeps original venue listings
- 🔗 **Direct profile links** for verified artists
- 🔍 **Search fallbacks** for unverified artists
- 📊 **Verification tracking** to avoid reprocessing

### Accuracy Disclaimer

Spotify verification is automated and **not 100% accurate**. The system may occasionally link to artists with similar names or miss artists due to naming variations. Original scraped names are preserved for data integrity.

## Roadmap

- [x] Artist and venue pages
- [x] Tabbed navigation with search
- [x] Automated Spotify verification
- [x] Mobile-responsive design
- [x] Comprehensive data pipeline
- [ ] Show filtering by genre/date range
- [ ] User favorites and notifications
- [ ] Calendar export functionality
- [ ] Mobile app

## Acknowledgments

Special thanks to [FooPee's "The List"](http://www.foopee.com/punk/the-list/) for providing the foundation of Bay Area show data that makes this project possible.

---

Made with 🖤 by [Riley Peralta](https://rileyperalta.com)
