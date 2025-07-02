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
const RATE_LIMIT_DELAY = 200; // ms between individual requests (more conservative for ci)
const BATCH_DELAY = 2000; // ms between batches (more conservative for ci)
const BATCH_SIZE = 5; // smaller batches for ci
const MAX_RETRIES = 3;
const DEFAULT_CI_LIMIT = 50; // default limit for ci runs to avoid timeouts

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

// helper to check if artist is newly added (no previous verification attempt)
function isNewArtist(artist) {
  return (
    !artist.spotifyVerified &&
    !artist.spotifyData &&
    (!artist.spotifyUrl || artist.spotifyUrl.includes("/search/"))
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
        searchQuery: artistName,
        searchResults: response.artists?.items?.length || 0,
        lastChecked: new Date().toISOString(),
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
        lastChecked: new Date().toISOString(),
      },
    };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// main function to verify new artists only
export async function verifyNewArtists(options = {}) {
  const { limit = DEFAULT_CI_LIMIT, verbose = true } = options;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "spotify client id and secret must be set in environment variables",
    );
  }

  try {
    // load artists data
    const artistsData = await readFile("src/data/artists.json", "utf-8");
    const artists = JSON.parse(artistsData);

    // filter to only new artists (no previous verification attempt)
    const newArtists = artists.artists.filter((artist) => {
      // first check if it's a new artist
      if (!isNewArtist(artist)) {
        return false;
      }

      // then filter out non-artist entries
      if (isNonArtist(artist.name) || isVenueAdministrative(artist)) {
        return false;
      }

      return true;
    });

    if (newArtists.length === 0) {
      if (verbose) console.log("✅ no new artists to verify");
      return;
    }

    const artistsToProcess = limit ? newArtists.slice(0, limit) : newArtists;

    if (verbose) {
      console.log(`🎵 verifying ${artistsToProcess.length} new artists`);
      if (limit && newArtists.length > limit) {
        console.log(`   (limited from ${newArtists.length} total new artists)`);
      }
    }

    // get spotify access token
    const token = await getSpotifyToken();
    if (verbose) console.log("🔑 obtained spotify access token");

    let verifiedCount = 0;
    let foundCount = 0;
    let errorCount = 0;

    // process artists in batches to avoid rate limiting
    for (let i = 0; i < artistsToProcess.length; i += BATCH_SIZE) {
      const batch = artistsToProcess.slice(i, i + BATCH_SIZE);

      for (const artist of batch) {
        try {
          if (verbose) {
            console.log(
              `🔍 verifying ${artist.name} (${verifiedCount + 1}/${artistsToProcess.length})`,
            );
          }

          const result = await verifyArtistOnSpotify(artist.name, token);

          if (result.found) {
            // store the original name before updating
            const originalName = artist.name;

            // update artist name to the official spotify name
            artist.name = result.spotifyData.name;
            artist.spotifyUrl = result.spotifyUrl;
            artist.spotifyVerified = result.found;
            artist.spotifyData = {
              ...result.spotifyData,
              originalScrapedName: originalName, // keep track of original scraped name
            };

            foundCount++;
            const nameChanged = originalName !== result.spotifyData.name;
            const changeIndicator = nameChanged ? " (name updated)" : "";
            if (verbose)
              console.log(
                `  ✅ found: ${result.spotifyData.name}${changeIndicator}`,
              );
          } else {
            // update artist data for not found
            artist.spotifyUrl = result.spotifyUrl;
            artist.spotifyVerified = result.found;
            artist.spotifyData = result.spotifyData;
            if (verbose) console.log(`  ❌ not found`);
          }

          verifiedCount++;
          await delay(RATE_LIMIT_DELAY);
        } catch (error) {
          console.error(`❌ error verifying ${artist.name}:`, error.message);
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
      console.log("\n📊 verification complete:");
      console.log(`   verified: ${verifiedCount} artists`);
      console.log(
        `   found: ${foundCount} (${Math.round((foundCount / verifiedCount) * 100)}%)`,
      );
      console.log(`   not found: ${verifiedCount - foundCount}`);
      if (errorCount > 0) {
        console.log(`   errors: ${errorCount}`);
      }
    }

    return {
      verified: verifiedCount,
      found: foundCount,
      errors: errorCount,
    };
  } catch (error) {
    console.error("❌ verification failed:", error.message);
    throw error;
  }
}

// function to verify artists in memory without touching files (for integration)
export async function verifyArtistsInMemory(artists, options = {}) {
  const { verbose = true } = options;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "spotify client id and secret must be set in environment variables",
    );
  }

  if (verbose) {
    console.log(`🎵 verifying ${artists.length} artists in memory...`);
  }

  const token = await getSpotifyToken();
  const results = [];

  // process artists in batches to avoid rate limiting
  for (let i = 0; i < artists.length; i += BATCH_SIZE) {
    const batch = artists.slice(i, i + BATCH_SIZE);
    if (verbose) {
      console.log(
        `   processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(artists.length / BATCH_SIZE)}`,
      );
    }

    for (const artist of batch) {
      try {
        const verificationResult = await verifyArtistOnSpotify(
          artist.name,
          token,
        );

        const result = {
          id: artist.id,
          name: verificationResult.found
            ? verificationResult.spotifyData.name
            : artist.name, // use spotify name if found
          spotifyUrl: verificationResult.found
            ? verificationResult.spotifyUrl
            : null,
          spotifyVerified: verificationResult.found,
          spotifyData: verificationResult.found
            ? {
                ...verificationResult.spotifyData,
                verifiedAt: new Date().toISOString(),
                originalScrapedName: artist.name, // keep track of original scraped name
              }
            : {
                notFound: true,
                searchQuery: artist.name,
                verifiedAt: new Date().toISOString(),
              },
        };

        results.push(result);

        if (verbose) {
          if (verificationResult.found) {
            const nameChanged =
              artist.name !== verificationResult.spotifyData.name;
            const changeIndicator = nameChanged ? " (name updated)" : "";
            console.log(
              `   ✅ ${artist.name} -> ${verificationResult.spotifyData.name}${changeIndicator}`,
            );
          } else {
            console.log(`   ❌ ${artist.name} (not found)`);
          }
        }

        await delay(RATE_LIMIT_DELAY);
      } catch (error) {
        if (verbose) {
          console.log(`   ⚠️  ${artist.name}: ${error.message}`);
        }

        // add error result
        results.push({
          id: artist.id,
          name: artist.name,
          spotifyUrl: null,
          spotifyVerified: false,
          spotifyData: {
            error: error.message,
            verifiedAt: new Date().toISOString(),
          },
        });
      }
    }

    // delay between batches
    if (i + BATCH_SIZE < artists.length) {
      await delay(BATCH_DELAY);
    }
  }

  return results;
}

// export functions for use by other scripts
export { isNewArtist, spotifyRequest, getSpotifyToken, verifyArtistOnSpotify };

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
      case "--quiet":
        options.verbose = false;
        break;
      case "--help":
        console.log(`
spotify new artist verification tool

usage: node scripts/verify-spotify-new-artists.js [options]

options:
  --limit N   only process N artists (default: ${DEFAULT_CI_LIMIT})
  --quiet     minimal output
  --help      show this help

examples:
  node scripts/verify-spotify-new-artists.js              # verify new artists
  node scripts/verify-spotify-new-artists.js --limit 20   # verify max 20 artists
        `);
        process.exit(0);
    }
  }

  verifyNewArtists(options).catch(console.error);
}
