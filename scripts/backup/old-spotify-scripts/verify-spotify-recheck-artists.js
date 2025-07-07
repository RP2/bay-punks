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

// configuration for recheck (more lenient since it's manual)
const RATE_LIMIT_DELAY = 100; // ms between individual requests
const BATCH_DELAY = 1000; // ms between batches
const BATCH_SIZE = 10; // artists per batch
const MAX_RETRIES = 3;

// helper to check if artist needs rechecking (previously failed verification)
function needsRechecking(artist) {
  return (
    !artist.spotifyVerified &&
    (artist.spotifyData?.notFound === true ||
      artist.spotifyData?.error ||
      (artist.spotifyUrl && artist.spotifyUrl.includes("/search/")))
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

// verify a single artist on spotify
async function verifyArtistOnSpotify(artistName, token) {
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
          spotifyUrl: exactMatch.external_urls.spotify,
          spotifyData: {
            id: exactMatch.id,
            name: exactMatch.name,
            followers: exactMatch.followers.total,
            popularity: exactMatch.popularity,
            genres: exactMatch.genres,
            verified: true,
            searchQuery: artistName,
            searchResults: response.artists.items.length,
            matchType: "exact",
            rechecked: true,
            recheckDate: new Date().toISOString(),
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
          spotifyUrl: bestMatch.external_urls.spotify,
          spotifyData: {
            id: bestMatch.id,
            name: bestMatch.name,
            followers: bestMatch.followers.total,
            popularity: bestMatch.popularity,
            genres: bestMatch.genres,
            verified: false, // not an exact match
            searchQuery: artistName,
            searchResults: response.artists.items.length,
            matchType: "partial",
            confidence: "medium",
            rechecked: true,
            recheckDate: new Date().toISOString(),
          },
        };
      }
    }

    // no matches found (again)
    return {
      found: false,
      spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(artistName)}`,
      spotifyData: {
        notFound: true,
        searchQuery: artistName,
        searchResults: response.artists?.items?.length || 0,
        rechecked: true,
        recheckDate: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`error verifying ${artistName}:`, error.message);
    return {
      found: false,
      spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(artistName)}`,
      spotifyData: {
        error: error.message,
        searchQuery: artistName,
        rechecked: true,
        recheckDate: new Date().toISOString(),
      },
    };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// main function to recheck artists that previously failed verification
export async function recheckArtists(options = {}) {
  const { limit, verbose = true, includeErrors = true } = options;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "spotify client id and secret must be set in environment variables",
    );
  }

  try {
    // load artists data
    const artistsData = await readFile("src/data/artists.json", "utf-8");
    const artists = JSON.parse(artistsData);

    // filter to artists that need rechecking
    let artistsToRecheck = artists.artists.filter(needsRechecking);

    // optionally exclude artists with errors (only recheck "not found" artists)
    if (!includeErrors) {
      artistsToRecheck = artistsToRecheck.filter(
        (artist) => !artist.spotifyData?.error,
      );
    }

    if (artistsToRecheck.length === 0) {
      if (verbose) console.log("✅ no artists need rechecking");
      return;
    }

    const artistsToProcess = limit
      ? artistsToRecheck.slice(0, limit)
      : artistsToRecheck;

    if (verbose) {
      console.log(`🔄 rechecking ${artistsToProcess.length} artists`);
      if (limit && artistsToRecheck.length > limit) {
        console.log(
          `   (limited from ${artistsToRecheck.length} total artists needing recheck)`,
        );
      }
      console.log(`   including error cases: ${includeErrors ? "yes" : "no"}`);
    }

    // get spotify access token
    const token = await getSpotifyToken();
    if (verbose) console.log("🔑 obtained spotify access token");

    let recheckedCount = 0;
    let nowFoundCount = 0;
    let stillNotFoundCount = 0;
    let errorCount = 0;

    // process artists in batches to avoid rate limiting
    for (let i = 0; i < artistsToProcess.length; i += BATCH_SIZE) {
      const batch = artistsToProcess.slice(i, i + BATCH_SIZE);

      for (const artist of batch) {
        try {
          if (verbose) {
            console.log(
              `🔍 rechecking ${artist.name} (${recheckedCount + 1}/${artistsToProcess.length})`,
            );
          }

          const result = await verifyArtistOnSpotify(artist.name, token);

          if (result.found) {
            // NEVER update artist name - preserve scraped name as per conservative policy
            // Only update spotify verification data
            artist.spotifyUrl = result.spotifyUrl;
            artist.spotifyVerified = result.found;
            artist.spotifyData = {
              ...result.spotifyData,
              scrapedName: artist.name, // preserve the scraped name
            };

            nowFoundCount++;
            if (verbose)
              console.log(
                `  ✅ now found: ${result.spotifyData.name} (preserving scraped name: "${artist.name}")`,
              );
          } else {
            // update artist data for not found
            artist.spotifyUrl = result.spotifyUrl;
            artist.spotifyVerified = result.found;
            artist.spotifyData = result.spotifyData;
            stillNotFoundCount++;
            if (verbose) console.log(`  ❌ still not found`);
          }

          recheckedCount++;
          await delay(RATE_LIMIT_DELAY);
        } catch (error) {
          console.error(`❌ error rechecking ${artist.name}:`, error.message);
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

    // save updated data
    await writeFile(
      "src/data/artists.json",
      JSON.stringify(artists, null, 2),
      "utf-8",
    );

    if (verbose) {
      console.log("\n📊 recheck complete:");
      console.log(`   rechecked: ${recheckedCount} artists`);
      console.log(
        `   now found: ${nowFoundCount} (${Math.round((nowFoundCount / recheckedCount) * 100)}%)`,
      );
      console.log(`   still not found: ${stillNotFoundCount}`);
      if (errorCount > 0) {
        console.log(`   errors: ${errorCount}`);
      }
    }

    return {
      rechecked: recheckedCount,
      nowFound: nowFoundCount,
      stillNotFound: stillNotFoundCount,
      errors: errorCount,
    };
  } catch (error) {
    console.error("❌ recheck failed:", error.message);
    throw error;
  }
}

// export functions for use by other scripts
export {
  needsRechecking,
  spotifyRequest,
  getSpotifyToken,
  verifyArtistOnSpotify,
};

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
      case "--no-errors":
        options.includeErrors = false;
        break;
      case "--quiet":
        options.verbose = false;
        break;
      case "--help":
        console.log(`
spotify artist recheck tool

usage: node scripts/verify-spotify-recheck-artists.js [options]

options:
  --limit N     only process N artists
  --no-errors   skip artists with previous errors (only recheck "not found")
  --quiet       minimal output
  --help        show this help

examples:
  node scripts/verify-spotify-recheck-artists.js                  # recheck all failed artists
  node scripts/verify-spotify-recheck-artists.js --limit 50       # recheck max 50 artists
  node scripts/verify-spotify-recheck-artists.js --no-errors      # skip error cases
        `);
        process.exit(0);
    }
  }

  recheckArtists(options).catch(console.error);
}
