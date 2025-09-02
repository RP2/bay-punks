"use client";

import concertsData from "@/data/calendar.json";
import { normalizeText } from "@/lib/shared-utils.js";
import { getTodayISOString } from "@/lib/client-date-utils";

/**
 * Get the next show for a venue with current date awareness
 * @param venueName - The venue name to search for
 * @param venueId - Optional venue ID for more precise matching
 * @returns The next show for the venue or null if no upcoming shows
 */
export function getNextShowForVenue(venueName: string, venueId?: string) {
  const todayString = getTodayISOString();

  const upcomingShows = concertsData.shows
    .flatMap((show) =>
      show.events
        .filter(
          (event) =>
            (venueId && event.venue.id === venueId) ||
            normalizeText(event.venue.text) === normalizeText(venueName),
        )
        .map((event) => ({
          ...event,
          date: show.normalizedDate,
          humanDate: show.day,
        })),
    )
    .filter((show) => show.date >= todayString)
    .sort((a, b) => a.date.localeCompare(b.date));

  return upcomingShows[0] || null;
}

/**
 * Get all upcoming shows for a venue with current date awareness
 * @param venue - The venue object to find shows for
 * @returns An array of upcoming shows for the venue
 */
export function getUpcomingShowsForVenue(venue: any) {
  const todayISOString = getTodayISOString();

  return concertsData.shows
    .flatMap((show) =>
      show.events
        .filter((event) => {
          if (!event.venue) return false;

          // Match by ID first (most reliable)
          if (event.venue.id === venue.id) return true;

          // Match by normalized name
          if (
            event.venue.text &&
            normalizeText(event.venue.text) === normalizeText(venue.name)
          )
            return true;

          // Match against venue aliases
          if (venue.aliases && Array.isArray(venue.aliases)) {
            return venue.aliases.some(
              (alias: string) =>
                normalizeText(alias) === normalizeText(event.venue.text || ""),
            );
          }

          return false;
        })
        .map((event) => ({
          ...event,
          date: show.normalizedDate,
          humanDate: show.day,
        })),
    )
    .filter((show) => show.date >= todayISOString)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get the next show for an artist with current date awareness
 * @param artistName - The artist name to search for
 * @param artistId - Optional artist ID for more precise matching
 * @returns The next show for the artist or null if no upcoming shows
 */
export function getNextShowForArtist(artistName: string, artistId?: string) {
  const todayString = getTodayISOString();

  const upcomingShows = concertsData.shows
    .flatMap((show) =>
      show.events
        .filter((event) =>
          event.bands.some(
            (band) =>
              (artistId && band.id === artistId) ||
              normalizeText(band.text) === normalizeText(artistName),
          ),
        )
        .map((event) => ({
          ...event,
          date: show.normalizedDate,
          humanDate: show.day,
        })),
    )
    .filter((show) => show.date >= todayString)
    .sort((a, b) => a.date.localeCompare(b.date));

  return upcomingShows[0] || null;
}

/**
 * Get all upcoming shows for an artist with current date awareness
 * @param artist - The artist object to find shows for
 * @returns An array of upcoming shows for the artist
 */
export function getUpcomingShowsForArtist(artist: any) {
  const todayISOString = getTodayISOString();

  return concertsData.shows
    .flatMap((show) =>
      show.events
        .filter((event) =>
          event.bands.some(
            (band) => normalizeText(band.text) === normalizeText(artist.name),
          ),
        )
        .map((event) => ({
          ...event,
          date: show.normalizedDate,
          humanDate: show.day,
        })),
    )
    .filter((show) => show.date >= todayISOString)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get location information from an event's venue data
 * @param event - The event object
 * @returns Location string or null if no location data
 */
export function getEventLocation(event: any): string | null {
  if (event && event.venue && event.venue.location) {
    return event.venue.location;
  }
  return null;
}

/**
 * Get the best display name for a venue
 * @param venue - The venue object
 * @returns The best name to display for the venue
 */
export function getBestVenueName(venue: any): string {
  // if the canonical name is very short (likely normalized), prefer a longer alias
  if (venue.name.length < 10 && venue.aliases && venue.aliases.length > 0) {
    // find the longest alias that contains location info
    const detailedAliases = venue.aliases.filter(
      (alias: string) =>
        alias.includes(",") ||
        alias.includes("Street") ||
        alias.includes("Ave") ||
        alias.includes("Blvd"),
    );

    if (detailedAliases.length > 0) {
      // return the longest detailed alias
      return detailedAliases.reduce((longest: string, current: string) =>
        current.length > longest.length ? current : longest,
      );
    }

    // otherwise return the longest alias
    return venue.aliases.reduce((longest: string, current: string) =>
      current.length > longest.length ? current : longest,
    );
  }

  return venue.name;
}

/**
 * Get location string for a venue
 * @param venue - The venue object
 * @returns Location string or null if no location data
 */
export function getLocationString(venue: any): string | null {
  if (venue.address && venue.city) {
    return `${venue.address}, ${venue.city}`;
  } else if (venue.city) {
    return venue.city;
  } else if (venue.address) {
    return venue.address;
  }
  return null;
}

/**
 * Sort venues by different criteria
 * @param venueList - The list of venues to sort
 * @param sortKey - The sort key ("alphabetical", "reverse-alphabetical", "next-show")
 * @returns Sorted venue list
 */
export function sortVenues(venueList: any[], sortKey: string) {
  const venuesCopy = [...venueList];

  switch (sortKey) {
    case "alphabetical":
      return venuesCopy.sort((a, b) => {
        const nameA = a.displayName || getBestVenueName(a);
        const nameB = b.displayName || getBestVenueName(b);
        return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      });

    case "reverse-alphabetical":
      return venuesCopy.sort((a, b) => {
        const nameA = a.displayName || getBestVenueName(a);
        const nameB = b.displayName || getBestVenueName(b);
        return nameB.localeCompare(nameA, undefined, { sensitivity: "base" });
      });

    case "next-show":
      return venuesCopy.sort((a, b) => {
        // venues with no upcoming shows go to the end
        if (!a.nextShow && !b.nextShow) return 0;
        if (!a.nextShow) return 1;
        if (!b.nextShow) return -1;

        // sort by date
        return (
          new Date(a.nextShow.date).getTime() -
          new Date(b.nextShow.date).getTime()
        );
      });

    default:
      return venuesCopy;
  }
}

/**
 * Sort artists by different criteria
 * @param artistList - The list of artists to sort
 * @param sortKey - The sort key ("alphabetical", "reverse-alphabetical", "next-show")
 * @returns Sorted artist list
 */
export function sortArtists(artistList: any[], sortKey: string) {
  const artistsCopy = [...artistList];

  switch (sortKey) {
    case "alphabetical":
      return artistsCopy.sort((a, b) => {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

    case "reverse-alphabetical":
      return artistsCopy.sort((a, b) => {
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      });

    case "next-show":
      return artistsCopy.sort((a, b) => {
        // artists with no upcoming shows go to the end
        if (!a.nextShow && !b.nextShow) return 0;
        if (!a.nextShow) return 1;
        if (!b.nextShow) return -1;

        // sort by date
        return (
          new Date(a.nextShow.date).getTime() -
          new Date(b.nextShow.date).getTime()
        );
      });

    default:
      return artistsCopy;
  }
}

/**
 * Filter artists by genre
 * @param artists - The artists to filter
 * @param genre - The genre to filter by
 * @returns Filtered artists list
 */
export function filterByGenre(artists: any[], genre: string): any[] {
  if (!genre) return artists;
  return artists.filter(
    (artist) => Array.isArray(artist.genres) && artist.genres.includes(genre),
  );
}

/**
 * Sort days by different criteria
 * @param dayList - The list of days to sort
 * @param sortKey - The sort key ("chronological", "reverse-chronological", "frequency")
 * @returns Sorted day list
 */
export function sortDays(dayList: any[], sortKey: string) {
  const daysCopy = [...dayList];

  switch (sortKey) {
    case "reverse-chronological":
      // Latest dates first
      return [...daysCopy].sort((a, b) =>
        b.normalizedDate.localeCompare(a.normalizedDate),
      );

    case "frequency":
      // Sort by number of events (most to least)
      return [...daysCopy].sort(
        (a, b) => (b.events?.length || 0) - (a.events?.length || 0),
      );

    case "chronological":
    default:
      // Earliest dates first
      return [...daysCopy].sort((a, b) =>
        a.normalizedDate.localeCompare(b.normalizedDate),
      );
  }
}
