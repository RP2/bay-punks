// foopee scraper for worker
// ported from scripts/scrape-concerts.js
// cloudflare worker compatible (uses fetch, no fs)

import {
  encodeQuery,
  cleanArtistName,
  shouldExcludeArtist,
  normalizeDate,
} from "./data-utils";
import { parseDocument, getTextContent } from "./dom-utils";

interface ScrapedEvent {
  venue: { text: string; href?: string };
  bands: { text: string; href: string }[];
  extra: string;
}

interface ScrapedShow {
  day: string;
  normalizedDate: string;
  events: ScrapedEvent[];
}

// TODO: Use a lightweight HTML parser compatible with Workers (e.g., linkedom)
// For now, this is a stub. Replace with real HTML parsing logic.

export async function scrapeFoopeeConcerts(): Promise<{
  shows: ScrapedShow[];
}> {
  const baseUrl = "http://www.foopee.com/punk/the-list/by-date.";
  const pageCount = 31;
  const shows: ScrapedShow[] = [];
  let totalEvents = 0;
  let excludedComedians = 0;

  // fetch all pages
  const pagePromises = Array.from({ length: pageCount }, (_, i) => {
    const url = `${baseUrl}${i}.html`;
    return fetch(url).then((res) => res.text());
  });
  const pagesHtml = await Promise.all(pagePromises);

  // parse each page
  for (const html of pagesHtml) {
    const doc = parseDocument(html);
    // select all top-level <ul> > <li> (each day)
    const dayLis = Array.from(doc.querySelectorAll("ul > li"));
    for (const dayLi of dayLis) {
      // get the day (e.g., "wed apr 23")
      const dayAnchor = dayLi.querySelector("a > b");
      const dayText = getTextContent(dayAnchor);
      if (!dayText) continue;
      const normalizedDate = normalizeDate(dayText);

      // find the ul with events for this day
      const eventsUl = dayLi.querySelector("ul");
      if (!eventsUl) continue;
      const events: ScrapedEvent[] = [];

      // for each event li
      for (const eventLi of Array.from(eventsUl.children)) {
        // get venue link and text
        const venueLink = eventLi.querySelector('a[href^="by-club"]');
        const venueText = getTextContent(venueLink);
        const venue = {
          text: venueText,
          href: venueText
            ? `https://www.google.com/search?q=${encodeQuery(venueText)}`
            : undefined,
        };

        // get all band links and text
        const bandLinks = Array.from(
          eventLi.querySelectorAll('a[href*="by-band"]'),
        );

        const bands = bandLinks
          .map((bandEl) => {
            const rawBandText = getTextContent(bandEl);
            if (shouldExcludeArtist(rawBandText)) {
              excludedComedians++;
              return null;
            }
            const bandText = cleanArtistName(rawBandText);
            if (!bandText) return null;
            return {
              text: bandText,
              href: `https://open.spotify.com/search/${encodeQuery(bandText)}`,
            };
          })
          .filter(
            (band): band is { text: string; href: string } => band !== null,
          );

        // get extra info (text not in links)
        let extra = eventLi.cloneNode(true) as Element;
        for (const a of Array.from(extra.querySelectorAll("a"))) {
          a.remove();
        }
        let extraText = getTextContent(extra).replace(venue.text, "").trim();
        // clean up extra: remove spaces before commas, multiple commas, newlines, and excess spaces
        extraText = extraText
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
          events.push({ venue, bands, extra: extraText });
          totalEvents++;
        }
      }

      if (dayText && events.length) {
        shows.push({ day: dayText, normalizedDate, events });
      }
    }
  }

  // Return the structure expected by process-databases.js
  return { shows };
}
