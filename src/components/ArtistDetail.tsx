"use client";

import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import venuesData from "@/data/venues.json";
import { getVenueId } from "@/lib/data-utils";
import { getUpcomingShowsForArtist } from "@/lib/shows-utils";

interface ArtistDetailProps {
  artist: any;
}

const ArtistDetail: React.FC<ArtistDetailProps> = ({ artist }) => {
  // Get upcoming shows with current date awareness
  const artistShows = useMemo(() => {
    return getUpcomingShowsForArtist(artist);
  }, [artist]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-2xl font-semibold">Artist Info</h2>
            <dl className="space-y-2">
              <div>
                <dt className="text-muted-foreground text-sm font-medium">
                  Total Shows
                </dt>
                <dd className="text-lg">{artist.venues.length}</dd>
              </div>
              {artist.spotifyData?.genres &&
                artist.spotifyData.genres.length > 0 && (
                  <div>
                    <dt className="text-muted-foreground text-sm font-medium">
                      Genres
                    </dt>
                    <dd className="text-lg">
                      <div className="flex flex-wrap gap-1">
                        {artist.spotifyData.genres.map(
                          (genre: string, index: number) => (
                            <span
                              key={index}
                              className="bg-muted text-muted-foreground rounded-full px-2 py-1 text-xs"
                            >
                              {genre}
                            </span>
                          ),
                        )}
                      </div>
                    </dd>
                  </div>
                )}
              {artist.spotifyData?.followers && (
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Spotify Followers
                  </dt>
                  <dd className="text-lg">
                    {artist.spotifyData.followers.toLocaleString()}
                  </dd>
                </div>
              )}
              {(artist.spotifyUrl || artist.searchUrl) && (
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Listen
                  </dt>
                  <dd className="flex flex-col gap-2 text-lg">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://bandcamp.com/search?q=${encodeURIComponent(artist.name)}&item_type=b`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-600 transition-colors hover:text-blue-700 hover:underline"
                        aria-label="Bandcamp search"
                      >
                        Bandcamp
                      </a>
                      <span>or</span>
                      <a
                        href={artist.spotifyUrl || artist.searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-green-600 transition-colors hover:text-green-700 hover:underline"
                      >
                        {artist.spotifyUrl ? "Spotify" : "Search on Spotify"}
                      </a>
                    </div>
                    <div className="text-muted-foreground mt-2 text-xs">
                      <strong>Disclaimer:</strong> Spotify and Bandcamp links
                      are generated automatically and may not always link to the
                      correct artist.
                    </div>
                  </dd>
                </div>
              )}
            </dl>

            {artist.spotifyData?.scrapedName &&
              artist.spotifyData.scrapedName !== artist.name && (
                <div className="border-muted text-muted-foreground mt-4 border-t pt-4 text-xs">
                  <p>
                    <span className="font-medium">Original source data:</span> "
                    {artist.spotifyData.scrapedName}"
                  </p>
                  <p className="mt-1">
                    Artist information is automatically collected and verified.
                    Names may be updated to match official Spotify
                    capitalization.
                  </p>
                </div>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-2xl font-semibold">Venues</h2>
            <ul className="space-y-2">
              {artist.venues.map((venueId: string) => {
                const venue = venuesData.venues.find(
                  (v: any) => v.id === venueId,
                );
                return (
                  <li key={venueId} className="text-lg">
                    {venue ? (
                      <a
                        href={`/venue/${venueId}/`}
                        className="text-primary hover:underline"
                      >
                        {venue.name}
                      </a>
                    ) : (
                      venueId
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardContent className="p-6">
          <h2 className="mb-4 text-2xl font-semibold">Upcoming Shows</h2>
          <ScrollArea className="h-[400px]">
            {artistShows.length > 0 ? (
              <ul className="space-y-4">
                {artistShows.map((show, index) => {
                  const venueId = getVenueId(
                    show.venue || { text: "", id: null },
                  );
                  return (
                    <li
                      key={`${show.date}-${index}`}
                      className="border-b pb-4 last:border-0"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-lg font-medium">
                            {venueId ? (
                              <a
                                href={`/venue/${venueId}/`}
                                className="text-primary hover:underline"
                              >
                                {show.venue?.text}
                              </a>
                            ) : (
                              show.venue?.text
                            )}
                          </div>
                          <div className="text-muted-foreground text-sm">
                            <a
                              href={`/day/${show.date}/`}
                              className="text-primary hover:underline"
                            >
                              {show.humanDate}
                            </a>
                          </div>
                          {show.extra && (
                            <div className="text-muted-foreground mt-1 text-sm">
                              {show.extra}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-muted-foreground py-8 text-center">
                No upcoming shows scheduled
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default ArtistDetail;
