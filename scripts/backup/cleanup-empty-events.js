import { readFile, writeFile } from "fs/promises";

async function cleanupEmptyEvents(options = {}) {
  const { dryRun = false, verbose = true } = options;

  if (verbose) console.log("🧹 cleaning up empty events (no bands)...");

  try {
    const concertsData = JSON.parse(
      await readFile("./src/data/concerts.json", "utf-8"),
    );

    let removedEvents = 0;
    let removedShows = 0;
    const removedEntries = [];

    // process each show day
    concertsData.shows = concertsData.shows.filter((show) => {
      // filter out events with no bands
      const originalEventCount = show.events.length;

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
          if (verbose) {
            console.log(
              `  ❌ removed empty event: ${event.venue?.text} on ${show.day} (${event.extra || "no extra info"})`,
            );
          }
          return false;
        }
        return true;
      });

      // if all events were removed from this show day, remove the entire show
      if (show.events.length === 0) {
        removedShows++;
        if (verbose) {
          console.log(
            `  ❌ removed entire show day: ${show.day} (no events remaining)`,
          );
        }
        return false;
      }

      return true;
    });

    if (verbose) {
      console.log(`\n📊 cleanup summary:`);
      console.log(`   🗑️  removed events: ${removedEvents}`);
      console.log(`   🗑️  removed show days: ${removedShows}`);
      console.log(`   📅 remaining show days: ${concertsData.shows.length}`);
    }

    if (removedEvents === 0 && removedShows === 0) {
      console.log("✅ no empty events found!");
      return;
    }

    if (dryRun) {
      console.log(
        `\n🔍 dry run complete - would remove ${removedEvents} events and ${removedShows} show days`,
      );
      return;
    }

    // update metadata
    concertsData.lastUpdated = new Date().toISOString();
    if (!concertsData.cleanup) {
      concertsData.cleanup = {};
    }

    concertsData.cleanup = {
      ...concertsData.cleanup,
      lastEmptyEventCleanup: new Date().toISOString(),
      removedEmptyEvents: removedEvents,
      removedEmptyShows: removedShows,
      removedEntries: removedEntries,
    };

    // write updated data
    await writeFile(
      "./src/data/concerts.json",
      JSON.stringify(concertsData, null, 2),
    );

    console.log(`\n🎉 cleanup complete!`);
    console.log(`   🗑️  removed ${removedEvents} empty events`);
    console.log(`   🗑️  removed ${removedShows} empty show days`);
    console.log(`   📅 remaining: ${concertsData.shows.length} show days`);
  } catch (error) {
    console.error("💥 error during cleanup:", error.message);
  }
}

// run the script
const dryRun = process.argv.includes("--dry-run");
const verbose = !process.argv.includes("--quiet");

await cleanupEmptyEvents({ dryRun, verbose });
