import venues from "../data/venues.json";
import artists from "../data/artists.json";
import { normalizeText } from "./shared-utils.js";

// helper to find venue ID from venue name
export function findVenueId(venueName: string): string | null {
  const normalized = normalizeText(venueName);

  // first try exact match with venue name
  let venue = venues.venues.find((v) => normalizeText(v.name) === normalized);

  // if no match found, check aliases
  if (!venue) {
    venue = venues.venues.find(
      (v) =>
        v.aliases &&
        v.aliases.some((alias) => normalizeText(alias) === normalized),
    );
  }

  return venue?.id || null;
}

// helper to find artist ID from artist name
export function findArtistId(artistName: string): string | null {
  const normalized = normalizeText(artistName);

  // first try exact match with artist name
  let artist = artists.artists.find(
    (a) => normalizeText(a.name) === normalized,
  );

  // if no match found, check aliases
  if (!artist) {
    artist = artists.artists.find(
      (a) =>
        a.aliases &&
        a.aliases.some((alias) => normalizeText(alias) === normalized),
    );
  }

  return artist?.id || null;
}

// helper to get venue or artist ID, preferring the existing ID field
export function getVenueId(venue: {
  id?: string | null;
  text: string;
}): string | null {
  return venue.id || findVenueId(venue.text);
}

export function getArtistId(artist: {
  id?: string | null;
  text: string;
}): string | null {
  return artist.id || findArtistId(artist.text);
}
