import { readFile, writeFile } from "fs/promises";
import path from "path";

// helper to normalize text (remove special characters, lowercase)
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// helper to create a unique slug
function createSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// helper to merge similar entries
function findSimilarEntry(map, normalizedText) {
  for (const [key, value] of map.entries()) {
    const normalizedKey = normalizeText(value.name);
    if (normalizedKey === normalizedText) {
      return key;
    }
  }
  return null;
}

async function processDatabases() {
  // read the concerts data
  const concertsData = JSON.parse(
    await readFile("./src/data/concerts.json", "utf-8"),
  );

  // initialize our databases
  const artists = new Map();
  const venues = new Map();

  // process each show
  concertsData.shows.forEach((show) => {
    show.events.forEach((event) => {
      // process venue
      if (event.venue?.text) {
        const normalizedVenue = normalizeText(event.venue.text);
        const existingVenueKey = findSimilarEntry(venues, normalizedVenue);
        const venueSlug = existingVenueKey || createSlug(event.venue.text);

        if (!venues.has(venueSlug)) {
          venues.set(venueSlug, {
            id: venueSlug,
            name: event.venue.text,
            searchUrl: event.venue.href,
            firstSeen: show.normalizedDate,
            lastSeen: show.normalizedDate,
            showCount: 1,
            location: event.venue.text.includes(",")
              ? event.venue.text.split(",")[1].trim()
              : null,
            aliases: new Set([event.venue.text]), // track alternative names
          });
        } else {
          const venue = venues.get(venueSlug);
          venue.lastSeen = show.normalizedDate;
          venue.showCount++;
          venue.aliases.add(event.venue.text);
        }
      }

      // process artists
      event.bands.forEach((band) => {
        if (band.text) {
          const normalizedBand = normalizeText(band.text);
          const existingArtistKey = findSimilarEntry(artists, normalizedBand);
          const artistSlug = existingArtistKey || createSlug(band.text);

          if (!artists.has(artistSlug)) {
            artists.set(artistSlug, {
              id: artistSlug,
              name: band.text,
              searchUrl: band.href,
              firstSeen: show.normalizedDate,
              lastSeen: show.normalizedDate,
              showCount: 1,
              venues: new Set([event.venue?.text]),
              aliases: new Set([band.text]), // track alternative names
            });
          } else {
            const artist = artists.get(artistSlug);
            artist.lastSeen = show.normalizedDate;
            artist.showCount++;
            artist.venues.add(event.venue?.text);
            artist.aliases.add(band.text);
          }
        }
      });
    });
  });

  // convert artists Map to array and process venues
  const artistsArray = Array.from(artists.values()).map((artist) => ({
    ...artist,
    venues: Array.from(artist.venues).filter(Boolean),
    aliases: Array.from(artist.aliases).filter(Boolean),
  }));

  // convert venues Map to array
  const venuesArray = Array.from(venues.values()).map((venue) => ({
    ...venue,
    aliases: Array.from(venue.aliases).filter(Boolean),
  }));

  // sort arrays by show count (most frequent first)
  artistsArray.sort((a, b) => b.showCount - a.showCount);
  venuesArray.sort((a, b) => b.showCount - a.showCount);

  // write the processed data
  await writeFile(
    "./src/data/artists.json",
    JSON.stringify(
      {
        artists: artistsArray,
        total: artistsArray.length,
        lastUpdated: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await writeFile(
    "./src/data/venues.json",
    JSON.stringify(
      {
        venues: venuesArray,
        total: venuesArray.length,
        lastUpdated: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(
    `processed ${artistsArray.length} artists and ${venuesArray.length} venues`,
  );
  console.log(`data written to src/data/artists.json and src/data/venues.json`);
}

processDatabases().catch(console.error);
