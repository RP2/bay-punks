"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VenueSortToggle } from "./SortToggle";
import venuesData from "../data/venues.json";
import {
  getNextShowForVenue,
  sortVenues,
  getBestVenueName,
  getLocationString,
  getEventLocation,
} from "@/lib/shows-utils";

// Venue card component
const VenueCard = ({ venue }: { venue: any }) => {
  // Get the next show with the current date
  const nextShow = useMemo(() => {
    return venue.nextShow;
  }, [venue]);

  const displayName = venue.displayName;
  const locationString = venue.locationInfo;

  return (
    <Card
      className="venue-item"
      data-venue-name={displayName.toLowerCase()}
      data-venue-location={locationString?.toLowerCase() || ""}
    >
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between">
            <a
              href={`/venue/${venue.id}/`}
              className="text-primary font-semibold hover:underline"
            >
              {displayName}
            </a>
          </div>

          {locationString && (
            <div className="text-muted-foreground text-sm">
              📍 {locationString}
            </div>
          )}

          {nextShow && (
            <div className="mt-2 text-sm">
              <div className="text-muted-foreground">Next show:</div>
              <div className="font-medium">
                <a
                  href={`/day/${nextShow.date}/`}
                  className="text-primary hover:underline"
                >
                  {nextShow.humanDate}
                </a>
              </div>
              <div className="text-muted-foreground text-xs">
                {nextShow.bands
                  .slice(0, 2)
                  .map((band: any) => band.text)
                  .join(", ")}
                {nextShow.bands.length > 2 &&
                  ` +${nextShow.bands.length - 2} more`}
              </div>
            </div>
          )}

          {!nextShow && (
            <div className="text-muted-foreground text-sm">
              No upcoming shows
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Main VenueList component
const VenueList = () => {
  // Prepare venue data with up-to-date next show info, filter to only venues with upcoming shows
  const venueData = useMemo(() => {
    return venuesData.venues
      .map((venue) => ({
        id: venue.id,
        name: venue.name,
        displayName: getBestVenueName(venue),
        locationInfo: getLocationString(venue),
        nextShow: getNextShowForVenue(venue.name, venue.id),
      }))
      .filter((venue) => venue.nextShow !== null); // only show venues with upcoming shows
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<string>("next-show");
  const [filteredVenues, setFilteredVenues] = useState(
    sortVenues(venueData, "next-show"),
  );
  const [visibleCount, setVisibleCount] = useState(25);
  const ITEMS_PER_PAGE = 25;

  // Handle search query changes
  useEffect(() => {
    if (!searchQuery) {
      setFilteredVenues(sortVenues(venueData, sortKey));
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = venueData.filter(
        (venue) =>
          venue.displayName.toLowerCase().includes(query) ||
          (venue.locationInfo &&
            venue.locationInfo.toLowerCase().includes(query)),
      );
      setFilteredVenues(sortVenues(filtered, sortKey));
    }
    // Reset visible count when filters change
    setVisibleCount(ITEMS_PER_PAGE);
  }, [searchQuery, sortKey, venueData]);

  // Get visible venues based on pagination
  const visibleVenues = filteredVenues.slice(0, visibleCount);
  const hasMore = visibleCount < filteredVenues.length;

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
  }, []);

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          handleLoadMore();
        }
      },
      { rootMargin: "100px" },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, handleLoadMore]);

  // Handle sort changes
  const handleSortChange = (newSortKey: string) => {
    setSortKey(newSortKey);
    setFilteredVenues(sortVenues(venueData, newSortKey));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold">Venues ({filteredVenues.length})</h2>
        <div className="hidden md:block">
          <VenueSortToggle />
        </div>
      </div>

      <div className="mb-4">
        <Input
          id="venue-search"
          placeholder="Search venues..."
          className="w-full"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleVenues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
      </div>

      {hasMore && <div ref={loadMoreRef} className="h-4" />}
    </div>
  );
};

export default VenueList;
