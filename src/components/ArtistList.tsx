"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArtistSortToggle } from "./SortToggle";
import { GenreCombobox } from "@/components/ui/combobox";
import artistsData from "../data/artists.json";
import {
  getNextShowForArtist,
  sortArtists,
  filterByGenre,
} from "@/lib/shows-utils";

// Artist card component
const ArtistCard = ({ artist }: { artist: any }) => {
  return (
    <Card
      className="artist-item h-full"
      data-artist-name={artist.name.toLowerCase()}
    >
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between">
            <a
              href={`/artist/${artist.id}/`}
              className="text-primary font-semibold hover:underline"
            >
              {artist.name}
            </a>
          </div>

          {artist.nextShow && (
            <div className="text-sm">
              <div className="text-muted-foreground">Next show:</div>
              <div className="font-medium">
                <a
                  href={`/day/${artist.nextShow.date}/`}
                  className="text-primary hover:underline"
                >
                  {artist.nextShow.humanDate}
                </a>
              </div>
              <div className="text-muted-foreground text-xs">
                <a
                  href={`/venue/${artist.nextShow.venue.id}/`}
                  className="text-muted-foreground hover:underline"
                >
                  {artist.nextShow.venue.text}
                </a>
              </div>
            </div>
          )}

          {!artist.nextShow && (
            <div className="text-muted-foreground text-sm">
              No upcoming shows
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2">
            {(artist.spotifyUrl || artist.searchUrl) && (
              <>
                <a
                  href={`https://bandcamp.com/search?q=${encodeURIComponent(artist.name)}&item_type=b`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-xs text-blue-600 transition-colors hover:text-blue-700 hover:underline"
                  aria-label="Bandcamp search"
                >
                  Bandcamp
                </a>
                <a
                  href={artist.spotifyUrl || artist.searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-xs text-green-600 transition-colors hover:text-green-700 hover:underline"
                  title={
                    artist.spotifyUrl
                      ? "Listen on Spotify (automated verification - may not be 100% accurate)"
                      : "Search on Spotify"
                  }
                >
                  {artist.spotifyUrl ? "Spotify" : "Search on Spotify"}
                </a>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Main ArtistList component
const ArtistList = () => {
  // Prepare artist data with up-to-date next show info
  const artistData = useMemo(() => {
    return artistsData.artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      lastSeen: artist.lastSeen,
      spotifyUrl: artist.spotifyUrl,
      searchUrl: artist.searchUrl,
      nextShow: getNextShowForArtist(artist.name, artist.id),
      genres: artist.spotifyData?.genres || [],
    }));
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<string>("next-show");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [filteredArtists, setFilteredArtists] = useState(
    sortArtists(artistData, "next-show"),
  );

  // Update filtering when search, sort, or genre changes
  useEffect(() => {
    // First filter by genre if selected
    let filtered = selectedGenre
      ? filterByGenre(artistData, selectedGenre)
      : artistData;

    // Then filter by search query if present
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((artist) =>
        artist.name.toLowerCase().includes(query),
      );
    }

    // Finally sort the filtered results
    setFilteredArtists(sortArtists(filtered, sortKey));
  }, [searchQuery, sortKey, selectedGenre, artistData]);

  // Handle genre change
  const handleGenreChange = (genre: string) => {
    setSelectedGenre(genre);
  };

  // Make the handleGenreChange function available globally
  // This is needed for compatibility with the existing GenreCombobox component
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.handleArtistGenreChange = handleGenreChange;
      window.selectedGenre = selectedGenre;
    }
  }, [selectedGenre]);

  // Handle sort changes
  const handleSortChange = (newSortKey: string) => {
    setSortKey(newSortKey);
  };

  // Make the handleSortChange function available globally
  // This is needed for compatibility with the existing SortToggle component
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.handleArtistSortChange = handleSortChange;
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-bold">
          Artists (<span id="artist-count">{filteredArtists.length}</span>)
        </h2>
        <div className="flex w-full flex-row gap-2 md:mt-0 md:w-auto">
          <GenreCombobox className="h-12 flex-1 md:w-auto md:flex-initial" />
          <ArtistSortToggle className="h-12 flex-1 md:w-auto md:flex-initial" />
        </div>
      </div>

      <div className="mb-4">
        <Input
          id="artist-search"
          placeholder="Search artists..."
          className="w-full"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredArtists.map((artist) => (
          <ArtistCard key={artist.id} artist={artist} />
        ))}
      </div>
    </div>
  );
};

export default ArtistList;
