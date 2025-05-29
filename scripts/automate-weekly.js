#!/usr/bin/env node
// weekly automated concert scraping, database processing, and new artist verification
import { execSync } from "child_process";
import { readFile } from "fs/promises";

// configuration
const SCRAPE_TIMEOUT = 300000; // 5 minutes
const PROCESS_TIMEOUT = 180000; // 3 minutes

// helper to run shell commands with proper error handling
function runCommand(command, description, timeout = 60000) {
  console.log(`🚀 ${description}...`);
  try {
    const output = execSync(command, {
      stdio: "inherit",
      timeout,
      cwd: process.cwd(),
      env: { ...process.env }, // ensure environment variables are passed to child process
    });
    console.log(`✅ ${description} completed`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

// helper to check if spotify credentials are available
function checkSpotifyCredentials() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.log(`\n⚠️  spotify credentials not found in environment`);
    console.log(
      `   this may be expected if you're not using spotify verification`,
    );
    console.log(
      `   to enable spotify verification, set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET`,
    );
    console.log(`   in your .env file or environment variables`);
    return false;
  }
  return true;
}

// load .env file if it exists
async function loadEnvFile() {
  try {
    // try multiple possible locations for the .env file
    const possibleEnvPaths = [
      new URL("../.env", import.meta.url).pathname, // relative to this script
      new URL("../../.env", import.meta.url).pathname, // one level up
      new URL(".env", import.meta.url).pathname, // same directory
      `${process.cwd()}/.env`, // current working directory
    ];

    let loaded = false;
    let envContent;

    // try each path until we find one
    for (const envPath of possibleEnvPaths) {
      try {
        envContent = await readFile(envPath, "utf-8");
        console.log(`✅ found .env file at ${envPath}`);
        loaded = true;
        break;
      } catch (err) {
        // continue to next path
      }
    }

    if (!loaded) {
      throw new Error("no .env file found in any location");
    }

    // parse the env file
    envContent.split("\n").forEach((line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (key && value) process.env[key] = value;
      }
    });

    console.log(`✅ loaded environment variables from .env file`);
  } catch (error) {
    // It's ok if .env doesn't exist, we'll use environment variables
    console.log(`ℹ️  no .env file found, using environment variables`);
  }
}

// main automation function
async function runAutomation() {
  const startTime = Date.now();
  console.log(`🎸 starting weekly bay area punk concert automation...`);
  console.log(`⏰ started at: ${new Date().toLocaleString()}`);

  // Try to load .env file for local development
  await loadEnvFile();

  // Check if Spotify credentials are available
  checkSpotifyCredentials();

  // step 1: scrape new concert data
  console.log(`\n📡 step 1: scraping concert data`);
  const scrapeSuccess = runCommand(
    "node scripts/scrape-concerts.js",
    "scraping concerts",
    SCRAPE_TIMEOUT,
  );

  if (!scrapeSuccess) {
    console.error(`❌ automation failed at scraping step`);
    process.exit(1);
  }

  // step 2: process databases and verify new artists
  console.log(`\n🔄 step 2: processing databases and verifying new artists`);
  const processSuccess = runCommand(
    "node scripts/process-databases.js",
    "processing databases with spotify verification",
    PROCESS_TIMEOUT,
  );

  if (!processSuccess) {
    console.error(`❌ automation failed at database processing step`);
    process.exit(1);
  }

  // step 3: show summary stats
  console.log(`\n📊 step 3: automation summary`);
  try {
    const artistsData = JSON.parse(
      await readFile("./src/data/artists.json", "utf-8"),
    );
    const venuesData = JSON.parse(
      await readFile("./src/data/venues.json", "utf-8"),
    );
    const concertsData = JSON.parse(
      await readFile("./src/data/concerts.json", "utf-8"),
    );

    console.log(`🎵 total artists: ${artistsData.total}`);
    console.log(`🏢 total venues: ${venuesData.total}`);
    console.log(`🎪 total concerts: ${concertsData.total}`);

    if (artistsData.spotifyVerification?.stats) {
      const stats = artistsData.spotifyVerification.stats;
      console.log(
        `✅ spotify verified: ${stats.spotifyVerified}/${stats.totalArtists} (${Math.round((stats.spotifyVerified / stats.totalArtists) * 100)}%)`,
      );
    }
  } catch (error) {
    console.warn(`⚠️  could not load summary stats: ${error.message}`);
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n🎉 automation completed successfully in ${duration}s`);
  console.log(`⏰ finished at: ${new Date().toLocaleString()}`);
}

// run automation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // parse command line arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    switch (arg) {
      case "--help":
        console.log(`
weekly automated concert processing

usage: node scripts/automate-weekly.js

this script:
1. scrapes new concert data
2. processes databases with duplicate merging and spelling corrections
3. automatically verifies any new artists on spotify
4. provides summary statistics

examples:
  node scripts/automate-weekly.js             # run full weekly automation
  npm run automate-weekly                     # using npm script
        `);
        process.exit(0);
    }
  }

  runAutomation().catch((error) => {
    console.error(`💥 automation crashed:`, error);
    process.exit(1);
  });
}

export { runAutomation };
