// Spotify verification module using the overlay approach.
// Instead of mutating artists.json directly, this writes artists.spotify.json
// as a separate overlay file. The build step in pipeline.ts merges this overlay
// into the final artists.json, making verification idempotent and safe.
//
// Replaces scripts/spotify-verify.js

import { readFile, writeFile, copyFile, unlink } from "fs/promises";
import { resolve } from "path";
import { loadConfig, resolveDataPath } from "./lib/config.js";
import { isNonArtist } from "./lib/normalizers.js";
import { ArtistsDataSchema, SpotifyOverlaySchema } from "./lib/schemas.js";
import type { SpotifyOverlay } from "./lib/schemas.js";

// --- Spotify API ---

const RATE_LIMIT_DELAY = 50;
const BATCH_DELAY = 200;
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;

async function getSpotifyToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`token request failed: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function spotifyRequest(
  endpoint: string,
  token: string,
  retries = 0,
): Promise<any> {
  try {
    const response = await fetch(`https://api.spotify.com${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 429) {
      const retryAfter =
        parseInt(response.headers.get("retry-after") || "1", 10) * 1000;
      if (retries < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, retryAfter));
        return spotifyRequest(endpoint, token, retries + 1);
      }
      throw new Error(`rate limited after ${MAX_RETRIES} retries`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `http ${response.status}: ${errorData.error?.message || "unknown error"}`,
      );
    }

    return await response.json();
  } catch (error) {
    if (
      retries < MAX_RETRIES &&
      ((error as any).code === "ECONNRESET" ||
        (error as any).name === "FetchError")
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      return spotifyRequest(endpoint, token, retries + 1);
    }
    throw error;
  }
}

function normalizeForComparison(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+the$/, "");
}

async function verifyArtistOnSpotify(
  artistName: string,
  token: string,
): Promise<{
  found: boolean;
  spotifyUrl: string;
  spotifyData: any;
}> {
  try {
    const query = encodeURIComponent(artistName);
    const endpoint = `/v1/search?q=${query}&type=artist&limit=10`;
    const response = await spotifyRequest(endpoint, token);

    if (response.artists && response.artists.items.length > 0) {
      const exactMatch = response.artists.items.find((artist: any) => {
        const normalizedArtist = normalizeForComparison(artistName);
        const normalizedSpotify = normalizeForComparison(artist.name);
        return (
          normalizedArtist === normalizedSpotify ||
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
            spotifyName: exactMatch.name,
            scrapedName: artistName,
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

    return {
      found: false,
      spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(artistName)}`,
      spotifyData: {
        notFound: true,
        scrapedName: artistName,
        searchQuery: artistName,
        searchResults: response.artists?.items?.length || 0,
        verifiedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      found: false,
      spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(artistName)}`,
      spotifyData: {
        error: (error as Error).message,
        scrapedName: artistName,
        searchQuery: artistName,
        verifiedAt: new Date().toISOString(),
      },
    };
  }
}

function getVerificationStatus(artist: {
  spotifyVerified?: boolean;
  spotifyUrl?: string | null;
  spotifyData?: any;
}): "verified" | "failed" | "search-only" | "unverified" {
  if (
    artist.spotifyVerified &&
    artist.spotifyUrl &&
    !artist.spotifyUrl.includes("/search/")
  ) {
    return "verified";
  }
  if (artist.spotifyData?.notFound || artist.spotifyData?.error) {
    return "failed";
  }
  if (artist.spotifyUrl && artist.spotifyUrl.includes("/search/")) {
    return "search-only";
  }
  return "unverified";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Main verification ---

export async function spotifyVerify(options: {
  mode?: "new" | "failed" | "all" | "force-all" | "partial";
  limit?: number | null;
  verbose?: boolean;
} = {}): Promise<{ processed: number; found: number; notFound: number; errors: number }> {
  const { mode = "new", limit = null, verbose = true } = options;

  const config = await loadConfig();

  // load env for spotify credentials
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  try {
    const envContent = await readFile(resolve(".env"), "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=");
          if (key === "SPOTIFY_CLIENT_ID") clientId = value;
          if (key === "SPOTIFY_CLIENT_SECRET") clientSecret = value;
        }
      }
    }
  } catch {
    // .env might not exist
  }

  if (!clientId || !clientSecret) {
    clientId = process.env.SPOTIFY_CLIENT_ID;
    clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "spotify client id and secret must be set in .env or environment variables",
    );
  }

  if (verbose) console.log(`spotify verification mode: ${mode}`);

  // load artists
  const artistsData = ArtistsDataSchema.parse(
    JSON.parse(await readFile(resolveDataPath("artists.json"), "utf-8")),
  );

  // load existing overlay (if any)
  let existingOverlay: SpotifyOverlay = {
    verifications: {},
    metadata: {
      lastVerified: new Date().toISOString(),
      mode,
    },
  };
  try {
    const overlayRaw = JSON.parse(
      await readFile(resolveDataPath("artists.spotify.json"), "utf-8"),
    );
    existingOverlay = SpotifyOverlaySchema.parse(overlayRaw);
    if (verbose)
      console.log(
        `loaded existing overlay with ${Object.keys(existingOverlay.verifications).length} verifications`,
      );
  } catch {
    if (verbose) console.log("no existing overlay, starting fresh");
  }

  // filter artists based on mode
  let artistsToProcess = artistsData.artists.filter((artist) => {
    if (isNonArtist(artist.name, config.nonArtistFilters)) return false;
    return true;
  });

  // merge overlay data for status checking
  const mergedForStatus = artistsToProcess.map((artist) => ({
    ...artist,
    ...(existingOverlay.verifications[artist.id] || {}),
  }));

  switch (mode) {
    case "new":
      artistsToProcess = mergedForStatus.filter(
        (a) => getVerificationStatus(a) === "unverified",
      );
      break;
    case "failed":
      artistsToProcess = mergedForStatus.filter((a) =>
        ["failed", "search-only"].includes(getVerificationStatus(a)),
      );
      break;
    case "all":
      artistsToProcess = mergedForStatus.filter(
        (a) => getVerificationStatus(a) !== "verified",
      );
      break;
    case "force-all":
      // process all
      break;
    case "partial":
      artistsToProcess = mergedForStatus.filter(
        (a) =>
          a.spotifyVerified &&
          a.spotifyData &&
          !a.spotifyData.notFound &&
          !a.spotifyData.error &&
          (a.spotifyData.matchType === "partial" ||
            a.spotifyData.confidence === "medium"),
      );
      break;
  }

  if (limit) {
    artistsToProcess = artistsToProcess.slice(0, limit);
  }

  if (artistsToProcess.length === 0) {
    if (verbose) console.log("no artists need verification");
    return { processed: 0, found: 0, notFound: 0, errors: 0 };
  }

  if (verbose) console.log(`processing ${artistsToProcess.length} artists`);

  // create backup of overlay
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = resolveDataPath(`artists.spotify.backup.${timestamp}.json`);
  try {
    await copyFile(resolveDataPath("artists.spotify.json"), backupPath);
    if (verbose) console.log(`backup created: ${backupPath}`);
  } catch {
    if (verbose) console.log("no existing overlay to backup");
  }

  // get token
  const token = await getSpotifyToken(clientId, clientSecret);
  if (verbose) console.log("obtained spotify access token");

  let processed = 0;
  let found = 0;
  let notFound = 0;
  let errors = 0;

  // process in batches
  for (let i = 0; i < artistsToProcess.length; i += BATCH_SIZE) {
    const batch = artistsToProcess.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(artistsToProcess.length / BATCH_SIZE);

    if (verbose) console.log(`\nbatch ${batchNum}/${totalBatches}`);

    for (const artist of batch) {
      try {
        if (verbose) {
          console.log(
            `  ${artist.name} (${processed + 1}/${artistsToProcess.length})`,
          );
        }

        const result = await verifyArtistOnSpotify(artist.name, token);

        // write to overlay (not to artists.json directly)
        existingOverlay.verifications[artist.id] = {
          spotifyUrl: result.spotifyUrl,
          spotifyVerified: result.found,
          spotifyData: result.spotifyData,
        };

        if (result.found) {
          found++;
          if (verbose) console.log(`    found: ${result.spotifyData.spotifyName}`);
        } else {
          notFound++;
          if (verbose) console.log("    not found");
        }

        processed++;
        await delay(RATE_LIMIT_DELAY);
      } catch (error) {
        console.error(`  error verifying ${artist.name}:`, (error as Error).message);
        errors++;
        processed++;
      }
    }

    // save progress after each batch
    if (i + BATCH_SIZE < artistsToProcess.length) {
      if (verbose) console.log("  saving progress...");
      existingOverlay.metadata = {
        lastVerified: new Date().toISOString(),
        mode,
        stats: {
          total: artistsData.artists.length,
          verified: Object.values(existingOverlay.verifications).filter(
            (v) => v.spotifyVerified,
          ).length,
          notFound: Object.values(existingOverlay.verifications).filter(
            (v) => v.spotifyData?.notFound,
          ).length,
          errors: Object.values(existingOverlay.verifications).filter(
            (v) => v.spotifyData?.error,
          ).length,
        },
      };
      await writeFile(
        resolveDataPath("artists.spotify.json"),
        JSON.stringify(existingOverlay, null, 2),
      );
      await delay(BATCH_DELAY);
    }
  }

  // final save
  existingOverlay.metadata = {
    lastVerified: new Date().toISOString(),
    mode,
    stats: {
      total: artistsData.artists.length,
      verified: Object.values(existingOverlay.verifications).filter(
        (v) => v.spotifyVerified,
      ).length,
      notFound: Object.values(existingOverlay.verifications).filter(
        (v) => v.spotifyData?.notFound,
      ).length,
      errors: Object.values(existingOverlay.verifications).filter(
        (v) => v.spotifyData?.error,
      ).length,
    },
  };

  await writeFile(
    resolveDataPath("artists.spotify.json"),
    JSON.stringify(existingOverlay, null, 2),
  );

  // cleanup backup
  try {
    await unlink(backupPath);
  } catch {
    // ignore
  }

  if (verbose) {
    console.log("\nverification complete:");
    console.log(`  processed: ${processed}`);
    console.log(`  found: ${found} (${Math.round((found / processed) * 100)}%)`);
    console.log(`  not found: ${notFound}`);
    if (errors > 0) console.log(`  errors: ${errors}`);
    console.log(
      `  overlay written to src/data/artists.spotify.json (${Object.keys(existingOverlay.verifications).length} total verifications)`,
    );
    console.log(
      "  run 'pipeline build' to merge the overlay into artists.json",
    );
  }

  return { processed, found, notFound, errors };
}

// --- CLI ---

const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith("--")) as
  | "new"
  | "failed"
  | "all"
  | "force-all"
  | "partial"
  | undefined;
const limitIndex = args.indexOf("--limit");
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : null;
const verbose = !args.includes("--quiet");

if (args.includes("--help")) {
  console.log(`spotify verification tool - overlay approach

Usage: npx tsx scripts/spotify-verify.ts [mode] [options]

Modes:
  new        verify only unverified artists (default)
  failed     recheck artists that previously failed
  all        verify all artists that need verification
  force-all  force recheck all artists (including verified)
  partial    re-evaluate artists verified with partial confidence

Options:
  --limit N  only process N artists
  --quiet    minimal output
  --help     show this help

This script writes to artists.spotify.json (overlay), not artists.json.
Run 'pipeline build' to merge the overlay into the final output.

The overlay approach makes verification:
  - Idempotent (run as many times as you want)
  - Transparent (you can see exactly what changed)
  - Safe (never corrupts the master data)
`);
  process.exit(0);
}

spotifyVerify({
  mode: mode || "new",
  limit,
  verbose,
}).catch(console.error);