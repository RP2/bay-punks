// imports
import fetch from "node-fetch";
import { load } from "cheerio";
import { writeFile } from "fs/promises";

// helper to encode for url
function encodeQuery(str) {
  return encodeURIComponent(str.replace(/\s+/g, " ").trim());
}

// helper to fetch and parse a single page
async function fetchPage(url) {
  const res = await fetch(url);
  const html = await res.text();
  return load(html);
}

// fetch all pages from by-date.0.html to by-date.30.html
const baseUrl = "http://www.foopee.com/punk/the-list/by-date.";
const pages = await Promise.all(
  Array.from({ length: 31 }, (_, i) => fetchPage(`${baseUrl}${i}.html`)),
);

// collect events for each day
const shows = [];

// process each page
pages.forEach(($) => {
  // select the main ul containing days
  $("ul > li").each((_, dayLi) => {
    // get the day (e.g., "wed apr 23")
    const dayText = $(dayLi).find("> a > b").first().text().trim();

    // find the ul with events for this day
    const eventsUl = $(dayLi).children("ul").first();
    const events = [];

    // for each event li
    eventsUl.children("li").each((_, eventLi) => {
      // get venue link and text
      const venueLink = $(eventLi).find('a[href^="by-club"]').first();
      const venueText = venueLink.text().trim();
      const venue = {
        text: venueText,
        href: venueText
          ? `https://www.google.com/search?q=${encodeQuery(venueText)}`
          : undefined,
      };

      // get all band links and text
      const bands = $(eventLi)
        .find('a[href*="by-band"]')
        .map((_, bandEl) => {
          // get band text and remove any spaces before or after
          let bandText = $(bandEl).text().replace(/\s+,/g, ",").trim();
          bandText = bandText.replace(/\s+$/, ""); // remove trailing spaces
          bandText = bandText.replace(/^\s+/, ""); // remove leading spaces
          return {
            text: bandText,
            href: bandText
              ? `https://open.spotify.com/search/${encodeQuery(bandText)}`
              : undefined,
          };
        })
        .get();

      // get extra info (text not in links)
      let extra = $(eventLi)
        .clone()
        .find("a")
        .remove()
        .end()
        .text()
        .replace(venue.text, "")
        .trim();

      // clean up extra: remove spaces before commas, multiple commas, newlines, and excess spaces
      extra = extra
        .replace(/--\s*,/g, "--") // remove comma after double dash
        .replace(/\s+,/g, ",") // remove spaces before commas
        .replace(/,+/g, ",") // collapse multiple commas
        .replace(/(?:^,|,$)/g, "") // remove leading/trailing commas
        .replace(/,\s*,+/g, ",") // remove empty commas
        .replace(/\s*\n\s*/g, " ") // replace newlines with space
        .replace(/\s{2,}/g, " ") // collapse multiple spaces
        .replace(/(,\s*)+/g, ", ") // ensure single comma and space
        .replace(/^,|,$/g, "") // remove leading/trailing commas again
        .trim();

      if (venue.text && bands.length) {
        events.push({ venue, bands, extra });
      }
    });

    if (dayText && events.length) {
      shows.push({ day: dayText, events });
    }
  });
});

// write to json file
await writeFile("./src/data/concerts.json", JSON.stringify({ shows }, null, 2));
console.log("all concerts scraped and saved.");
