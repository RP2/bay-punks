import { z } from "zod";

// --- Raw scraped data (output of scrape stage) ---

export const RawBandSchema = z.object({
  text: z.string(),
  href: z.string().optional(),
});

export const RawVenueSchema = z.object({
  text: z.string(),
  href: z.string().optional(),
});

export const RawEventSchema = z.object({
  venue: RawVenueSchema,
  bands: z.array(RawBandSchema),
  extra: z.string().optional(),
});

export const RawShowSchema = z.object({
  day: z.string(),
  normalizedDate: z.string(),
  events: z.array(RawEventSchema),
});

export const RawDataSchema = z.object({
  shows: z.array(RawShowSchema),
});

// --- Processed entities ---

export const ArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  searchUrl: z.string().nullable().optional(),
  spotifyUrl: z.string().nullable().optional(),
  spotifyVerified: z.boolean().optional(),
  spotifyData: z
    .object({
      id: z.string().optional(),
      spotifyName: z.string().optional(),
      scrapedName: z.string().optional(),
      followers: z.number().optional(),
      popularity: z.number().optional(),
      genres: z.array(z.string()).optional(),
      matchType: z.string().optional(),
      searchQuery: z.string().optional(),
      searchResults: z.number().optional(),
      verifiedAt: z.string().optional(),
      notFound: z.boolean().optional(),
      error: z.string().optional(),
    })
    .nullable()
    .optional(),
  firstSeen: z.string().nullable().optional(),
  lastSeen: z.string().nullable().optional(),
  venues: z.array(z.string()),
  aliases: z.array(z.string()),
  nextShow: z
    .object({
      date: z.string(),
      humanDate: z.string(),
      venue: z
        .object({
          id: z.string(),
          text: z.string(),
        })
        .optional()
        .nullable(),
    })
    .nullable()
    .optional(),
  genres: z.array(z.string()).optional(),
});

export const VenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  searchUrl: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  firstSeen: z.string().nullable().optional(),
  lastSeen: z.string().nullable().optional(),
  aliases: z.array(z.string()),
  displayName: z.string().optional(),
  locationString: z.string().nullable().optional(),
  nextShow: z
    .object({
      date: z.string(),
      humanDate: z.string(),
    })
    .nullable()
    .optional(),
});

// --- Shows (resolved IDs) ---

export const ShowVenueSchema = z.object({
  text: z.string(),
  id: z.string(),
  href: z.string().optional(),
  location: z.string().nullable().optional(),
});

export const ShowBandSchema = z.object({
  text: z.string(),
  id: z.string(),
  href: z.string().optional(),
  spotifyVerified: z.boolean().optional(),
});

export const ShowEventSchema = z.object({
  venue: ShowVenueSchema,
  bands: z.array(ShowBandSchema),
  extra: z.string().optional(),
});

export const ShowSchema = z.object({
  day: z.string(),
  normalizedDate: z.string(),
  events: z.array(ShowEventSchema),
});

export const ShowsDataSchema = z.object({
  shows: z.array(ShowSchema),
  metadata: z.object({
    lastUpdated: z.string(),
    source: z.string(),
  }),
});

// --- Artists database ---

export const ArtistsDataSchema = z.object({
  artists: z.array(ArtistSchema),
  total: z.number().optional(),
  lastUpdated: z.string().optional(),
  spotifyVerification: z.any().optional(),
});

// --- Venues database ---

export const VenuesDataSchema = z.object({
  venues: z.array(VenueSchema),
  total: z.number().optional(),
  lastUpdated: z.string().optional(),
});

// --- Calendar (frontend artifact) ---

export const CalendarShowSchema = z.object({
  day: z.string(),
  normalizedDate: z.string(),
  events: z.array(ShowEventSchema),
});

export const CalendarDataSchema = z.object({
  shows: z.array(CalendarShowSchema),
  metadata: z.object({
    totalShows: z.number(),
    totalEvents: z.number(),
    dateRange: z.object({
      start: z.string().nullable(),
      end: z.string().nullable(),
    }),
    lastUpdated: z.string(),
    generatedFrom: z.object({
      showsData: z.string(),
      processedArtists: z.string(),
      processedVenues: z.string(),
    }),
  }),
});

// --- Genres ---

export const GenresDataSchema = z.object({
  genres: z.array(z.string()),
});

// --- Spotify overlay ---

export const SpotifyVerificationSchema = z.object({
  spotifyUrl: z.string().nullable(),
  spotifyVerified: z.boolean(),
  spotifyData: z
    .object({
      id: z.string().optional(),
      spotifyName: z.string().optional(),
      scrapedName: z.string().optional(),
      followers: z.number().optional(),
      popularity: z.number().optional(),
      genres: z.array(z.string()).optional(),
      matchType: z.string().optional(),
      searchQuery: z.string().optional(),
      searchResults: z.number().optional(),
      verifiedAt: z.string().optional(),
      notFound: z.boolean().optional(),
      error: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export const SpotifyOverlaySchema = z.object({
  verifications: z.record(z.string(), SpotifyVerificationSchema),
  metadata: z.object({
    lastVerified: z.string(),
    mode: z.string(),
    stats: z
      .object({
        total: z.number().optional(),
        verified: z.number().optional(),
        notFound: z.number().optional(),
        errors: z.number().optional(),
      })
      .optional(),
  }),
});

// --- Config schemas ---

export const NonArtistFiltersConfigSchema = z.object({
  exact: z.array(z.string()),
  patterns: z.array(z.string()),
  cancelledPatterns: z.array(z.string()),
  birthdayPatterns: z.array(z.string()),
  maxLength: z.number(),
  maxSentences: z.number(),
});

export const VenueRulesConfigSchema = z.object({
  specialCases: z.record(
    z.string(),
    z.object({
      match: z.array(z.string()),
      canonicalName: z.string(),
      address: z.string().optional(),
      city: z.string().optional(),
    }),
  ),
  stripSuffixes: z.array(z.string()),
  stripPrefixes: z.array(z.string()),
  ageRestrictions: z.string(),
  citySuffixes: z.array(z.string()),
  cityAbbreviations: z.record(z.string(), z.string()),
  retentionMonths: z.number(),
});

export const SpellingCorrectionsConfigSchema = z.object({
  artist_corrections: z.record(z.string(), z.string()),
  venue_corrections: z.record(z.string(), z.string()),
  city_corrections: z.record(z.string(), z.string()),
  metadata: z.any().optional(),
});

// Type exports
export type RawBand = z.infer<typeof RawBandSchema>;
export type RawVenue = z.infer<typeof RawVenueSchema>;
export type RawEvent = z.infer<typeof RawEventSchema>;
export type RawShow = z.infer<typeof RawShowSchema>;
export type RawData = z.infer<typeof RawDataSchema>;

export type Artist = z.infer<typeof ArtistSchema>;
export type Venue = z.infer<typeof VenueSchema>;

export type ShowVenue = z.infer<typeof ShowVenueSchema>;
export type ShowBand = z.infer<typeof ShowBandSchema>;
export type ShowEvent = z.infer<typeof ShowEventSchema>;
export type Show = z.infer<typeof ShowSchema>;
export type ShowsData = z.infer<typeof ShowsDataSchema>;

export type ArtistsData = z.infer<typeof ArtistsDataSchema>;
export type VenuesData = z.infer<typeof VenuesDataSchema>;
export type CalendarData = z.infer<typeof CalendarDataSchema>;
export type GenresData = z.infer<typeof GenresDataSchema>;
export type SpotifyOverlay = z.infer<typeof SpotifyOverlaySchema>;
export type SpotifyVerification = z.infer<typeof SpotifyVerificationSchema>;

export type NonArtistFiltersConfig = z.infer<typeof NonArtistFiltersConfigSchema>;
export type VenueRulesConfig = z.infer<typeof VenueRulesConfigSchema>;
export type SpellingCorrectionsConfig = z.infer<typeof SpellingCorrectionsConfigSchema>;