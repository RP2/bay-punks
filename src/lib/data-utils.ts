// Data utilities for the frontend.
// With the new pipeline, all IDs are fully resolved at build time.
// The lookup functions remain as fallbacks but should rarely be needed.

import venues from "../data/venues.json";
import artists from "../data/artists.json";
import { normalizeText } from "./shared-utils.js";

// Find venue ID from venue name (fallback for unresolved IDs)
export function findVenueId(venueName: string): string | null {
  const normalized = normalizeText(venueName);
  const venue = venues.venues.find(
    (v) => normalizeText(v.name) === normalized,
  );
  if (venue) return venue.id;

  return (
    venues.venues.find(
      (v) =>
        v.aliases &&
        v.aliases.some((alias) => normalizeText(alias) === normalized),
    )?.id || null
  );
}

// Find artist ID from artist name (fallback for unresolved IDs)
export function findArtistId(artistName: string): string | null {
  const normalized = normalizeText(artistName);
  const artist = artists.artists.find(
    (a) => normalizeText(a.name) === normalized,
  );
  if (artist) return artist.id;

  return (
    artists.artists.find(
      (a) =>
        a.aliases &&
        a.aliases.some((alias) => normalizeText(alias) === normalized),
    )?.id || null
  );
}

// Get venue ID, preferring the pre-resolved ID field
export function getVenueId(venue: {
  id?: string | null;
  text: string;
}): string | null {
  if (venue.id) return venue.id;
  return findVenueId(venue.text);
}

// Get artist ID, preferring the pre-resolved ID field
export function getArtistId(artist: {
  id?: string | null;
  text: string;
}): string | null {
  if (artist.id) return artist.id;
  return findArtistId(artist.text);
}