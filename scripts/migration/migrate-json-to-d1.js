const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Helper to run wrangler d1 execute
function runD1(sql) {
  execSync(`echo "${sql}" | wrangler d1 execute <DB_NAME>`, {
    stdio: "inherit",
  });
}

// 1. Load JSON data
const artists = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../src/data/artists.json")),
).artists;
const venues = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../src/data/venues.json")),
).venues;
const calendar = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../src/data/calendar.json")),
).shows;

// 2. Insert artists
for (const artist of artists) {
  const sql = `
    INSERT INTO artists (id, name, spotify_url, genres, aliases, spotify_followers, spotify_popularity, spotify_image_url, spotify_data)
    VALUES (
      '${artist.id.replace(/'/g, "''")}',
      '${artist.name.replace(/'/g, "''")}',
      '${artist.spotifyUrl || ""}',
      '${(artist.spotifyData?.genres || []).join(",")}',
      '${(artist.aliases || []).join(",")}',
      ${artist.spotifyData?.followers || 0},
      ${artist.spotifyData?.popularity || 0},
      '${artist.spotifyData?.images ? artist.spotifyData.images[0]?.url : ""}',
      '${JSON.stringify(artist.spotifyData || {})}'
    );
  `;
  runD1(sql);
}

// 3. Insert venues
for (const venue of venues) {
  const sql = `
    INSERT INTO venues (id, name, address, city, location, aliases)
    VALUES (
      '${venue.id.replace(/'/g, "''")}',
      '${venue.name.replace(/'/g, "''")}',
      '${venue.address || ""}',
      '${venue.city || ""}',
      '${venue.location || ""}',
      '${(venue.aliases || []).join(",")}'
    );
  `;
  runD1(sql);
}

// 4. Insert events and event_artists
for (const show of calendar) {
  for (const event of show.events) {
    const eventId = `${show.normalizedDate}_${event.venue.id}`;
    const sqlEvent = `
      INSERT INTO events (id, date, venue_id, extra, source, source_url)
      VALUES (
        '${eventId}',
        '${show.normalizedDate}',
        '${event.venue.id}',
        '${event.extra || ""}',
        'foopee',
        '${event.venue.href || ""}'
      );
    `;
    runD1(sqlEvent);

    // Insert event_artists
    event.bands.forEach((band, idx) => {
      const sqlEA = `
        INSERT INTO event_artists (event_id, artist_id, billing_order)
        VALUES (
          '${eventId}',
          '${band.id}',
          ${idx + 1}
        );
      `;
      runD1(sqlEA);
    });
  }
}
