import { readFile } from "fs/promises";

// same filter functions as consolidated cleanup
const NON_ARTIST_FILTERS = [
  "membership meeting",
  "member meeting",
  "members meeting",
  "private event",
  "private party",
  "closed",
  "doors",
  "soundcheck",
  "cleanup",
  "setup",
  "teardown",
  "break",
  "intermission",
  "tbd",
  "tba",
  "to be announced",
  "to be determined",
  "venue meeting",
  "staff meeting",
  "volunteer meeting",
  "board meeting",
];

const CANCELLED_PATTERNS = [
  /^cancelled:/i,
  /^canceled:/i,
  /^probably cancelled:/i,
  /^postponed:/i,
  /^moved:/i,
  /^rescheduled:/i,
];

function isNonArtist(artistName) {
  const normalized = artistName.toLowerCase().trim();
  return (
    NON_ARTIST_FILTERS.includes(normalized) ||
    CANCELLED_PATTERNS.some((pattern) => pattern.test(artistName))
  );
}

function isVenueAdministrative(artist, venues = null) {
  const venueList = venues || (artist.venues ? artist.venues : []);
  if (venueList.length === 1) {
    const venueName = venueList[0].toLowerCase();
    const artistName = (artist.name || artist).toLowerCase();
    if (venueName.includes("924 gilman") && artistName.includes("meeting")) {
      return true;
    }
  }
  return false;
}

async function verifyDatabasesCleanliness() {
  console.log("🔍 verifying database cleanliness...");

  try {
    // check artists database
    const artistsData = JSON.parse(
      await readFile("./src/data/artists.json", "utf-8"),
    );
    const problemArtists = artistsData.artists.filter((artist) => {
      return isNonArtist(artist.name) || isVenueAdministrative(artist);
    });

    // check concerts database
    const concertsData = JSON.parse(
      await readFile("./src/data/concerts.json", "utf-8"),
    );
    const problemConcertBands = [];

    concertsData.shows.forEach((show, showIndex) => {
      if (show.events) {
        show.events.forEach((event, eventIndex) => {
          if (event.bands) {
            event.bands.forEach((band, bandIndex) => {
              if (
                isNonArtist(band.text) ||
                isVenueAdministrative(band.text, [event.venue?.text])
              ) {
                problemConcertBands.push({
                  text: band.text,
                  venue: event.venue?.text,
                  date: show.normalizedDate || show.day,
                  showIndex,
                  eventIndex,
                  bandIndex,
                });
              }
            });
          }
        });
      }
    });

    // report results
    console.log(`\n📊 DATABASE CLEANLINESS REPORT:`);
    console.log(`\n🎭 ARTISTS DATABASE:`);
    console.log(`   total artists: ${artistsData.artists.length}`);
    if (problemArtists.length === 0) {
      console.log(`   ✅ clean - no non-artist entries found`);
    } else {
      console.log(`   ❌ found ${problemArtists.length} non-artist entries:`);
      problemArtists.forEach((artist) => {
        console.log(
          `     - ${artist.name} (venues: ${artist.venues.join(", ")})`,
        );
      });
    }

    console.log(`\n🎪 CONCERTS DATABASE:`);
    const totalBandEntries = concertsData.shows.reduce((total, show) => {
      return (
        total +
        show.events.reduce((eventTotal, event) => {
          return eventTotal + (event.bands ? event.bands.length : 0);
        }, 0)
      );
    }, 0);

    console.log(`   total band entries: ${totalBandEntries}`);
    if (problemConcertBands.length === 0) {
      console.log(`   ✅ clean - no non-artist entries found`);
    } else {
      console.log(
        `   ❌ found ${problemConcertBands.length} non-artist entries:`,
      );
      problemConcertBands.forEach((band) => {
        console.log(
          `     - ${band.text} (venue: ${band.venue}, date: ${band.date})`,
        );
      });
    }

    console.log(`\n📈 SUMMARY:`);
    if (problemArtists.length === 0 && problemConcertBands.length === 0) {
      console.log(`   🎉 both databases are clean!`);
      return true;
    } else {
      console.log(
        `   ⚠️  found ${problemArtists.length + problemConcertBands.length} total issues`,
      );
      console.log(`   💡 run: node scripts/consolidated-cleanup.js`);
      return false;
    }
  } catch (error) {
    console.error("💥 error during verification:", error.message);
    return false;
  }
}

// run verification
await verifyDatabasesCleanliness();
