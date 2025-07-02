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
          reject(new Error(`failed to parse json: ${error.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`request failed: ${error.message}`));
    });

    req.end();
  });
}

// get spotify access token
async function getSpotifyToken() {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  return new Promise((resolve, reject) => {
    const postData = "grant_type=client_credentials";
    const options = {
      hostname: "accounts.spotify.com",
      port: 443,
      path: "/api/token",
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
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
          if (res.statusCode === 200) {
            resolve(parsed.access_token);
          } else {
            reject(
              new Error(
                `failed to get token: ${parsed.error_description || "unknown error"}`,
              ),
            );
          }
        } catch (error) {
          reject(new Error(`failed to parse token response: ${error.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`token request failed: ${error.message}`));
    });

    req.write(postData);
    req.end();
  });
}

// verify artist on spotify with strict matching
async function verifyArtistOnSpotifyStrict(artistName, token) {
  try {
    const query = encodeURIComponent(artistName);
    const endpoint = `/v1/search?q=${query}&type=artist&limit=10`;

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY));

    const response = await spotifyRequest(endpoint, token);

    if (!response.artists || !response.artists.items.length) {
      return null;
    }

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

// check if a current match meets strict criteria
function isMatchTooLoose(artist) {
  if (!artist.spotifyData || !artist.spotifyData.originalScrapedName) {
    return false;
  }

  const originalName = artist.spotifyData.originalScrapedName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const spotifyName = artist.name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // if it's an exact match, it's fine
  if (originalName === spotifyName) {
    return false;
  }

  // check if the match would pass strict criteria
  const isSubstring =
    (originalName.includes(spotifyName) ||
      spotifyName.includes(originalName)) &&
    originalName.length > 3 &&
    spotifyName.length > 3;

  if (!isSubstring) {
    return true; // not even a substring match
  }

  const longerLength = Math.max(originalName.length, spotifyName.length);
  const shorterLength = Math.min(originalName.length, spotifyName.length);
  const similarityRatio = shorterLength / longerLength;

  // check strict criteria
  const hasGoodPopularity = artist.spotifyData.popularity > 10;
  const hasGoodFollowers = artist.spotifyData.followers > 500;
  const hasGoodSimilarity = similarityRatio >= 0.6;
  const hasReasonableLength =
    Math.abs(originalName.length - spotifyName.length) <= 10;

  return !(
    hasGoodPopularity &&
    hasGoodFollowers &&
    hasGoodSimilarity &&
    hasReasonableLength
  );
}

// rate limiting helper
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recheckArtistsWithStrictCriteria(options = {}) {
  const { maxArtists = null, verbose = true } = options;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ spotify credentials not found");
    console.error(
      "please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables",
    );
    return;
  }

  if (verbose) console.log("🔍 starting strict spotify artist recheck...");

  try {
    if (verbose) console.log("🔑 getting spotify access token...");
    const token = await getSpotifyToken();

    if (verbose) console.log("📚 reading artists database...");
    const artistsData = JSON.parse(
      await readFile("./src/data/artists.json", "utf-8"),
    );

    // find artists with partial matches that might be too loose
    let artistsToRecheck = artistsData.artists.filter((artist) => {
      return (
        artist.spotifyVerified === true &&
        artist.spotifyData &&
        artist.spotifyData.matchType === "partial" &&
        isMatchTooLoose(artist)
      );
    });

    if (verbose) {
      console.log(
        `🔍 found ${artistsToRecheck.length} artists with potentially loose matches`,
      );
    }

    if (maxArtists) {
      artistsToRecheck = artistsToRecheck.slice(0, maxArtists);
      if (verbose) console.log(`📝 limiting to ${maxArtists} artists`);
    }

    if (artistsToRecheck.length === 0) {
      console.log("✅ no artists need rechecking with strict criteria!");
      return;
    }

    let improved = 0;
    let downgraded = 0;
    let unchanged = 0;
    const totalToProcess = artistsToRecheck.length;

    if (verbose)
      console.log(
        `🚀 processing ${totalToProcess} artists in batches of ${BATCH_SIZE}...`,
      );

    // process in batches
    for (let i = 0; i < artistsToRecheck.length; i += BATCH_SIZE) {
      const batch = artistsToRecheck.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(artistsToRecheck.length / BATCH_SIZE);

      if (verbose) console.log(`\n📦 batch ${batchNumber}/${totalBatches}`);

      await Promise.all(
        batch.map(async (artist, batchIndex) => {
          const globalIndex = i + batchIndex;

          try {
            const originalName = artist.spotifyData.originalScrapedName;
            const currentSpotifyName = artist.name;

            const newSpotifyData = await verifyArtistOnSpotifyStrict(
              originalName,
              token,
            );

            if (newSpotifyData) {
              if (newSpotifyData.spotifyId !== artist.spotifyData.id) {
                // found a different, potentially better match
                artist.name = newSpotifyData.name;
                artist.spotifyUrl = newSpotifyData.spotifyUrl;
                artist.spotifyData = {
                  ...artist.spotifyData,
                  id: newSpotifyData.spotifyId,
                  name: newSpotifyData.name,
                  followers: newSpotifyData.followers,
                  popularity: newSpotifyData.popularity,
                  genres: newSpotifyData.genres,
                  matchType: newSpotifyData.matchType,
                  strictRecheck: true,
                  strictRecheckDate: new Date().toISOString(),
                };
                improved++;
                if (verbose) {
                  console.log(
                    `  ✨ [${globalIndex + 1}/${totalToProcess}] ${originalName} → ${newSpotifyData.name} (better match found)`,
                  );
                }
              } else {
                // same match, but now verified with strict criteria
                artist.spotifyData.strictRecheck = true;
                artist.spotifyData.strictRecheckDate = new Date().toISOString();
                unchanged++;
                if (verbose) {
                  console.log(
                    `  ✅ [${globalIndex + 1}/${totalToProcess}] ${originalName} (same match, verified strict)`,
                  );
                }
              }
            } else {
              // no good match found with strict criteria, use search url
              const searchQuery = encodeURIComponent(originalName);
              artist.name = originalName; // revert to original name
              artist.spotifyUrl = `https://open.spotify.com/search/${searchQuery}`;
              artist.spotifyVerified = false;
              artist.spotifyData = {
                ...artist.spotifyData,
                noGoodMatch: true,
                fallbackToSearch: true,
                strictRecheck: true,
                strictRecheckDate: new Date().toISOString(),
                previousSpotifyMatch: {
                  name: currentSpotifyName,
                  id: artist.spotifyData.id,
                  rejectedReason: "failed strict criteria",
                },
              };
              downgraded++;
              if (verbose) {
                console.log(
                  `  🔍 [${globalIndex + 1}/${totalToProcess}] ${originalName} (no strict match, using search)`,
                );
              }
            }
          } catch (error) {
            console.error(`💥 error processing ${artist.name}:`, error.message);
          }

          await delay(RATE_LIMIT_DELAY);
        }),
      );

      // longer delay between batches
      if (i + BATCH_SIZE < artistsToRecheck.length) {
        await delay(BATCH_DELAY);
      }
    }

    // update metadata
    artistsData.lastUpdated = new Date().toISOString();
    if (!artistsData.spotifyVerification) {
      artistsData.spotifyVerification = {};
    }

    artistsData.spotifyVerification.lastStrictRecheck =
      new Date().toISOString();

    // write updated data
    await writeFile(
      "./src/data/artists.json",
      JSON.stringify(artistsData, null, 2),
    );

    console.log(`\n🎉 strict recheck complete!`);
    console.log(`   ✨ improved matches: ${improved}`);
    console.log(`   ✅ verified existing: ${unchanged}`);
    console.log(`   🔍 downgraded to search: ${downgraded}`);
    console.log(`   📊 total processed: ${totalToProcess}`);
  } catch (error) {
    console.error("💥 error during strict recheck:", error.message);
  }
}

// run the script
const maxArtists = process.argv.includes("--limit")
  ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10)
  : null;

const verbose = !process.argv.includes("--quiet");

await recheckArtistsWithStrictCriteria({ maxArtists, verbose });
