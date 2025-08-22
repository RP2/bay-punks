// --- Modular Extraction Functions ---
export function extractArtists(shows: CalendarShow[]): Artist[] {
  const artistMap = new Map<string, Artist>();
  for (const show of shows) {
    for (const event of show.events) {
      for (const band of event.bands) {
        const artistId =
          band.id || band.text.replace(/\s+/g, "-").toLowerCase();
        if (!artistMap.has(artistId)) {
          artistMap.set(artistId, {
            id: artistId,
            name: band.text,
            searchUrl: band.href,
            aliases: band.aliases || [],
            venues: [
              event.venue.id ||
                event.venue.text.replace(/\s+/g, "-").toLowerCase(),
            ],
          });
        } else {
          const a = artistMap.get(artistId)!;
          const venueId =
            event.venue.id ||
            event.venue.text.replace(/\s+/g, "-").toLowerCase();
          if (!a.venues.includes(venueId)) a.venues.push(venueId);
        }
      }
    }
  }
  return Array.from(artistMap.values());
}

export function extractVenues(shows: CalendarShow[]): Venue[] {
  const venueMap = new Map<string, Venue>();
  for (const show of shows) {
    for (const event of show.events) {
      const venueId =
        event.venue.id || event.venue.text.replace(/\s+/g, "-").toLowerCase();
      if (!venueMap.has(venueId)) {
        venueMap.set(venueId, {
          id: venueId,
          name: event.venue.text,
          address: event.venue.address || "",
          city: event.venue.city || "",
          aliases: event.venue.aliases || [],
        });
      }
    }
  }
  return Array.from(venueMap.values());
}

export function extractEvents(shows: CalendarShow[]): any[] {
  const events: any[] = [];
  for (const show of shows) {
    for (const event of show.events) {
      const venueId =
        event.venue.id || event.venue.text.replace(/\s+/g, "-").toLowerCase();
      const eventId = `${show.normalizedDate}_${venueId}`;
      events.push({
        id: eventId,
        date: show.normalizedDate,
        venue_id: venueId,
        extra: event.extra || "",
        source: "foopee",
        source_url: event.venue.href || "",
      });
    }
  }
  return events;
}

export function extractEventArtists(shows: CalendarShow[]): any[] {
  const eventArtists: any[] = [];
  for (const show of shows) {
    for (const event of show.events) {
      const venueId =
        event.venue.id || event.venue.text.replace(/\s+/g, "-").toLowerCase();
      const eventId = `${show.normalizedDate}_${venueId}`;
      for (const [idx, band] of event.bands.entries()) {
        const artistId =
          band.id || band.text.replace(/\s+/g, "-").toLowerCase();
        eventArtists.push({
          event_id: eventId,
          artist_id: artistId,
          billing_order: idx + 1,
        });
      }
    }
  }
  return eventArtists;
}

// --- Spotify Enrichment ---
import { verifyArtistsOnSpotify } from "./spotify";

export async function enrichArtistsWithSpotify(
  artists: Artist[],
  options: {
    mode?: string;
    limit?: number;
    verbose?: boolean;
    clientId: string;
    clientSecret: string;
  },
): Promise<Artist[]> {
  try {
    const { updatedArtists } = await verifyArtistsOnSpotify(artists, options);
    return updatedArtists;
  } catch (err) {
    console.error("[enrichArtistsWithSpotify] Error:", err);
    return artists;
  }
}
// Modular cleaning/processing pipeline for concert data

// Normalize and clean artist names, apply corrections, merge aliases
export function normalizeArtists(
  artists: Artist[],
  corrections: Record<string, string> = {},
): Artist[] {
  // TODO: implement normalization, correction, and alias merging logic
  return artists;
}

// Deduplicate venues, normalize names, merge aliases
export function deduplicateVenues(
  venues: Venue[],
  corrections: Record<string, string> = {},
): Venue[] {
  // TODO: implement deduplication, normalization, and alias merging logic
  return venues;
}

// Apply spelling corrections to artists/venues/events
export function applyCorrections<T extends { name: string }>(
  items: T[],
  corrections: Record<string, string>,
): T[] {
  // TODO: implement correction logic
  return items;
}

// Full pipeline: from raw scraped data to D1 sync
export async function processConcertDataPipeline(
  rawData: { shows: CalendarShow[] },
  db: D1Database,
  corrections: {
    artist?: Record<string, string>;
    venue?: Record<string, string>;
  } = {},
  enrichSpotify: boolean = true,
  spotifyCreds?: { clientId: string; clientSecret: string },
): Promise<{ artists: Artist[]; venues: Venue[]; calendar: CalendarShow[] }> {
  try {
    // 1. Extract
    let artists = extractArtists(rawData.shows);
    let venues = extractVenues(rawData.shows);
    const events = extractEvents(rawData.shows);
    const eventArtists = extractEventArtists(rawData.shows);

    // 2. Normalize, deduplicate, corrections
    if (corrections.artist)
      artists = applyCorrections(artists, corrections.artist);
    if (corrections.venue) venues = applyCorrections(venues, corrections.venue);
    artists = normalizeArtists(artists, corrections.artist);
    venues = deduplicateVenues(venues, corrections.venue);

    // 3. Enrich with Spotify if requested
    if (enrichSpotify) {
      if (
        !spotifyCreds ||
        !spotifyCreds.clientId ||
        !spotifyCreds.clientSecret
      ) {
        throw new Error("Spotify credentials required for enrichment");
      }
      artists = await enrichArtistsWithSpotify(artists, {
        clientId: spotifyCreds.clientId,
        clientSecret: spotifyCreds.clientSecret,
      });
    }

    // 4. Upsert to D1
    await upsertArtists(db, artists);
    await upsertVenues(db, venues);
    await upsertEvents(db, events);
    await upsertEventArtists(db, eventArtists);

    // 5. Return processed data
    return {
      artists,
      venues,
      calendar: rawData.shows,
    };
  } catch (err) {
    console.error("[processConcertDataPipeline] Error:", err);
    throw err;
  }
}
// process and clean scraped concert data, deduplicate, and output structured artists/venues/calendar
// ported and modularized from scripts/process-databases.js for Worker use

import { normalizeText, normalizeDate } from "./data-utils";

// Types
export interface Artist {
  id: string;
  name: string;
  searchUrl?: string;
  spotifyUrl?: string;
  spotifyVerified?: boolean;
  spotifyData?: any;
  firstSeen?: string;
  lastSeen?: string;
  venues: string[];
  aliases: string[];
}

export interface Venue {
  id: string;
  name: string;
  searchUrl?: string;
  firstSeen?: string;
  lastSeen?: string;
  address?: string;
  city?: string;
  aliases: string[];
}

export interface CalendarShow {
  day: string;
  normalizedDate: string;
  events: any[];
}

// D1 upsert helpers
export async function upsertArtists(db: D1Database, artists: Artist[]) {
  if (!artists.length) return;
  const sql = `INSERT OR REPLACE INTO artists
    (id, name, spotify_url, genres, aliases, spotify_followers, spotify_popularity, spotify_image_url, spotify_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const stmts = artists.map((a) => {
    const genres = (a.spotifyData?.genres || []).join(",");
    const aliases = (a.aliases || []).join(",");
    const followers = a.spotifyData?.followers || 0;
    const popularity = a.spotifyData?.popularity || 0;
    const imageUrl = a.spotifyData?.images?.[0]?.url || "";
    const spotifyData = JSON.stringify(a.spotifyData || {});
    return db
      .prepare(sql)
      .bind(
        a.id,
        a.name,
        a.spotifyUrl || "",
        genres,
        aliases,
        followers,
        popularity,
        imageUrl,
        spotifyData,
      );
  });
  for (const stmt of stmts) await stmt.run();
}

export async function upsertVenues(db: D1Database, venues: Venue[]) {
  if (!venues.length) return;
  const sql = `INSERT OR REPLACE INTO venues
    (id, name, address, city, location, aliases)
    VALUES (?, ?, ?, ?, ?, ?)`;
  const stmts = venues.map((v) => {
    const aliases = (v.aliases || []).join(",");
    return db
      .prepare(sql)
      .bind(
        v.id,
        v.name,
        v.address || "",
        v.city || "",
        (v as any).location || "",
        aliases,
      );
  });
  for (const stmt of stmts) await stmt.run();
}

export async function upsertEvents(db: D1Database, events: any[]) {
  if (!events.length) return;
  const sql = `INSERT OR REPLACE INTO events
    (id, date, venue_id, extra, source, source_url)
    VALUES (?, ?, ?, ?, ?, ?)`;
  const stmts = events.map((e) =>
    db
      .prepare(sql)
      .bind(
        e.id,
        e.date,
        e.venue_id,
        e.extra || "",
        e.source || "foopee",
        e.source_url || "",
      ),
  );
  for (const stmt of stmts) await stmt.run();
}

export async function upsertEventArtists(db: D1Database, eventArtists: any[]) {
  if (!eventArtists.length) return;
  const sql = `INSERT OR REPLACE INTO event_artists
    (event_id, artist_id, billing_order)
    VALUES (?, ?, ?)`;
  const stmts = eventArtists.map((ea) =>
    db.prepare(sql).bind(ea.event_id, ea.artist_id, ea.billing_order),
  );
  for (const stmt of stmts) await stmt.run();
}

// TODO: Add helpers for corrections, deduplication, and normalization as needed
