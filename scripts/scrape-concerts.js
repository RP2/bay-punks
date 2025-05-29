// imports
import fetch from "node-fetch";
import { load } from "cheerio";
import { writeFile } from "fs/promises";

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

// helper to check if an artist should be excluded (e.g., comedians)
function shouldExcludeArtist(name) {
  return /\(comedian\)/i.test(name);
}

// helper to fetch and parse a single page
async function fetchPage(url) {
  const res = await fetch(url);
  const html = await res.text();
  return load(html);
}

// helper to normalize date to ISO format
function normalizeDate(day) {
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
  const year = new Date().getFullYear();

  // handle year rollover for december to january
  const currentMonth = new Date().getMonth() + 1; // months are 0-indexed
  if (month === "01" && currentMonth === 12) {
    return `${year + 1}-${month}-${dayNumber.padStart(2, "0")}`;
  }

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
const pages = await Promise.all(pagePromises);
console.log(`successfully fetched ${pages.length} pages`);

// collect events for each day
const shows = [];
let totalEvents = 0;
let excludedComedians = 0;

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
          if (shouldExcludeArtist(rawBandText)) {
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
      const normalizedDate = normalizeDate(dayText); // normalize the dayText here
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
console.log("writing to concerts.json...");

await writeFile("./src/data/concerts.json", JSON.stringify({ shows }, null, 2));
console.log("all concerts scraped and saved successfully!");
