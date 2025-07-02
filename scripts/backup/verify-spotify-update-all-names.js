import { readFile, writeFile } from "fs/promises";
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

// configuration for name updates (optimized for spotify's rate limits)
const RATE_LIMIT_DELAY = 100; // ms between individual requests (~10 req/sec, well under 100/min limit)
const BATCH_DELAY = 500; // ms between batches (reduced since individual delays handle rate limiting)
const BATCH_SIZE = 10; // artists per batch (increased for better efficiency)
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

// search for artist and get official name
//
// ⚠️  ACCURACY NOTICE: This automated verification is not 100% accurate.
// The system may occasionally match artists with similar names incorrectly.
// Original scraped names are preserved in originalScrapedName field.
// Users should verify critical information independently when needed.
async function getOfficialArtistName(artistName, token) {
  try {
    const query = encodeURIComponent(artistName);
    const endpoint = `/v1/search?q=${query}&type=artist&limit=10`;

    const response = await spotifyRequest(endpoint, token);

    if (response.artists && response.artists.items.length > 0) {
      // find exact match first
      const exactMatch = response.artists.items.find(
        (artist) =>
          artist.name.toLowerCase().trim() === artistName.toLowerCase().trim(),
      );

      if (exactMatch) {
        return {
          found: true,
          officialName: exactMatch.name,
          spotifyData: {
            id: exactMatch.id,
            name: exactMatch.name,
            followers: exactMatch.followers.total,
            popularity: exactMatch.popularity,
            genres: exactMatch.genres,
            verified: true,
            searchQuery: artistName,
            matchType: "exact",
            nameUpdated: true,
            nameUpdateDate: new Date().toISOString(),
          },
        };
      }

      // if no exact match, check for close matches
      const closeMatches = response.artists.items.filter((artist) => {
        const artistNameLower = artistName
          .toLowerCase()
          .replace(/[^\w\s]/g, "");
        const spotifyNameLower = artist.name
          .toLowerCase()
          .replace(/[^\w\s]/g, "");
        return (
          spotifyNameLower.includes(artistNameLower) ||
          artistNameLower.includes(spotifyNameLower)
        );
      });

      if (closeMatches.length > 0) {
        const bestMatch = closeMatches[0];
        return {
          found: true,
          officialName: bestMatch.name,
          spotifyData: {
            id: bestMatch.id,
            name: bestMatch.name,
            followers: bestMatch.followers.total,
            popularity: bestMatch.popularity,
            genres: bestMatch.genres,
            verified: false, // not an exact match
            searchQuery: artistName,
            matchType: "partial",
            confidence: "medium",
            nameUpdated: true,
            nameUpdateDate: new Date().toISOString(),
          },
        };
      }
    }

    // no matches found
    return {
      found: false,
      officialName: artistName, // keep original name
      spotifyData: {
        notFound: true,
        searchQuery: artistName,
        searchResults: response.artists?.items?.length || 0,
        nameChecked: true,
        nameCheckDate: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`error checking name for ${artistName}:`, error.message);
    return {
      found: false,
      officialName: artistName, // keep original name on error
      error: error.message,
    };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// helper function to save artists data
async function saveArtistsData(artists, verbose = true) {
  try {
    await writeFile(
      "src/data/artists.json",
      JSON.stringify(artists, null, 2),
      "utf-8",
    );
    if (verbose) console.log("💾 saved changes to artists.json");
  } catch (error) {
    console.error("❌ failed to save artists data:", error.message);
    throw error;
  }
}

// check if artist already has verified spotify name
function hasVerifiedSpotifyName(artist) {
  return (
    artist.spotifyVerified === true &&
    artist.spotifyData?.verified === true &&
    artist.spotifyData?.nameUpdated === true &&
    artist.spotifyData?.nameUpdateDate
  );
}

// main function to update all artist names
export async function updateAllArtistNames(options = {}) {
  const {
    limit,
    verbose = true,
    dryRun = false,
    skipVerified = true,
    saveFrequency = 10,
  } = options;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "spotify client id and secret must be set in environment variables",
    );
  }

  try {
    // load artists data
    const artistsData = await readFile("src/data/artists.json", "utf-8");
    const artists = JSON.parse(artistsData);

    // get all artists, filtering out verified ones if requested
    let artistsToProcess = artists.artists;

    if (skipVerified) {
      const originalCount = artistsToProcess.length;
      artistsToProcess = artistsToProcess.filter(
        (artist) => !hasVerifiedSpotifyName(artist),
      );
      const skippedCount = originalCount - artistsToProcess.length;
      if (verbose && skippedCount > 0) {
        console.log(
          `⏭️  skipping ${skippedCount} artists with verified spotify names`,
        );
      }
    }

    if (limit) {
      artistsToProcess = artistsToProcess.slice(0, limit);
    }

    if (verbose) {
      console.log(`🔄 checking names for ${artistsToProcess.length} artists`);
      if (limit && artists.artists.length > limit) {
        console.log(
          `   (limited from ${artists.artists.length} total artists)`,
        );
      }
      if (dryRun) {
        console.log("   🧪 dry run mode - no changes will be saved");
      }
      if (skipVerified) {
        console.log("   ✅ skipping artists with verified spotify names");
      }
    }

    // get spotify access token
    const token = await getSpotifyToken();
    if (verbose) console.log("🔑 obtained spotify access token");

    let checkedCount = 0;
    let updatedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;
    let unchangedCount = 0;
    let needsSave = false;

    // process artists in batches to avoid rate limiting
    for (let i = 0; i < artistsToProcess.length; i += BATCH_SIZE) {
      const batch = artistsToProcess.slice(i, i + BATCH_SIZE);

      for (const artist of batch) {
        try {
          if (verbose) {
            console.log(
              `🔍 checking ${artist.name} (${checkedCount + 1}/${artistsToProcess.length})`,
            );
          }

          const result = await getOfficialArtistName(artist.name, token);

          if (result.found) {
            const originalName = artist.name;
            const nameChanged = originalName !== result.officialName;

            if (nameChanged) {
              if (!dryRun) {
                // store the original name before updating
                artist.name = result.officialName;

                // update or merge spotify data
                artist.spotifyData = {
                  ...artist.spotifyData,
                  ...result.spotifyData,
                  originalScrapedName:
                    artist.spotifyData?.originalScrapedName || originalName,
                };

                // update verification status if we found an exact match
                if (result.spotifyData.verified) {
                  artist.spotifyVerified = true;
                }

                needsSave = true;
              }

              updatedCount++;
              if (verbose) {
                const dryRunPrefix = dryRun ? "[DRY RUN] " : "";
                console.log(
                  `  ✅ ${dryRunPrefix}name updated: "${originalName}" → "${result.officialName}"`,
                );
              }
            } else {
              unchangedCount++;
              if (verbose) console.log(`  ✓ name unchanged: ${artist.name}`);

              // still update spotify data to mark as checked
              if (!dryRun && result.spotifyData) {
                artist.spotifyData = {
                  ...artist.spotifyData,
                  ...result.spotifyData,
                };
                needsSave = true;
              }
            }
          } else {
            notFoundCount++;
            if (verbose) console.log(`  ❌ not found: ${artist.name}`);

            if (!dryRun && result.spotifyData) {
              // update spotify data to record that we checked
              artist.spotifyData = {
                ...artist.spotifyData,
                ...result.spotifyData,
              };
              needsSave = true;
            }
          }

          checkedCount++;

          // save progress periodically to prevent data loss
          if (!dryRun && needsSave && checkedCount % saveFrequency === 0) {
            try {
              await saveArtistsData(artists, verbose);
              needsSave = false;
            } catch (saveError) {
              console.error("⚠️  failed to save progress, continuing...");
            }
          }

          await delay(RATE_LIMIT_DELAY);
        } catch (error) {
          console.error(`❌ error checking ${artist.name}:`, error.message);
          errorCount++;
        }
      }

      // delay between batches
      if (i + BATCH_SIZE < artistsToProcess.length) {
        if (verbose)
          console.log(`⏳ waiting ${BATCH_DELAY}ms between batches...`);
        await delay(BATCH_DELAY);
      }
    }

    // save any remaining changes
    if (!dryRun && needsSave) {
      await saveArtistsData(artists, verbose);
    }

    if (verbose) {
      console.log("\n📊 name update complete:");
      console.log(`   checked: ${checkedCount} artists`);
      console.log(`   updated: ${updatedCount} names`);
      console.log(`   unchanged: ${unchangedCount} names`);
      console.log(`   not found: ${notFoundCount}`);
      if (errorCount > 0) {
        console.log(`   errors: ${errorCount}`);
      }
      if (dryRun) {
        console.log("\n💡 run without --dry-run to apply changes");
      }
    }

    return {
      checked: checkedCount,
      updated: updatedCount,
      unchanged: unchangedCount,
      notFound: notFoundCount,
      errors: errorCount,
    };
  } catch (error) {
    console.error("❌ name update failed:", error.message);
    throw error;
  }
}

// run as standalone script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = {};

  // parse command line arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    switch (arg) {
      case "--limit":
        options.limit = parseInt(process.argv[++i], 10);
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--quiet":
        options.verbose = false;
        break;
      case "--skip-verified":
        options.skipVerified = true;
        break;
      case "--no-skip-verified":
        options.skipVerified = false;
        break;
      case "--save-frequency":
        options.saveFrequency = parseInt(process.argv[++i], 10);
        break;
      case "--help":
        console.log(`
spotify artist name updater

usage: node scripts/verify-spotify-update-all-names.js [options]

options:
  --limit N           only process N artists
  --dry-run           show what would be changed without saving
  --quiet             minimal output
  --skip-verified     skip artists with verified spotify names (default)
  --no-skip-verified  check all artists, even verified ones
  --save-frequency N  save progress every N artists (default: 10)
  --help              show this help

examples:
  node scripts/verify-spotify-update-all-names.js                     # update all artist names
  node scripts/verify-spotify-update-all-names.js --limit 50          # check first 50 artists
  node scripts/verify-spotify-update-all-names.js --dry-run           # preview changes
  node scripts/verify-spotify-update-all-names.js --dry-run --limit 10 # preview first 10
  node scripts/verify-spotify-update-all-names.js --no-skip-verified  # recheck all artists
  node scripts/verify-spotify-update-all-names.js --save-frequency 5  # save every 5 artists
        `);
        process.exit(0);
    }
  }

  updateAllArtistNames(options).catch(console.error);
}
