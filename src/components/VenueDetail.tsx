"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import artistsData from "@/data/artists.json";
import { getArtistId } from "@/lib/data-utils";
import { getUpcomingShowsForVenue } from "@/lib/shows-utils";

interface VenueDetailProps {
  venue: any;
}

const VenueDetail: React.FC<VenueDetailProps> = ({ venue }) => {
  // Extract search query from Google searchUrl
  const duckDuckGoUrl = useMemo(() => {
    if (venue.searchUrl && venue.searchUrl.includes("google.com/search?q=")) {
      const queryMatch = venue.searchUrl.match(
        /google\.com\/search\?q=([^&]+)/,
      );
      if (queryMatch && queryMatch[1]) {
        return `https://duckduckgo.com/?q=${queryMatch[1]}`;
      }
    }
    return null;
  }, [venue.searchUrl]);

  // Get upcoming shows with current date awareness
  const upcomingShows = useMemo(() => {
    return getUpcomingShowsForVenue(venue);
  }, [venue]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Venue info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Venue Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              {venue.address && (
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Address
                  </dt>
                  <dd className="text-lg">{venue.address}</dd>
                </div>
              )}
              {venue.city && (
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    City
                  </dt>
                  <dd className="text-lg">{venue.city}</dd>
                </div>
              )}
              {!venue.address && !venue.city && venue.location && (
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Location
                  </dt>
                  <dd className="text-lg">{venue.location}</dd>
                </div>
              )}
              {!venue.address && !venue.city && !venue.location && (
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Location
                  </dt>
                  <dd className="text-lg">Bay Area</dd>
                </div>
              )}
              {venue.searchUrl && (
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Search
                  </dt>
                  <dd className="flex gap-4 text-lg">
                    <a
                      href={venue.searchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 transition-colors hover:text-blue-700 hover:underline"
                    >
                      Google
                    </a>
                    {duckDuckGoUrl && (
                      <>
                        <span> or </span>
                        <a
                          href={duckDuckGoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-orange-600 transition-colors hover:text-orange-700 hover:underline"
                          aria-label="DuckDuckGo search"
                        >
                          DuckDuckGo
                        </a>
                      </>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming shows section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Upcoming Shows ({upcomingShows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingShows.length > 0 ? (
            <ScrollArea className="max-h-[60vh] overflow-y-scroll">
              <ul className="space-y-4">
                {upcomingShows.map((show, index) => (
                  <li
                    key={`${show.date}-${index}`}
                    className="border-border border-b pb-4 last:border-b-0"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="text-muted-foreground text-sm font-semibold">
                        <a
                          href={`/day/${show.date}/`}
                          className="hover:text-foreground transition-colors hover:underline"
                        >
                          {show.humanDate}
                        </a>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {show.bands.map((band: any, i: number) => {
                          const artistId = getArtistId(band);
                          let canonicalName = band.text;
                          if (artistId) {
                            const artist = artistsData.artists.find(
                              (a: any) => a.id === artistId,
                            );
                            if (artist) canonicalName = artist.name;
                          }
                          return (
                            <span key={i} className="inline-flex">
                              {artistId ? (
                                <a
                                  className="text-primary hover:underline"
                                  href={`/artist/${artistId}/`}
                                >
                                  {canonicalName}
                                </a>
                              ) : (
                                <span>{band.text}</span>
                              )}
                              {i < show.bands.length - 1 && (
                                <span className="text-muted-foreground">
                                  ,{" "}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                      {show.extra && (
                        <div className="text-muted-foreground text-sm">
                          {show.extra}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <p className="text-muted-foreground">
              No upcoming shows scheduled.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VenueDetail;
