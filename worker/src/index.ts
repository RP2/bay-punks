// bay-punks D1 migration worker entrypoint

import type { ExecutionContext } from "@cloudflare/workers-types";
import { scrapeFoopeeConcerts } from "./lib/scraper";

import { verifyArtistsOnSpotify } from "./lib/spotify";
import { processConcertDataPipeline } from "./lib/database";

export interface Env {
  DB: D1Database;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/scrape-foopee") {
      try {
        const data = await scrapeFoopeeConcerts();
        return new Response(JSON.stringify(data, null, 2), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch (err: any) {
        return new Response(`Scrape error: ${err.message || err}`, {
          status: 500,
        });
      }
    }

    if (url.pathname === "/run-pipeline") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      try {
        const {
          rawData,
          corrections,
          enrichSpotify = true,
        } = await request.json();
        const clientId = env.SPOTIFY_CLIENT_ID || "";
        const clientSecret = env.SPOTIFY_CLIENT_SECRET || "";
        if (!clientId || !clientSecret) {
          return new Response("Spotify credentials missing in env", {
            status: 500,
          });
        }
        const result = await processConcertDataPipeline(
          rawData,
          env.DB,
          corrections,
          enrichSpotify,
          { clientId, clientSecret },
        );
        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch (err: any) {
        return new Response(`Pipeline error: ${err.message || err}`, {
          status: 500,
        });
      }
    }

    if (url.pathname === "/spotify-verify") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      try {
        const { artists, options } = await request.json();
        const clientId = env.SPOTIFY_CLIENT_ID || "";
        const clientSecret = env.SPOTIFY_CLIENT_SECRET || "";
        if (!clientId || !clientSecret) {
          return new Response("Spotify credentials missing in env", {
            status: 500,
          });
        }
        const result = await verifyArtistsOnSpotify(artists, {
          ...options,
          clientId,
          clientSecret,
        });
        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch (err: any) {
        return new Response(`Spotify verify error: ${err.message || err}`, {
          status: 500,
        });
      }
    }

    // default response
    return new Response("OK: Worker is running.", { status: 200 });
  },
};
