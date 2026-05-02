"use client";

import concertsData from "@/data/calendar.json";
import { getPacificDateISO } from "@/lib/shared-utils.js";

// Get the next show for a venue using pre-computed data
export function getNextShowForVenue(venueName: string, venueId?: string) {
  const todayString = getPacificDateISO();

  const upcomingShows = concertsData.shows
    .flatMap((show) =>
      show.events
        .filter((event) => {
          if (venueId && event.venue.id === venueId) return true;
          return false;
        })
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

// Get all upcoming shows for a venue
export function getUpcomingShowsForVenue(venue: any) {
  const todayISOString = getPacificDateISO();

  return concertsData.shows
    .flatMap((show) =>
      show.events
        .filter((event) => {
          if (!event.venue) return false;
          if (event.venue.id === venue.id) return true;
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

// Get the next show for an artist using pre-computed data
export function getNextShowForArtist(artistName: string, artistId?: string) {
  const todayString = getPacificDateISO();

  const upcomingShows = concertsData.shows
    .flatMap((show) =>
      show.events
        .filter((event) =>
          event.bands.some((band) => band.id === artistId),
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

// Get all upcoming shows for an artist
export function getUpcomingShowsForArtist(artist: any) {
  const todayISOString = getPacificDateISO();

  return concertsData.shows
    .flatMap((show) =>
      show.events
        .filter((event) =>
          event.bands.some((band) => band.id === artist.id),
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

// Get location information from an event's venue data
export function getEventLocation(event: any): string | null {
  if (event && event.venue && event.venue.location) {
    return event.venue.location;
  }
  return null;
}

// Sort venues by different criteria
export function sortVenues(venueList: any[], sortKey: string) {
  const venuesCopy = [...venueList];

  switch (sortKey) {
    case "alphabetical":
      return venuesCopy.sort((a, b) => {
        const nameA = a.displayName || a.name;
        const nameB = b.displayName || b.name;
        return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      });

    case "reverse-alphabetical":
      return venuesCopy.sort((a, b) => {
        const nameA = a.displayName || a.name;
        const nameB = b.displayName || b.name;
        return nameB.localeCompare(nameA, undefined, { sensitivity: "base" });
      });

    case "next-show":
      return venuesCopy.sort((a, b) => {
        if (!a.nextShow && !b.nextShow) return 0;
        if (!a.nextShow) return 1;
        if (!b.nextShow) return -1;
        return (
          new Date(a.nextShow.date).getTime() -
          new Date(b.nextShow.date).getTime()
        );
      });

    default:
      return venuesCopy;
  }
}

// Sort artists by different criteria
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
        if (!a.nextShow && !b.nextShow) return 0;
        if (!a.nextShow) return 1;
        if (!b.nextShow) return -1;
        return (
          new Date(a.nextShow.date).getTime() -
          new Date(b.nextShow.date).getTime()
        );
      });

    default:
      return artistsCopy;
  }
}

// Filter artists by genre
export function filterByGenre(artists: any[], genre: string): any[] {
  if (!genre) return artists;
  return artists.filter(
    (artist) => Array.isArray(artist.genres) && artist.genres.includes(genre),
  );
}

// Sort days by different criteria
export function sortDays(dayList: any[], sortKey: string) {
  const daysCopy = [...dayList];

  switch (sortKey) {
    case "reverse-chronological":
      return [...daysCopy].sort((a, b) =>
        b.normalizedDate.localeCompare(a.normalizedDate),
      );

    case "frequency":
      return [...daysCopy].sort(
        (a, b) => (b.events?.length || 0) - (a.events?.length || 0),
      );

    case "chronological":
    default:
      return [...daysCopy].sort((a, b) =>
        a.normalizedDate.localeCompare(b.normalizedDate),
      );
  }
}