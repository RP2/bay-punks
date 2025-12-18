import { readFile, writeFile } from "fs/promises";
import { normalizeText, getPacificDateISO } from "../src/lib/shared-utils.js";

// helper to find artist ID from processed artists data
function findArtistId(artistName, processedArtists) {
  const normalized = normalizeText(artistName);

  // first try exact match with artist name
  let artist = processedArtists.find(
    (a) => normalizeText(a.name) === normalized,
  );

  // if no match found, check aliases
  if (!artist) {
    artist = processedArtists.find(
      (a) =>
        a.aliases &&
        a.aliases.some((alias) => normalizeText(alias) === normalized),
    );
  }

  return artist?.id || null;
}

// helper to find venue ID from processed venues data
function findVenueId(venueName, processedVenues) {
  const normalized = normalizeText(venueName);

  // First try exact match with venue name
  let venue = processedVenues.find((v) => normalizeText(v.name) === normalized);

  // If no match found, check aliases
  if (!venue) {
    venue = processedVenues.find(
      (v) =>
        v.aliases &&
        v.aliases.some((alias) => normalizeText(alias) === normalized),
    );
  }

  return venue?.id || null;
}

async function generateCalendar() {
  console.log("generating calendar.json from processed data...");

  // load raw concert data
  const rawData = JSON.parse(await readFile("./src/data/raw.json", "utf-8"));

  // load processed artists and venues data
  const artistsData = JSON.parse(
    await readFile("./src/data/artists.json", "utf-8"),
  );
  const venuesData = JSON.parse(
    await readFile("./src/data/venues.json", "utf-8"),
  );

  console.log(`loaded ${artistsData.artists.length} processed artists`);
  console.log(`loaded ${venuesData.venues.length} processed venues`);

  // process the raw shows data with processed artist/venue references
  const processedShows = rawData.shows.map((show) => {
    const processedEvents = show.events.map((event) => {
      // find venue ID from processed venues
      const venueId = findVenueId(event.venue.text, venuesData.venues);
      const venue = venuesData.venues.find((v) => v.id === venueId);

      // process bands with artist IDs
      const processedBands = event.bands.map((band) => {
        const artistId = findArtistId(band.text, artistsData.artists);
        const artist = artistsData.artists.find((a) => a.id === artistId);

        return {
          text: band.text,
          id: artistId,
          href: artist?.spotifyUrl || band.href, // prefer spotify URL if available
          spotifyVerified: artist?.spotifyVerified || false,
        };
      });

      return {
        venue: {
          text: event.venue.text,
          id: venueId,
          href: venue?.searchUrl || event.venue.href,
          location: venue?.displayLocation || null,
        },
        bands: processedBands,
        extra: event.extra,
      };
    });

    return {
      day: show.day,
      normalizedDate: show.normalizedDate,
      events: processedEvents,
    };
  });

  // filter out future shows only (same logic as current usage)
  const todayISOString = getPacificDateISO();

  const upcomingShows = processedShows.filter(
    (show) => show.normalizedDate >= todayISOString,
  );

  const calendar = {
    shows: upcomingShows,
    metadata: {
      totalShows: upcomingShows.length,
      totalEvents: upcomingShows.reduce(
        (sum, show) => sum + show.events.length,
        0,
      ),
      dateRange: {
        start: upcomingShows[0]?.normalizedDate || null,
        end: upcomingShows[upcomingShows.length - 1]?.normalizedDate || null,
      },
      lastUpdated: new Date().toISOString(),
      generatedFrom: {
        rawData: "raw.json",
        processedArtists: "artists.json",
        processedVenues: "venues.json",
      },
    },
  };

  // write calendar data
  await writeFile(
    "./src/data/calendar.json",
    JSON.stringify(calendar, null, 2),
  );

  console.log(`✅ calendar.json generated successfully!`);
  console.log(`📅 ${calendar.metadata.totalShows} upcoming show days`);
  console.log(`🎵 ${calendar.metadata.totalEvents} total events`);
  console.log(
    `📍 date range: ${calendar.metadata.dateRange.start} to ${calendar.metadata.dateRange.end}`,
  );

  // statistics
  const spotifyVerifiedEvents = upcomingShows.reduce((count, show) => {
    return (
      count +
      show.events.reduce((eventCount, event) => {
        return (
          eventCount + event.bands.filter((band) => band.spotifyVerified).length
        );
      }, 0)
    );
  }, 0);

  const totalBands = upcomingShows.reduce((count, show) => {
    return (
      count +
      show.events.reduce((eventCount, event) => {
        return eventCount + event.bands.length;
      }, 0)
    );
  }, 0);

  console.log(`🎼 ${totalBands} total band entries`);
  console.log(
    `✅ ${spotifyVerifiedEvents} spotify verified bands (${Math.round((spotifyVerifiedEvents / totalBands) * 100)}%)`,
  );
}

generateCalendar().catch(console.error);
