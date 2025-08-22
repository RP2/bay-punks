// spotify verification logic for artists, ported and modularized for Worker use
// (stub for now, to be filled in)

import type { Artist } from "./database";

export interface SpotifyVerificationResult {
  processed: number;
  found: number;
  notFound: number;
  errors: number;
  updatedArtists: Artist[];
}

// --- Spotify API helpers ---

async function getSpotifyToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const creds = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("Failed to get Spotify token");
  const data = await res.json();
  return data.access_token;
}

async function searchSpotifyArtist(name: string, token: string): Promise<any> {
  const q = encodeURIComponent(name);
  const url = `https://api.spotify.com/v1/search?q=${q}&type=artist&limit=10`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function normalizeSpotifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/^the\s+/, "")
    .trim();
}

// Main verification function
export async function verifyArtistsOnSpotify(
  artists: Artist[],
  options: {
    mode?: string;
    limit?: number;
    verbose?: boolean;
    clientId: string;
    clientSecret: string;
  },
): Promise<SpotifyVerificationResult> {
  const verbose = options.verbose ?? false;
  const limit = options.limit ?? artists.length;
  let processed = 0,
    found = 0,
    notFound = 0,
    errors = 0;
  let updatedArtists: Artist[] = [];
  let token: string;
  try {
    token = await getSpotifyToken(options.clientId, options.clientSecret);
  } catch (err) {
    console.error("[Spotify] Token error:", err);
    return {
      processed: 0,
      found: 0,
      notFound: 0,
      errors: artists.length,
      updatedArtists: artists,
    };
  }

  for (const artist of artists.slice(0, limit)) {
    try {
      const resp = await searchSpotifyArtist(artist.name, token);
      if (!resp || !resp.artists || !resp.artists.items.length) {
        notFound++;
        updatedArtists.push({
          ...artist,
          spotifyVerified: false,
          spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(artist.name)}`,
        });
        if (verbose) console.log(`[Spotify] Not found: ${artist.name}`);
        continue;
      }
      // Find best match
      const norm = normalizeSpotifyName(artist.name);
      const match =
        resp.artists.items.find(
          (a: any) => normalizeSpotifyName(a.name) === norm,
        ) || resp.artists.items[0];
      updatedArtists.push({
        ...artist,
        spotifyVerified: true,
        spotifyUrl: match.external_urls.spotify,
        spotifyData: {
          id: match.id,
          name: match.name,
          followers: match.followers?.total,
          popularity: match.popularity,
          genres: match.genres,
          images: match.images,
        },
      });
      found++;
      if (verbose)
        console.log(`[Spotify] Found: ${artist.name} -> ${match.name}`);
    } catch (err) {
      errors++;
      updatedArtists.push({ ...artist, spotifyVerified: false });
      console.error(`[Spotify] Error for ${artist.name}:`, err);
    }
    processed++;
  }
  // Add any skipped artists (if limit < artists.length)
  if (limit < artists.length) {
    updatedArtists = updatedArtists.concat(artists.slice(limit));
  }
  return { processed, found, notFound, errors, updatedArtists };
}
