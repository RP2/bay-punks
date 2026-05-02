// Scrape stage: fetches pages from foopee.com and produces raw.json
// Replaces scripts/scrape-concerts.js

import { load } from "cheerio";
import { writeFile } from "fs/promises";
import { resolve } from "path";
import { normalizeDate, cleanArtistName, isNonArtist, DateContext } from "./normalizers.js";
import { RawDataSchema } from "./schemas.js";
import type { RawData, RawShow, RawEvent } from "./schemas.js";
import { loadConfig, resolveDataPath } from "./config.js";

function encodeQuery(str: string): string {
  return encodeURIComponent(str.replace(/\s+/g, " ").trim());
}

async function fetchPage(url: string): Promise<ReturnType<typeof load> | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`page not found: ${url} (status ${res.status})`);
      return null;
    }
    const html = await res.text();
    return load(html);
  } catch (error) {
    console.log(`error fetching ${url}: ${(error as Error).message}`);
    return null;
  }
}

export async function scrape(outputPath?: string): Promise<RawData> {
  const config = await loadConfig();
  const outPath = outputPath || resolveDataPath("raw.json");

  console.log("fetching pages from foopee.com...");
  const baseUrl = "http://www.foopee.com/punk/the-list/by-date.";
  const pagePromises = Array.from({ length: 31 }, (_, i) => {
    const url = `${baseUrl}${i}.html`;
    console.log(`  fetching page ${i}: ${url}`);
    return fetchPage(url);
  });

  const pageResults = await Promise.all(pagePromises);
  const pages = pageResults.filter((p): p is ReturnType<typeof load> => p !== null);
  console.log(`fetched ${pages.length} pages out of ${pageResults.length} attempted`);

  const shows: RawShow[] = [];
  let totalEvents = 0;
  let excludedCount = 0;
  const dateContext: DateContext = { lastDate: null };

  for (const $ of pages) {
    let pageEvents = 0;

    $("ul > li").each((_, dayLi) => {
      const dayText = $(dayLi).find("> a > b").first().text().trim();
      const eventsUl = $(dayLi).children("ul").first();
      const events: RawEvent[] = [];

      eventsUl.children("li").each((_, eventLi) => {
        const venueLink = $(eventLi).find('a[href^="by-club"]').first();
        const venueText = venueLink.text().trim();
        const venue = {
          text: venueText,
          href: venueText
            ? `https://www.google.com/search?q=${encodeQuery(venueText)}`
            : undefined,
        };

        const bands = $(eventLi)
          .find('a[href*="by-band"]')
          .map((_, bandEl) => {
            const rawBandText = $(bandEl).text().trim();

            if (isNonArtist(rawBandText, config.nonArtistFilters)) {
              excludedCount++;
              return null;
            }

            const bandText = cleanArtistName(rawBandText);
            return {
              text: bandText,
              href: bandText
                ? `https://open.spotify.com/search/${encodeQuery(bandText)}`
                : undefined,
            };
          })
          .get()
          .filter((band) => band !== null && band.text);

        let extra = $(eventLi)
          .clone()
          .find("a")
          .remove()
          .end()
          .text()
          .replace(venue.text, "")
          .trim();

        extra = extra
          .replace(/--\s*,/g, "--")
          .replace(/\s+,/g, ",")
          .replace(/,+/g, ",")
          .replace(/(?:^,|,$)/g, "")
          .replace(/,\s*,+/g, ",")
          .replace(/\s*\n\s*/g, " ")
          .replace(/\s{2,}/g, " ")
          .replace(/(,\s*)+/g, ", ")
          .replace(/^,|,$/g, "")
          .trim();

        if (venue.text && bands.length) {
          events.push({ venue, bands, extra: extra || undefined });
          pageEvents++;
          totalEvents++;
        }
      });

      if (dayText && events.length) {
        const normalizedDate = normalizeDate(dayText, dateContext);
        shows.push({ day: dayText, normalizedDate, events });
      }
    });
  }

  console.log(`\nscrape complete:`);
  console.log(`  total events: ${totalEvents}`);
  console.log(`  excluded non-artists: ${excludedCount}`);
  console.log(`  days with events: ${shows.length}`);

  const data: RawData = { shows };
  const validated = RawDataSchema.parse(data);

  await writeFile(outPath, JSON.stringify(validated, null, 2));
  console.log(`written to ${outPath}`);

  return validated;
}