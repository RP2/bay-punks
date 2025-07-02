import { readFile, writeFile } from "fs/promises";

// list of entries that are not actual artists
const NON_ARTIST_FILTERS = [
  // venue administrative entries - exact matches only
  "membership meeting",
  "member meeting",
  "members meeting",

  // common non-artist entries that might appear on venue calendars
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

  // generic terms
  "tbd",
  "tba",
  "to be announced",
  "to be determined",

  // venue operations
  "venue meeting",
  "staff meeting",
  "volunteer meeting",
  "board meeting",
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

  return false;
}

// check if an entry is venue-specific administrative content
function isVenueAdministrative(artist) {
  // if it only appears at one venue and matches non-artist patterns
  if (artist.venues && artist.venues.length === 1) {
    const venueName = artist.venues[0].toLowerCase();
    const artistName = artist.name.toLowerCase();

    // 924 gilman specific checks
    if (venueName.includes("924 gilman") && artistName.includes("meeting")) {
      return true;
    }

    // other venue-specific administrative checks could be added here
  }

  return false;
}

async function filterNonArtists(options = {}) {
  const { dryRun = false, verbose = true } = options;

  if (verbose) console.log("🧹 starting non-artist filtering...");

  try {
    if (verbose) console.log("📚 reading artists database...");
    const artistsData = JSON.parse(
      await readFile("./src/data/artists.json", "utf-8"),
    );

    const originalCount = artistsData.artists.length;

    // identify non-artists
    const nonArtists = artistsData.artists.filter((artist) => {
      return isNonArtist(artist.name) || isVenueAdministrative(artist);
    });

    if (verbose) {
      console.log(`\n🔍 found ${nonArtists.length} non-artist entries:`);
      nonArtists.forEach((artist) => {
        const reason = isNonArtist(artist.name)
          ? "matches filter"
          : "venue administrative";
        console.log(
          `  ❌ ${artist.name} (${reason}) - venues: ${artist.venues.join(", ")}`,
        );
      });
    }

    if (nonArtists.length === 0) {
      console.log("✅ no non-artist entries found!");
      return;
    }

    if (dryRun) {
      console.log(
        `\n🔍 dry run complete - would remove ${nonArtists.length} entries`,
      );
      return;
    }

    // filter out non-artists
    artistsData.artists = artistsData.artists.filter((artist) => {
      return !isNonArtist(artist.name) && !isVenueAdministrative(artist);
    });

    // update metadata
    artistsData.lastUpdated = new Date().toISOString();
    if (!artistsData.filtering) {
      artistsData.filtering = {};
    }

    artistsData.filtering = {
      ...artistsData.filtering,
      lastNonArtistFilter: new Date().toISOString(),
      removedCount: nonArtists.length,
      removedEntries: nonArtists.map((artist) => ({
        name: artist.name,
        id: artist.id,
        venues: artist.venues,
        reason: isNonArtist(artist.name)
          ? "matches filter"
          : "venue administrative",
      })),
    };

    // write updated data
    await writeFile(
      "./src/data/artists.json",
      JSON.stringify(artistsData, null, 2),
    );

    console.log(`\n🎉 filtering complete!`);
    console.log(`   📊 original count: ${originalCount}`);
    console.log(`   ❌ removed: ${nonArtists.length}`);
    console.log(`   ✅ remaining: ${artistsData.artists.length}`);
  } catch (error) {
    console.error("💥 error during filtering:", error.message);
  }
}

// run the script
const dryRun = process.argv.includes("--dry-run");
const verbose = !process.argv.includes("--quiet");

await filterNonArtists({ dryRun, verbose });
