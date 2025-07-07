import { readFile, writeFile } from "fs/promises";

// comprehensive list of entries that are not actual artists
const NON_ARTIST_FILTERS = [
  // meetings and administrative
  "membership meeting",
  "member meeting",
  "members meeting",
  "venue meeting",
  "staff meeting",
  "volunteer meeting",
  "board meeting",

  // private events
  "private event",
  "private party",
  "closed",

  // venue operations
  "doors",
  "soundcheck",
  "cleanup",
  "setup",
  "teardown",
  "break",
  "intermission",

  // placeholder entries
  "tbd",
  "tba",
  "to be announced",
  "to be determined",

  // movie screenings and film events
  "screening",
  "film screening",
  "movie screening",
  "documentary screening",
  "film",
  "movie",
  "documentary",
  "cinema",

  // other events and activities
  "workshop",
  "talk",
  "lecture",
  "discussion",
  "fundraiser",
  "benefit",
  "memorial",
  "tribute",
  "open mic",
  "karaoke",
  "trivia",
  "trivia night",
  "comedy",
  "comedy show",
  "stand-up",
  "standup",
  "poetry",
  "poetry reading",
  "book reading",
  "art opening",
  "art show",
  "gallery opening",
  "exhibition",
  "book launch",
  "author reading",
  "panel discussion",
  "q&a",
  "meet and greet",
  "signing",
  "dj set", // might be borderline, but often not a band name
];

// patterns for non-artist entries (more flexible matching)
const NON_ARTIST_PATTERNS = [
  /^screening\s+of\s+/i, // "screening of [movie]"
  /\s+screening$/i, // "[movie] screening"
  /^film\s+screening/i, // "film screening [title]"
  /^movie\s+screening/i, // "movie screening [title]"
  /^film:\s+/i, // "film: [title]"
  /^movie:\s+/i, // "movie: [title]"
  /^documentary:\s+/i, // "documentary: [title]"
  /\s+presents\s+/i, // "[venue] presents [event]"
  /\s+featuring\s+/i, // might be event description
  /^benefit\s+for\s+/i, // "benefit for [cause]"
  /^memorial\s+for\s+/i, // "memorial for [person]"
  /^tribute\s+to\s+/i, // "tribute to [person]"
  /^fundraiser\s+for\s+/i, // "fundraiser for [cause]"
  /open\s+mic(\s+night)?$/i, // "open mic" or "open mic night"
  /comedy\s+(show|night)$/i, // "comedy show" or "comedy night"
  /trivia\s+night$/i, // "trivia night"
  /^dj\s+night$/i, // "dj night"
  /^karaoke$/i, // "karaoke" as standalone
];

// patterns that indicate cancelled/postponed shows (not band names)
const CANCELLED_PATTERNS = [
  /^cancelled:/i,
  /^canceled:/i,
  /^probably cancelled:/i,
  /^postponed:/i,
  /^moved:/i,
  /^rescheduled:/i,
];

// check if an artist name matches non-artist filters
function isNonArtist(artistName) {
  const normalized = artistName.toLowerCase().trim();

  // check exact matches for non-artist terms
  if (NON_ARTIST_FILTERS.includes(normalized)) {
    return true;
  }

  // check for cancelled/postponed patterns at the beginning
  if (CANCELLED_PATTERNS.some((pattern) => pattern.test(artistName))) {
    return true;
  }

  // check for non-artist patterns (movie screenings, events, etc.)
  if (NON_ARTIST_PATTERNS.some((pattern) => pattern.test(artistName))) {
    return true;
  }

  // filter out very long names that are likely event descriptions
  if (artistName.length > 100) {
    return true;
  }

  // filter out entries that are obviously announcements (multiple sentences)
  if (artistName.includes(". ") && artistName.split(". ").length > 2) {
    return true;
  }

  return false;
}

// check if an entry is venue-specific administrative content
function isVenueAdministrative(artist, venues = null) {
  // if it only appears at one venue and matches non-artist patterns
  const venueList = venues || (artist.venues ? artist.venues : []);

  if (venueList.length === 1) {
    const venueName = venueList[0].toLowerCase();
    const artistName = (artist.name || artist).toLowerCase();

    // 924 gilman specific checks
    if (venueName.includes("924 gilman") && artistName.includes("meeting")) {
      return true;
    }
  }

  return false;
}

// process concerts database to remove non-artist entries
function filterConcertBands(shows) {
  let removedCount = 0;
  const removedEntries = [];

  shows.forEach((show, showIndex) => {
    if (show.events) {
      show.events.forEach((event, eventIndex) => {
        if (event.bands) {
          const originalBandCount = event.bands.length;

          event.bands = event.bands.filter((band, bandIndex) => {
            const shouldRemove =
              isNonArtist(band.text) ||
              isVenueAdministrative(band.text, [event.venue?.text]);

            if (shouldRemove) {
              removedCount++;
              removedEntries.push({
                showIndex,
                eventIndex,
                bandIndex,
                text: band.text,
                venue: event.venue?.text,
                date: show.normalizedDate || show.day,
                reason: isNonArtist(band.text)
                  ? "matches filter"
                  : "venue administrative",
              });
              return false;
            }
            return true;
          });
        }
      });
    }
  });

  return { removedCount, removedEntries };
}

// clean up empty events (events with no bands after filtering)
function cleanupEmptyEvents(shows) {
  let removedEvents = 0;
  let removedShows = 0;
  const removedEntries = [];

  // filter shows to remove those with no events
  const filteredShows = shows.filter((show) => {
    const originalEventCount = show.events.length;

    // filter out events with no bands
    show.events = show.events.filter((event) => {
      const hasNoBands = !event.bands || event.bands.length === 0;

      if (hasNoBands) {
        removedEvents++;
        removedEntries.push({
          date: show.normalizedDate || show.day,
          venue: event.venue?.text,
          extra: event.extra,
          reason: "no bands after filtering",
        });
        return false;
      }
      return true;
    });

    // if all events were removed from this show day, remove the entire show
    if (show.events.length === 0) {
      removedShows++;
      return false;
    }

    return true;
  });

  return {
    shows: filteredShows,
    removedEvents,
    removedShows,
    removedEntries,
  };
}

async function consolidatedCleanup(options = {}) {
  const { dryRun = false, verbose = true } = options;

  if (verbose) console.log("🧹 starting consolidated database cleanup...");

  try {
    // process artists database
    if (verbose) console.log("📚 reading artists database...");
    const artistsData = JSON.parse(
      await readFile("./src/data/artists.json", "utf-8"),
    );

    const originalArtistCount = artistsData.artists.length;

    // identify non-artists in artists database
    const nonArtists = artistsData.artists.filter((artist) => {
      return isNonArtist(artist.name) || isVenueAdministrative(artist);
    });

    // process concerts database
    if (verbose) console.log("📚 reading concerts database...");
    const concertsData = JSON.parse(
      await readFile("./src/data/concerts.json", "utf-8"),
    );

    const originalConcertEntries = concertsData.shows.reduce((total, show) => {
      return (
        total +
        show.events.reduce((eventTotal, event) => {
          return eventTotal + (event.bands ? event.bands.length : 0);
        }, 0)
      );
    }, 0);

    // filter concert bands
    const concertResults = filterConcertBands(concertsData.shows);

    // clean up empty events after band filtering
    const emptyEventResults = cleanupEmptyEvents(concertsData.shows);

    // update shows with cleaned data
    concertsData.shows = emptyEventResults.shows;

    if (verbose) {
      console.log(`\n🔍 ARTISTS DATABASE:`);
      console.log(`   found ${nonArtists.length} non-artist entries:`);
      nonArtists.forEach((artist) => {
        const reason = isNonArtist(artist.name)
          ? "matches filter"
          : "venue administrative";
        console.log(
          `     ❌ ${artist.name} (${reason}) - venues: ${artist.venues.join(", ")}`,
        );
      });

      console.log(`\n🔍 CONCERTS DATABASE:`);
      console.log(
        `   found ${concertResults.removedCount} non-artist band entries:`,
      );
      concertResults.removedEntries.forEach((entry) => {
        console.log(
          `     ❌ ${entry.text} (${entry.reason}) - venue: ${entry.venue}, date: ${entry.date}`,
        );
      });

      if (
        emptyEventResults.removedEvents > 0 ||
        emptyEventResults.removedShows > 0
      ) {
        console.log(`\n🔍 EMPTY EVENTS CLEANUP:`);
        console.log(
          `   found ${emptyEventResults.removedEvents} empty events and ${emptyEventResults.removedShows} empty shows:`,
        );
        emptyEventResults.removedEntries.forEach((entry) => {
          console.log(
            `     ❌ ${entry.venue} on ${entry.date} (${entry.extra || "no info"}) - ${entry.reason}`,
          );
        });
      }
    }

    const totalRemovals =
      nonArtists.length +
      concertResults.removedCount +
      emptyEventResults.removedEvents +
      emptyEventResults.removedShows;

    if (totalRemovals === 0) {
      console.log("✅ no non-artist entries found in either database!");
      return;
    }

    if (dryRun) {
      console.log(`\n🔍 dry run complete - would remove:`);
      console.log(`   📊 ${nonArtists.length} artist entries`);
      console.log(`   📊 ${concertResults.removedCount} concert band entries`);
      console.log(`   📊 ${emptyEventResults.removedEvents} empty events`);
      console.log(
        `   📊 ${emptyEventResults.removedShows} shows with no events`,
      );
      console.log(`   📊 ${totalRemovals} total removals`);
      return;
    }

    // apply filters to artists database
    artistsData.artists = artistsData.artists.filter((artist) => {
      return !isNonArtist(artist.name) && !isVenueAdministrative(artist);
    });

    // update artists metadata
    artistsData.lastUpdated = new Date().toISOString();
    if (!artistsData.filtering) {
      artistsData.filtering = {};
    }

    artistsData.filtering = {
      ...artistsData.filtering,
      lastConsolidatedCleanup: new Date().toISOString(),
      artistsRemovedCount: nonArtists.length,
      concertBandsRemovedCount: concertResults.removedCount,
      emptyEventsRemovedCount: emptyEventResults.removedEvents,
      emptyShowsRemovedCount: emptyEventResults.removedShows,
      totalRemovedCount: totalRemovals,
      removedArtists: nonArtists.map((artist) => ({
        name: artist.name,
        id: artist.id,
        venues: artist.venues,
        reason: isNonArtist(artist.name)
          ? "matches filter"
          : "venue administrative",
      })),
      removedConcertBands: concertResults.removedEntries,
      removedEmptyEvents: emptyEventResults.removedEntries,
    };

    // update concerts metadata
    concertsData.lastUpdated = new Date().toISOString();
    if (!concertsData.filtering) {
      concertsData.filtering = {};
    }

    concertsData.filtering = {
      ...concertsData.filtering,
      lastConsolidatedCleanup: new Date().toISOString(),
      bandsRemovedCount: concertResults.removedCount,
      emptyEventsRemovedCount: emptyEventResults.removedEvents,
      emptyShowsRemovedCount: emptyEventResults.removedShows,
      removedBands: concertResults.removedEntries,
      removedEmptyEvents: emptyEventResults.removedEntries,
    };

    // write updated data
    await writeFile(
      "./src/data/artists.json",
      JSON.stringify(artistsData, null, 2),
    );

    await writeFile(
      "./src/data/concerts.json",
      JSON.stringify(concertsData, null, 2),
    );

    console.log(`\n🎉 consolidated cleanup complete!`);
    console.log(`\n📊 ARTISTS DATABASE:`);
    console.log(`   original count: ${originalArtistCount}`);
    console.log(`   removed: ${nonArtists.length}`);
    console.log(`   remaining: ${artistsData.artists.length}`);

    console.log(`\n📊 CONCERTS DATABASE:`);
    console.log(`   original band entries: ${originalConcertEntries}`);
    console.log(`   removed band entries: ${concertResults.removedCount}`);
    console.log(`   removed empty events: ${emptyEventResults.removedEvents}`);
    console.log(`   removed empty shows: ${emptyEventResults.removedShows}`);
    console.log(
      `   remaining band entries: ${originalConcertEntries - concertResults.removedCount}`,
    );

    console.log(`\n📊 TOTAL:`);
    console.log(`   🗑️  total removals: ${totalRemovals}`);
  } catch (error) {
    console.error("💥 error during consolidated cleanup:", error.message);
  }
}

// run the script
const dryRun = process.argv.includes("--dry-run");
const verbose = !process.argv.includes("--quiet");

await consolidatedCleanup({ dryRun, verbose });
