import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set your D1 binding name here (should match wrangler.toml)
const D1_DB_NAME = "DB";

// Helper to run wrangler d1 execute using a temp file for SQL
function runD1(sql) {
  const tmpFile = path.join(os.tmpdir(), `d1-migrate-${Date.now()}.sql`);
  fs.writeFileSync(tmpFile, sql);
  try {
    execSync(
      `npx wrangler d1 execute ${D1_DB_NAME} --config worker/wrangler.toml --remote --yes --file="${tmpFile}"`,
      {
        stdio: "inherit",
      },
    );
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

// Helper to sleep for ms milliseconds
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Batch insert function
async function batchInsert(
  table,
  columns,
  rows,
  valueFn,
  batchSize = 50,
  delayMs = 250,
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.map(valueFn).join(",\n");
    const sql = `INSERT OR IGNORE INTO ${table} (${columns}) VALUES\n${values};`;
    runD1(sql);
    if (i + batchSize < rows.length) await sleep(delayMs);
  }
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

// Main async function for batching
async function main() {
  // 2. Insert artists (batched)
  await batchInsert(
    "artists",
    "id, name, spotify_url, genres, aliases, spotify_followers, spotify_popularity, spotify_image_url, spotify_data",
    artists,
    (artist) => {
      const id = artist.id.replace(/'/g, "''");
      const name = artist.name.replace(/'/g, "''");
      const spotifyUrl = artist.spotifyUrl
        ? artist.spotifyUrl.replace(/'/g, "''")
        : "";
      const genres = (artist.spotifyData?.genres || [])
        .map((g) => g.replace(/'/g, "''"))
        .join(",");
      const aliases = (artist.aliases || [])
        .map((a) => a.replace(/'/g, "''"))
        .join(",");
      const followers = artist.spotifyData?.followers || 0;
      const popularity = artist.spotifyData?.popularity || 0;
      const imageUrl = artist.spotifyData?.images
        ? (artist.spotifyData.images[0]?.url || "").replace(/'/g, "''")
        : "";
      const spotifyData = JSON.stringify(artist.spotifyData || {}).replace(
        /'/g,
        "''",
      );
      return `('${id}','${name}','${spotifyUrl}','${genres}','${aliases}',${followers},${popularity},'${imageUrl}','${spotifyData}')`;
    },
  );

  // 3. Insert venues (batched)
  await batchInsert(
    "venues",
    "id, name, address, city, location, aliases",
    venues,
    (venue) => {
      const id = venue.id.replace(/'/g, "''");
      const name = venue.name.replace(/'/g, "''");
      const address = venue.address ? venue.address.replace(/'/g, "''") : "";
      const city = venue.city ? venue.city.replace(/'/g, "''") : "";
      const location = venue.location ? venue.location.replace(/'/g, "''") : "";
      const aliases = (venue.aliases || [])
        .map((a) => a.replace(/'/g, "''"))
        .join(",");
      return `('${id}','${name}','${address}','${city}','${location}','${aliases}')`;
    },
  );

  // 4. Insert events (batched) and event_artists (batched)
  const events = [];
  const eventArtists = [];
  for (const show of calendar) {
    for (const event of show.events) {
      const eventId = `${show.normalizedDate}_${event.venue.id}`;
      events.push({
        id: eventId,
        date: show.normalizedDate,
        venue_id: event.venue.id,
        extra: event.extra || "",
        source: "foopee",
        source_url: event.venue.href || "",
      });
      event.bands.forEach((band, idx) => {
        eventArtists.push({
          event_id: eventId,
          artist_id: band.id,
          billing_order: idx + 1,
        });
      });
    }
  }

  await batchInsert(
    "events",
    "id, date, venue_id, extra, source, source_url",
    events,
    (e) => {
      const id = e.id.replace(/'/g, "''");
      const date = e.date.replace(/'/g, "''");
      const venue_id = e.venue_id.replace(/'/g, "''");
      const extra = e.extra.replace(/'/g, "''");
      const source = e.source.replace(/'/g, "''");
      const source_url = e.source_url.replace(/'/g, "''");
      return `('${id}','${date}','${venue_id}','${extra}','${source}','${source_url}')`;
    },
  );

  await batchInsert(
    "event_artists",
    "event_id, artist_id, billing_order",
    eventArtists,
    (ea) => {
      const event_id = ea.event_id.replace(/'/g, "''");
      const artist_id = ea.artist_id.replace(/'/g, "''");
      const billing_order = ea.billing_order;
      return `('${event_id}','${artist_id}',${billing_order})`;
    },
  );
}

main();
