import { readFile, writeFile, copyFile, unlink } from "fs/promises";

// script to clean up bad partial matches that are clearly false positives

async function cleanPartialMatches() {
  console.log("🧹 cleaning up bad partial matches...");

  // load artists data
  const artistsData = JSON.parse(
    await readFile("src/data/artists.json", "utf-8"),
  );

  // create backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `src/data/artists.backup.clean-partials.${timestamp}.json`;
  await copyFile("src/data/artists.json", backupPath);
  console.log(`📋 backup created: ${backupPath}`);

  // find all partial matches
  const partialMatches = artistsData.artists.filter(
    (artist) =>
      artist.spotifyVerified &&
      artist.spotifyData &&
      artist.spotifyData.matchType === "partial",
  );

  console.log(`\n🔍 found ${partialMatches.length} partial matches to review:`);

  // show all partial matches for review
  partialMatches.forEach((artist, i) => {
    console.log(
      `${i + 1}. "${artist.name}" → "${artist.spotifyData.spotifyName}"`,
    );
    console.log(
      `   Confidence: ${artist.spotifyData.confidence}, Popularity: ${artist.spotifyData.popularity}, Followers: ${artist.spotifyData.followers}`,
    );
  });

  console.log(
    `\n❓ these all look like false positives. converting them to "not found"...`,
  );

  // convert partial matches to "not found"
  let converted = 0;
  partialMatches.forEach((artist) => {
    // reset to "not found" state
    artist.spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(artist.name)}`;
    artist.spotifyVerified = false;
    artist.spotifyData = {
      notFound: true,
      scrapedName: artist.name,
      searchQuery: artist.name,
      searchResults: artist.spotifyData.searchResults || 0,
      verifiedAt: new Date().toISOString(),
      note: "converted from bad partial match",
    };
    converted++;
  });

  // update metadata
  artistsData.lastUpdated = new Date().toISOString();
  artistsData.spotifyVerification = {
    ...artistsData.spotifyVerification,
    lastCleaned: new Date().toISOString(),
    stats: {
      total: artistsData.artists.length,
      verified: artistsData.artists.filter((a) => a.spotifyVerified).length,
      notFound: artistsData.artists.filter((a) => a.spotifyData?.notFound)
        .length,
      errors: artistsData.artists.filter((a) => a.spotifyData?.error).length,
    },
  };

  // save cleaned data
  await writeFile(
    "src/data/artists.json",
    JSON.stringify(artistsData, null, 2),
  );

  console.log(`\n✅ converted ${converted} partial matches to "not found"`);
  console.log(`📊 new stats:`);
  console.log(`   verified: ${artistsData.spotifyVerification.stats.verified}`);
  console.log(
    `   not found: ${artistsData.spotifyVerification.stats.notFound}`,
  );
  console.log(`   errors: ${artistsData.spotifyVerification.stats.errors}`);

  // cleanup backup file on successful completion
  try {
    await unlink(backupPath);
    console.log(`🗑️  removed backup file: ${backupPath}`);
  } catch (error) {
    console.log(`⚠️  could not remove backup file: ${backupPath}`);
  }
}

// run the cleanup
cleanPartialMatches().catch(console.error);
