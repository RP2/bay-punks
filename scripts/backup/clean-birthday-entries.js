#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";

console.log("🎂 cleaning birthday entries from artist database...");

// load artists data
const artistsData = JSON.parse(await readFile("src/data/artists.json", "utf8"));

// count before
const beforeCount = artistsData.artists.length;
console.log(`artists before cleanup: ${beforeCount}`);

// birthday patterns to match
const birthdayPatterns = [
  /birthday bash/i,
  /birthday celebration/i,
  /birthday party/i,
  /'s.*birthday/i, // matches "Someone's 60th Birthday", "Carmela's Birthday", etc.
  /\d+(?:st|nd|rd|th)\s+birthday/i, // matches "60th Birthday", "21st Birthday", etc.
  /bday bash/i, // abbreviated version
];

// filter out birthday entries
const cleanedArtists = artistsData.artists.filter((artist) => {
  const isBirthday = birthdayPatterns.some((pattern) =>
    pattern.test(artist.name),
  );

  if (isBirthday) {
    console.log(`removing birthday entry: ${artist.name}`);
    return false;
  }

  return true;
});

// count after
const afterCount = cleanedArtists.length;
const removedCount = beforeCount - afterCount;

console.log(`artists after cleanup: ${afterCount}`);
console.log(`birthday entries removed: ${removedCount}`);

// update the data
artistsData.artists = cleanedArtists;

// create backup
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(
  `src/data/artists.backup.${timestamp}.json`,
  JSON.stringify(artistsData, null, 2),
);
console.log(`backup created: artists.backup.${timestamp}.json`);

// save cleaned data
await writeFile("src/data/artists.json", JSON.stringify(artistsData, null, 2));

console.log("✅ birthday entries cleanup complete!");
