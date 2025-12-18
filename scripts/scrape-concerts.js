// imports
import fetch from "node-fetch";
import { load } from "cheerio";
import { writeFile } from "fs/promises";
import { isNonArtist } from "../src/lib/shared-utils.js";

// helper to encode for url
function encodeQuery(str) {
  return encodeURIComponent(str.replace(/\s+/g, " ").trim());
}

// helper to clean artist names by removing all parenthetical text
function cleanArtistName(name) {
  return name
    .replace(/\s*\([^)]*\)\s*/g, "") // remove all text in parentheses
    .trim();
}

// now using shared isNonArtist function from shared-utils.js

// helper to fetch and parse a single page
async function fetchPage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`page not found: ${url} (status ${res.status})`);
      return null;
    }
    const html = await res.text();
    return load(html);
  } catch (error) {
    console.log(`error fetching ${url}: ${error.message}`);
    return null;
  }
}

// helper to normalize date to ISO format with proper year tracking
function normalizeDate(day, seenMonths = new Set()) {
  const months = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };

  const parts = day.toLowerCase().split(" ");
  const [_, monthAbbr, dayNumber] = parts;
  const month = months[monthAbbr];

  // start with current year (dynamic)
  const currentYear = new Date().getFullYear();
  let year = currentYear;

  // if we've seen december and now see any month from january to june, it's likely next year
  // this covers the rollover from dec current-year to early months of next-year
  if (
    seenMonths.has("12") &&
    (month === "01" ||
      month === "02" ||
      month === "03" ||
      month === "04" ||
      month === "05" ||
      month === "06")
  ) {
    year = currentYear + 1;
  }

  // track months we've seen
  seenMonths.add(month);

  return `${year}-${month}-${dayNumber.padStart(2, "0")}`;
}

// fetch all pages from by-date.0.html to by-date.30.html
console.log("starting to fetch pages...");
const baseUrl = "http://www.foopee.com/punk/the-list/by-date.";
const pagePromises = Array.from({ length: 31 }, (_, i) => {
  const url = `${baseUrl}${i}.html`;
  console.log(`fetching page ${i}: ${url}`);
  return fetchPage(url);
});
const pageResults = await Promise.all(pagePromises);
const pages = pageResults.filter((page) => page !== null);
console.log(
  `successfully fetched ${pages.length} pages out of ${pageResults.length} attempted`,
);

// collect events for each day
const shows = [];
let totalEvents = 0;
let excludedComedians = 0;
const seenMonths = new Set(); // track months across all pages for year rollover

console.log("processing pages and extracting events...");

// process each page
pages.forEach(($, pageIndex) => {
  console.log(`processing page ${pageIndex}...`);
  let pageEvents = 0;
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
          const rawBandText = $(bandEl).text().trim();

          // skip comedians entirely
          if (isNonArtist(rawBandText)) {
            excludedComedians++;
            console.log(`excluded comedian: ${rawBandText}`);
            return null;
          }

          const bandText = cleanArtistName(rawBandText); // clean the artist name
          return {
            text: bandText,
            href: bandText
              ? `https://open.spotify.com/search/${encodeQuery(bandText)}`
              : undefined,
          };
        })
        .get()
        .filter((band) => band !== null && band.text); // filter out null entries and empty band names

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
        pageEvents++;
        totalEvents++;
      }
    });

    if (dayText && events.length) {
      const normalizedDate = normalizeDate(dayText, seenMonths); // normalize the dayText here
      shows.push({ day: dayText, normalizedDate, events });
    }
  });
  console.log(`page ${pageIndex} processed: ${pageEvents} events found`);
});

// write to json file
console.log(`\nprocessing complete:`);
console.log(`- total events found: ${totalEvents}`);
console.log(`- comedians excluded: ${excludedComedians}`);
console.log(`- days with events: ${shows.length}`);
console.log("writing to raw.json...");

await writeFile("./src/data/raw.json", JSON.stringify({ shows }, null, 2));
console.log("all concerts scraped and saved successfully!");
