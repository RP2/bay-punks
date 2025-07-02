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

// configuration
const RATE_LIMIT_DELAY = 100; // ms between individual requests
const BATCH_DELAY = 1000; // ms between batches
const BATCH_SIZE = 10; // artists per batch
const MAX_RETRIES = 3;

// helper to check if artist already has a valid spotify url
function hasValidSpotifyUrl(artist) {
  return (
    artist.spotifyVerified === true ||
    (artist.spotifyUrl &&
      artist.spotifyUrl !== null &&
      !artist.spotifyUrl.includes("/search/") &&
      artist.spotifyUrl.startsWith("https://open.spotify.com/artist/")) ||
    (artist.spotifyData &&
      (artist.spotifyData.notFound === true ||
        artist.spotifyData.noGoodMatch === true))
  );
}

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
        "Content-Length": Buffer.byteLength(data),
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
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `failed to get token: ${parsed.error_description || "unknown error"}`,
              ),
            );
            return;
          }
          resolve(parsed.access_token);
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

// enhanced artist verification with better matching logic
async function verifyArtistOnSpotify(artistName, token) {
  try {
    const searchQuery = encodeURIComponent(artistName.toLowerCase());
    const endpoint = `/v1/search?q=${searchQuery}&type=artist&limit=20`;

    const response = await spotifyRequest(endpoint, token);

    if (!response.artists || !response.artists.items.length) {
      return null;
    }

    // normalize artist name for comparison
    const normalizedSearch = artistName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // try exact matches first
    for (const artist of response.artists.items) {
      const normalizedArtist = artist.name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (normalizedArtist === normalizedSearch) {
        return {
          name: artist.name,
          spotifyUrl: artist.external_urls.spotify,
          spotifyId: artist.id,
          followers: artist.followers.total,
          popularity: artist.popularity,
          genres: artist.genres,
          matchType: "exact",
        };
      }
    }

    // try partial matches with strict thresholds
    for (const artist of response.artists.items) {
      const normalizedArtist = artist.name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      // check if one contains the other with stricter requirements
      const isSubstring =
        (normalizedArtist.includes(normalizedSearch) ||
          normalizedSearch.includes(normalizedArtist)) &&
        normalizedSearch.length > 3 &&
        normalizedArtist.length > 3;

      // calculate similarity ratio to ensure names are close enough
      const longerLength = Math.max(
        normalizedSearch.length,
        normalizedArtist.length,
      );
      const shorterLength = Math.min(
        normalizedSearch.length,
        normalizedArtist.length,
      );
      const similarityRatio = shorterLength / longerLength;

      // only match if:
      // 1. one name contains the other
      // 2. names are reasonably similar in length (at least 60% similarity)
      // 3. artist has decent popularity/followers
      // 4. the difference in length isn't too dramatic
      if (
        isSubstring &&
        similarityRatio >= 0.6 &&
        artist.popularity > 10 &&
        artist.followers.total > 500 &&
        Math.abs(normalizedSearch.length - normalizedArtist.length) <= 10
      ) {
        return {
          name: artist.name,
          spotifyUrl: artist.external_urls.spotify,
          spotifyId: artist.id,
          followers: artist.followers.total,
          popularity: artist.popularity,
          genres: artist.genres,
          matchType: "partial",
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`error verifying ${artistName}:`, error.message);
    return null;
  }
}

// rate limiting helper
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyArtistsIncremental(options = {}) {
  const {
    forceRecheck = false,
    onlyUnverified = true,
    maxArtists = null,
    verbose = true,
  } = options;

  // track processed artists in this run to avoid duplicate api calls
  const processedInThisRun = new Set();

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ spotify credentials not found");
    console.error(
      "please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables",
    );
    console.error(
      "get these by creating an app at https://developer.spotify.com/dashboard",
    );
    return;
  }

  if (verbose) console.log("🎵 starting spotify artist verification...");

  try {
    if (verbose) console.log("🔑 getting spotify access token...");
    const token = await getSpotifyToken();

    if (verbose) console.log("📚 reading artists database...");
    const artistsData = JSON.parse(
      await readFile("./src/data/artists.json", "utf-8"),
    );

    // filter artists based on options
    let artistsToProcess = artistsData.artists;

    if (onlyUnverified && !forceRecheck) {
      // skip artists that already have spotify verification or valid spotify url
      artistsToProcess = artistsData.artists.filter((artist) => {
        // first check if they need verification
        if (hasValidSpotifyUrl(artist)) {
          return false;
        }

        // then filter out non-artist entries
        if (isNonArtist(artist.name) || isVenueAdministrative(artist)) {
          return false;
        }

        return true;
      });
      if (verbose) {
        const alreadyVerified =
          artistsData.artists.length - artistsToProcess.length;
        console.log(`🔍 found ${artistsToProcess.length} unverified artists`);
        console.log(
          `✅ skipping ${alreadyVerified} artists with existing spotify links`,
        );
      }
    } else if (forceRecheck) {
      if (verbose)
        console.log(`🔄 rechecking all ${artistsToProcess.length} artists`);
    }

    if (maxArtists) {
      artistsToProcess = artistsToProcess.slice(0, maxArtists);
      if (verbose) console.log(`📝 limiting to ${maxArtists} artists`);
    }

    if (artistsToProcess.length === 0) {
      console.log("✅ no artists to verify!");
      return;
    }

    let verified = 0;
    let failed = 0;
    let skipped = 0;
    let apiCallsMade = 0;
    const totalToProcess = artistsToProcess.length;

    if (verbose)
      console.log(
        `🚀 processing ${totalToProcess} artists in batches of ${BATCH_SIZE}...`,
      );

    // process in batches
    for (let i = 0; i < artistsToProcess.length; i += BATCH_SIZE) {
      const batch = artistsToProcess.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(artistsToProcess.length / BATCH_SIZE);

      if (verbose) console.log(`\n📦 batch ${batchNumber}/${totalBatches}`);

      await Promise.all(
        batch.map(async (artist, batchIndex) => {
          const globalIndex = i + batchIndex;

          try {
            // find the artist in the original array to update it
            const originalArtist = artistsData.artists.find(
              (a) => a.id === artist.id,
            );
            if (!originalArtist) return;

            // double-check that we haven't already verified this artist (safety check)
            if (!forceRecheck && hasValidSpotifyUrl(originalArtist)) {
              if (verbose) {
                console.log(
                  `  ⏭️  [${globalIndex + 1}/${totalToProcess}] ${originalArtist.name} (already verified, skipping)`,
                );
              }
              skipped++;
              return;
            }

            // check if we've already processed this artist name in this run (including similar names)
            const artistKey = originalArtist.name.toLowerCase().trim();
            const normalizedKey = artistKey.replace(/[^a-z0-9]/g, "");

            // check exact match first
            if (processedInThisRun.has(artistKey)) {
              if (verbose) {
                console.log(
                  `  ⏭️  [${globalIndex + 1}/${totalToProcess}] ${originalArtist.name} (exact name processed in this run, skipping)`,
                );
              }
              skipped++;
              return;
            }

            // check for very similar normalized names to avoid duplicate api calls for similar artists
            const existingSimilar = Array.from(processedInThisRun).find(
              (processed) => {
                const processedNormalized = processed.replace(/[^a-z0-9]/g, "");
                return (
                  processedNormalized === normalizedKey &&
                  processedNormalized.length > 3
                );
              },
            );

            if (existingSimilar) {
              if (verbose) {
                console.log(
                  `  ⏭️  [${globalIndex + 1}/${totalToProcess}] ${originalArtist.name} (similar to "${existingSimilar}", skipping)`,
                );
              }
              skipped++;
              return;
            }

            // mark as processed before making api call
            processedInThisRun.add(artistKey);
            apiCallsMade++;

            const spotifyData = await verifyArtistOnSpotify(
              originalArtist.name,
              token,
            );

            if (spotifyData) {
              // store the original name before updating
              const originalName = originalArtist.name;

              // update artist name to the official spotify name
              originalArtist.name = spotifyData.name;
              originalArtist.spotifyUrl = spotifyData.spotifyUrl;
              originalArtist.spotifyVerified = true;
              originalArtist.spotifyData = {
                id: spotifyData.spotifyId,
                followers: spotifyData.followers,
                popularity: spotifyData.popularity,
                genres: spotifyData.genres,
                matchType: spotifyData.matchType,
                verifiedAt: new Date().toISOString(),
                originalScrapedName: originalName, // keep track of original scraped name
              };

              verified++;
              if (verbose) {
                const matchIcon =
                  spotifyData.matchType === "exact" ? "🎯" : "🔍";
                const nameChanged = originalName !== spotifyData.name;
                const changeIndicator = nameChanged ? " (name updated)" : "";
                console.log(
                  `  ${matchIcon} [${globalIndex + 1}/${totalToProcess}] ${originalName} → ${spotifyData.name}${changeIndicator}`,
                );
              }
            } else {
              // no good spotify match found, use search url instead
              const originalName = originalArtist.name;
              const searchQuery = encodeURIComponent(originalName);
              originalArtist.spotifyUrl = `https://open.spotify.com/search/${searchQuery}`;
              originalArtist.spotifyVerified = false;
              originalArtist.spotifyData = {
                verifiedAt: new Date().toISOString(),
                noGoodMatch: true,
                originalScrapedName: originalName,
                fallbackToSearch: true,
              };
              failed++;
              if (verbose)
                console.log(
                  `  🔍 [${globalIndex + 1}/${totalToProcess}] ${originalArtist.name} (no good match, using search)`,
                );
            }
          } catch (error) {
            console.error(`💥 error processing ${artist.name}:`, error.message);
            failed++;
          }

          // small delay between requests within batch
          await delay(RATE_LIMIT_DELAY);
        }),
      );

      // longer delay between batches
      if (i + BATCH_SIZE < artistsToProcess.length) {
        await delay(BATCH_DELAY);
      }
    }

    // update metadata
    artistsData.lastUpdated = new Date().toISOString();
    if (!artistsData.spotifyVerification) {
      artistsData.spotifyVerification = {};
    }

    artistsData.spotifyVerification = {
      ...artistsData.spotifyVerification,
      lastVerified: new Date().toISOString(),
      totalProcessed:
        (artistsData.spotifyVerification.totalProcessed || 0) + totalToProcess,
      totalVerified: artistsData.artists.filter((a) => a.spotifyVerified)
        .length,
      totalFailed: artistsData.artists.filter((a) => a.spotifyData?.notFound)
        .length,
    };

    // write updated data
    await writeFile(
      "./src/data/artists.json",
      JSON.stringify(artistsData, null, 2),
    );

    console.log(`\n🎉 verification complete!`);
    console.log(`   ✅ verified: ${verified}`);
    console.log(`   ❌ not found: ${failed}`);
    console.log(`   ⏭️  skipped: ${skipped}`);
    console.log(`   📊 total processed: ${totalToProcess}`);
    console.log(`   🌐 api calls made: ${apiCallsMade}`);
    console.log(`   💰 api calls saved: ${totalToProcess - apiCallsMade}`);
    if (totalToProcess > 0) {
      console.log(
        `   📈 success rate: ${((verified / totalToProcess) * 100).toFixed(1)}%`,
      );
      console.log(
        `   🚀 api efficiency: ${(((totalToProcess - apiCallsMade) / totalToProcess) * 100).toFixed(1)}% calls avoided`,
      );
    }

    const totalVerified = artistsData.artists.filter(
      (a) => a.spotifyVerified,
    ).length;
    const totalArtists = artistsData.artists.length;
    console.log(
      `   🎵 overall: ${totalVerified}/${totalArtists} (${((totalVerified / totalArtists) * 100).toFixed(1)}%) verified`,
    );
  } catch (error) {
    console.error("💥 verification failed:", error.message);
  }
}

// non-artist filtering - list of entries that are not actual artists
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

// cli interface
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--force":
      options.forceRecheck = true;
      break;
    case "--all":
      options.onlyUnverified = false;
      break;
    case "--limit":
      options.maxArtists = parseInt(args[i + 1], 10);
      i++; // skip next arg
      break;
    case "--quiet":
      options.verbose = false;
      break;
    case "--help":
      console.log(`
spotify artist verification tool

usage: node scripts/verify-spotify-artists.js [options]

options:
  --force     recheck all artists (ignores previous verification)
  --all       process all artists (not just unverified ones)
  --limit N   only process N artists (useful for testing)
  --quiet     minimal output
  --help      show this help

examples:
  node scripts/verify-spotify-artists.js                    # verify unverified artists
  node scripts/verify-spotify-artists.js --limit 10         # test with 10 artists
  node scripts/verify-spotify-artists.js --force --all      # recheck everything
      `);
      process.exit(0);
  }
}

verifyArtistsIncremental(options).catch(console.error);
