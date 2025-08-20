import {
  encodeQuery,
  cleanArtistName,
  shouldExcludeArtist,
  normalizeText,
  normalizeDate,
} from "./lib/data-utils";

export default {
  async fetch(request: Request, env: any, ctx: any) {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "scrape";

    if (action === "scrape") {
      // TODO: implement scraping logic using helpers
      // Example: fetch Foopee, parse, and insert raw data into D1
      return new Response("Scrape not yet implemented");
    }

    if (action === "clean") {
      // TODO: implement cleaning/normalization logic using helpers
      return new Response("Clean not yet implemented");
    }

    if (action === "enrich") {
      // TODO: implement Spotify enrichment logic
      return new Response("Enrich not yet implemented");
    }

    return new Response("Unknown action", { status: 400 });
  },
};
