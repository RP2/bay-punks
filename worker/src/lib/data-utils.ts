// shared helpers for scraping, cleaning, and normalization

export function encodeQuery(str: string): string {
  return encodeURIComponent(str.replace(/\s+/g, " ").trim());
}

export function cleanArtistName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, "").trim();
}

export function shouldExcludeArtist(name: string): boolean {
  if (/\(comedian\)/i.test(name)) return true;
  const normalized = name.toLowerCase().trim();
  const nonArtistTerms = [
    "membership meeting",
    "member meeting",
    "members meeting",
    "private event",
    "private party",
    "birthday party",
    "birthday bash",
    "birthday celebration",
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
  if (nonArtistTerms.includes(normalized)) return true;
  const cancelledPatterns = [
    /^cancelled:/i,
    /^canceled:/i,
    /^probably cancelled:/i,
    /^postponed:/i,
    /^moved:/i,
    /^rescheduled:/i,
  ];
  if (cancelledPatterns.some((pattern) => pattern.test(name))) return true;
  const birthdayPatterns = [
    /birthday bash/i,
    /birthday celebration/i,
    /birthday party/i,
    /'s.*birthday/i,
    /\d+(?:st|nd|rd|th)\s+birthday/i,
  ];
  if (birthdayPatterns.some((pattern) => pattern.test(name))) return true;
  return false;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

export function normalizeDate(day: string): string {
  const months: Record<string, string> = {
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
  const [, monthAbbr, dayNumber] = parts;
  const month = months[monthAbbr];
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  if (month === "01" && currentMonth === 12) {
    return `${year + 1}-${month}-${dayNumber.padStart(2, "0")}`;
  }
  return `${year}-${month}-${dayNumber.padStart(2, "0")}`;
}

// Add more helpers as needed from your scripts
