import { readFile, writeFile, copyFile, unlink } from "fs/promises";
import https from "https";
import { resolve } from "path";

// load environment variables from .env file
async function loadEnvFile() {
  try {
    const envPath = resolve(".env");
    const envContent = await readFile(envPath, "utf-8");
    const lines = envContent.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=");
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    // .env file might not exist, that's ok
  }
}

// load .env file before accessing environment variables
await loadEnvFile();

// spotify web api credentials
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// configuration
const RATE_LIMIT_DELAY = 50; // ms between individual requests (was 100)
const BATCH_DELAY = 200; // ms between batches (was 500)
const BATCH_SIZE = 20; // artists per batch (was 10)
const MAX_RETRIES = 3;

// helper to make spotify api requests with retry logic
async function spotifyRequest(endpoint, token, retries = 0) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.spotify.com",
      port: 443,
      path: endpoint,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);

          // handle rate limiting
          if (res.statusCode === 429) {
            const retryAfter =
              parseInt(res.headers["retry-after"] || "1", 10) * 1000;
            setTimeout(() => {
              if (retries < MAX_RETRIES) {
                spotifyRequest(endpoint, token, retries + 1)
                  .then(resolve)
                  .catch(reject);
              } else {
                reject(new Error(`rate limited after ${MAX_RETRIES} retries`));
              }
            }, retryAfter);
            return;
          }

          if (res.statusCode >= 400) {
            reject(
              new Error(
                `http ${res.statusCode}: ${parsed.error?.message || "unknown error"}`,
              ),
            );
            return;
          }

          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      if (retries < MAX_RETRIES) {
        setTimeout(
          () => {
            spotifyRequest(endpoint, token, retries + 1)
              .then(resolve)
              .catch(reject);
          },
          1000 * (retries + 1),
        );
      } else {
        reject(error);
      }
    });
    req.end();
  });
}

// get spotify access token
async function getSpotifyToken() {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    "base64",
  );

  return new Promise((resolve, reject) => {
    const data = "grant_type=client_credentials";

    const options = {
      hostname: "accounts.spotify.com",
      port: 443,
      path: "/api/token",
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": data.length,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode === 200) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(`token request failed: ${responseData}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// verify a single artist on spotify - CONSERVATIVE VERSION
async function verifyArtistOnSpotify(artistName, token) {
  try {
    const query = encodeURIComponent(artistName);
    const endpoint = `/v1/search?q=${query}&type=artist&limit=10`;

    const response = await spotifyRequest(endpoint, token);

    if (response.artists && response.artists.items.length > 0) {
      // find exact match first - be more flexible with exact matching
      const exactMatch = response.artists.items.find((artist) => {
        const normalizeForComparison = (name) =>
          name
            .toLowerCase()
            .trim()
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, " ")
            .replace(/^the\s+/, "") // remove "the" prefix for comparison
            .replace(/\s+the$/, ""); // remove "the" suffix for comparison

        const normalizedArtist = normalizeForComparison(artistName);
        const normalizedSpotify = normalizeForComparison(artist.name);

        // exact match conditions (more flexible)
        return (
          normalizedArtist === normalizedSpotify ||
          // also check if one is just "The" + the other
          normalizeForComparison(`the ${artistName}`) === normalizedSpotify ||
          normalizedArtist === normalizeForComparison(`the ${artist.name}`)
        );
      });

      if (exactMatch) {
        return {
          found: true,
          spotifyUrl: exactMatch.external_urls.spotify,
          spotifyData: {
            id: exactMatch.id,
            spotifyName: exactMatch.name, // store spotify's name separately
            scrapedName: artistName, // preserve original scraped name
            followers: exactMatch.followers.total,
            popularity: exactMatch.popularity,
            genres: exactMatch.genres,
            matchType: "exact",
            searchQuery: artistName,
            searchResults: response.artists.items.length,
            verifiedAt: new Date().toISOString(),
          },
        };
      }
    }

    // no matches found
    return {
      found: false,
      spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(artistName)}`,
      spotifyData: {
        notFound: true,
        scrapedName: artistName, // preserve original scraped name
        searchQuery: artistName,
        searchResults: response.artists?.items?.length || 0,
        verifiedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`error verifying ${artistName}:`, error.message);
    return {
      found: false,
      spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(artistName)}`,
      spotifyData: {
        error: error.message,
        scrapedName: artistName, // preserve original scraped name
        searchQuery: artistName,
        verifiedAt: new Date().toISOString(),
      },
    };
  }
}

// helper to check what kind of verification an artist needs
function getVerificationStatus(artist) {
  // already verified successfully
  if (
    artist.spotifyVerified &&
    artist.spotifyUrl &&
    !artist.spotifyUrl.includes("/search/")
  ) {
    return "verified";
  }

  // previously failed (not found or error)
  if (artist.spotifyData?.notFound || artist.spotifyData?.error) {
    return "failed";
  }

  // has search URL but not properly verified
  if (artist.spotifyUrl && artist.spotifyUrl.includes("/search/")) {
    return "search-only";
  }

  // completely unverified
  return "unverified";
}

// delay helper
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// safe file save with backup
async function safeSaveArtists(
  artistsData,
  createBackup = false,
  verbose = false,
) {
  try {
    let backupPath;

    // Create backup only when requested (start of script)
    if (createBackup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupPath = `src/data/artists.backup.${timestamp}.json`;

      await copyFile("src/data/artists.json", backupPath);
      if (verbose) console.log(`📋 backup created: ${backupPath}`);
    }

    // Write new data
    await writeFile(
      "src/data/artists.json",
      JSON.stringify(artistsData, null, 2),
    );

    return createBackup ? { success: true, backupPath } : true;
  } catch (error) {
    console.error(`⚠️  failed to save artists data:`, error.message);
    return false;
  }
}

// non-artist filtering
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
  if (NON_ARTIST_FILTERS.includes(normalized)) return true;
  if (CANCELLED_PATTERNS.some((pattern) => pattern.test(artistName)))
    return true;
  return false;
}

function isVenueAdministrative(artist) {
  const venueList = artist.venues || [];
  if (venueList.length === 1) {
    const venueName = venueList[0].toLowerCase();
    const artistName = artist.name.toLowerCase();
    if (venueName.includes("924 gilman") && artistName.includes("meeting")) {
      return true;
    }
  }
  return false;
}

// main verification function
async function spotifyVerify(options = {}) {
  const {
    mode = "new", // "new", "failed", "all", "force-all", "partial"
    limit = null,
    verbose = true,
  } = options;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "spotify client id and secret must be set in environment variables",
    );
  }

  if (verbose) {
    console.log(`🎵 spotify verification mode: ${mode}`);
    if (limit) console.log(`📝 limiting to ${limit} artists`);
  }

  // Store reference to artistsData for graceful shutdown
  let artistsData;
  let backupPath; // track backup file for cleanup

  // Graceful shutdown handler
  const gracefulShutdown = async (signal) => {
    console.log(
      `\n⚠️  received ${signal}, saving progress and shutting down...`,
    );
    if (artistsData) {
      console.log(`💾 emergency save...`);
      const saved = await safeSaveArtists(artistsData, false, true);
      if (saved) {
        console.log(`✅ data saved successfully`);
      } else {
        console.log(`❌ failed to save data`);
      }
    }
    process.exit(0);
  };

  // Register shutdown handlers
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

  try {
    // load artists data
    artistsData = JSON.parse(await readFile("src/data/artists.json", "utf-8"));

    // Create single backup at start of script
    if (verbose) console.log(`📋 creating initial backup...`);
    const result = await safeSaveArtists(artistsData, true, verbose);
    if (result && result.backupPath) {
      backupPath = result.backupPath;
    }

    // filter artists based on mode
    let artistsToProcess = [];

    switch (mode) {
      case "new":
        artistsToProcess = artistsData.artists.filter(
          (artist) => getVerificationStatus(artist) === "unverified",
        );
        break;

      case "failed":
        artistsToProcess = artistsData.artists.filter((artist) =>
          ["failed", "search-only"].includes(getVerificationStatus(artist)),
        );
        break;

      case "all":
        artistsToProcess = artistsData.artists.filter(
          (artist) => getVerificationStatus(artist) !== "verified",
        );
        break;

      case "force-all":
        artistsToProcess = artistsData.artists.slice();
        break;
      case "partial":
        // Re-evaluate artists that were previously verified with partial/medium confidence
        artistsToProcess = artistsData.artists.filter((artist) => {
          return (
            artist.spotifyVerified &&
            artist.spotifyData &&
            !artist.spotifyData.notFound &&
            !artist.spotifyData.error &&
            (artist.spotifyData.matchType === "partial" ||
              artist.spotifyData.confidence === "medium")
          );
        });
        break;

      default:
        throw new Error(`unknown mode: ${mode}`);
    }

    // filter out non-artists
    artistsToProcess = artistsToProcess.filter(
      (artist) => !isNonArtist(artist.name) && !isVenueAdministrative(artist),
    );

    if (limit) {
      artistsToProcess = artistsToProcess.slice(0, limit);
    }

    if (artistsToProcess.length === 0) {
      if (verbose) console.log("✅ no artists need verification");
      return { processed: 0, found: 0, notFound: 0, errors: 0 };
    }

    if (verbose) {
      console.log(`🔍 processing ${artistsToProcess.length} artists`);
      const statusCounts = {};
      artistsData.artists.forEach((artist) => {
        const status = getVerificationStatus(artist);
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      console.log(
        `📊 current status: verified=${statusCounts.verified || 0}, unverified=${statusCounts.unverified || 0}, failed=${statusCounts.failed || 0}, search-only=${statusCounts["search-only"] || 0}`,
      );
    }

    // get spotify access token
    const token = await getSpotifyToken();
    if (verbose) console.log("🔑 obtained spotify access token");

    let processed = 0;
    let found = 0;
    let notFound = 0;
    let errors = 0;

    // process artists in batches
    for (let i = 0; i < artistsToProcess.length; i += BATCH_SIZE) {
      const batch = artistsToProcess.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(artistsToProcess.length / BATCH_SIZE);

      if (verbose) console.log(`\n📦 batch ${batchNum}/${totalBatches}`);

      for (const artist of batch) {
        try {
          if (verbose) {
            console.log(
              `🔍 ${artist.name} (${processed + 1}/${artistsToProcess.length})`,
            );
          }

          const result = await verifyArtistOnSpotify(artist.name, token);

          // CRITICAL: NEVER update artist.name - only update verification data
          artist.spotifyUrl = result.spotifyUrl;
          artist.spotifyVerified = result.found;
          artist.spotifyData = result.spotifyData;

          if (result.found) {
            found++;
            if (verbose) {
              console.log(`  ✅ found: ${result.spotifyData.spotifyName}`);
            }
          } else {
            notFound++;
            if (verbose) console.log(`  ❌ not found`);
          }

          processed++;
          await delay(RATE_LIMIT_DELAY);
        } catch (error) {
          console.error(`❌ error verifying ${artist.name}:`, error.message);
          errors++;
          processed++;
        }
      }

      // delay between batches and save progress
      if (i + BATCH_SIZE < artistsToProcess.length) {
        if (verbose)
          console.log(`⏳ waiting ${BATCH_DELAY}ms between batches...`);

        // Save progress incrementally to prevent data loss
        if (verbose) console.log(`💾 saving progress...`);

        // Update metadata with current progress
        artistsData.lastUpdated = new Date().toISOString();
        artistsData.spotifyVerification = {
          ...artistsData.spotifyVerification,
          lastVerified: new Date().toISOString(),
          mode: mode,
          stats: {
            total: artistsData.artists.length,
            verified: artistsData.artists.filter((a) => a.spotifyVerified)
              .length,
            notFound: artistsData.artists.filter((a) => a.spotifyData?.notFound)
              .length,
            errors: artistsData.artists.filter((a) => a.spotifyData?.error)
              .length,
          },
        };

        const saved = await safeSaveArtists(artistsData, false, false);
        if (verbose && saved) console.log(`✅ progress saved`);
        if (!saved) console.log(`⚠️  continuing without save...`);

        await delay(BATCH_DELAY);
      }
    }

    // update metadata
    artistsData.lastUpdated = new Date().toISOString();
    artistsData.spotifyVerification = {
      ...artistsData.spotifyVerification,
      lastVerified: new Date().toISOString(),
      mode: mode,
      stats: {
        total: artistsData.artists.length,
        verified: artistsData.artists.filter((a) => a.spotifyVerified).length,
        notFound: artistsData.artists.filter((a) => a.spotifyData?.notFound)
          .length,
        errors: artistsData.artists.filter((a) => a.spotifyData?.error).length,
      },
    };

    // final save (no backup needed)
    if (verbose) console.log(`💾 final save...`);
    const finalSaved = await safeSaveArtists(artistsData, false, verbose);
    if (!finalSaved) {
      throw new Error("Failed to save final results");
    }

    if (verbose) {
      console.log("\n📊 verification complete:");
      console.log(`   processed: ${processed} artists`);
      console.log(
        `   found: ${found} (${Math.round((found / processed) * 100)}%)`,
      );
      console.log(`   not found: ${notFound}`);
      if (errors > 0) console.log(`   errors: ${errors}`);

      const totalVerified = artistsData.artists.filter(
        (a) => a.spotifyVerified,
      ).length;
      const totalArtists = artistsData.artists.length;
      console.log(
        `   overall: ${totalVerified}/${totalArtists} (${Math.round((totalVerified / totalArtists) * 100)}%) verified`,
      );
    }

    // cleanup backup file on successful completion
    if (backupPath) {
      try {
        await unlink(backupPath);
        if (verbose) console.log(`🗑️  removed backup file: ${backupPath}`);
      } catch (error) {
        if (verbose)
          console.log(`⚠️  could not remove backup file: ${backupPath}`);
      }
    }

    return { processed, found, notFound, errors };
  } catch (error) {
    console.error("❌ verification failed:", error.message);
    throw error;
  }
}

// export for use by other scripts (if needed)
export { spotifyVerify, getVerificationStatus };

// run as standalone script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = { verbose: true };

  // parse command line arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    switch (arg) {
      case "--new":
        options.mode = "new";
        break;
      case "--failed":
        options.mode = "failed";
        break;
      case "--all":
        options.mode = "all";
        break;
      case "--force":
        options.mode = "force-all";
        break;
      case "--partial":
        options.mode = "partial";
        break;
      case "--limit":
        options.limit = parseInt(process.argv[++i], 10);
        break;
      case "--quiet":
        options.verbose = false;
        break;
      case "--help":
        console.log(`
spotify verification tool - single source of truth for all spotify verification

usage: node scripts/spotify-verify.js [mode] [options]

modes:
  --new      verify only unverified artists (default)
  --failed   recheck artists that previously failed verification
  --all      verify all artists that need verification (new + failed)
  --force    force recheck all artists (including already verified)
  --partial  re-evaluate all previously verified artists with current stricter logic

options:
  --limit N  only process N artists
  --quiet    minimal output
  --help     show this help

examples:
  node scripts/spotify-verify.js                    # verify new artists
  node scripts/spotify-verify.js --failed           # recheck failed artists
  node scripts/spotify-verify.js --partial          # re-evaluate previously verified artists
  node scripts/spotify-verify.js --all --limit 50   # verify up to 50 unverified artists
  node scripts/spotify-verify.js --force            # recheck everything

important: this script NEVER changes artist names - it only adds spotify verification data
        `);
        process.exit(0);
    }
  }

  spotifyVerify(options).catch(console.error);
}
