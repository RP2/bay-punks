// utils/ics-generator.js
// utility to generate and trigger download of an .ics (iCalendar) file for an event
// usage: import { downloadIcsForEvent } from "@/lib/ics-generator";

/**
 * Generate ICS file content for a single event
 * @param {Object} event - The event object
 * @param {string} event.title - Event title (e.g. band names or show title)
 * @param {string} event.start - Start date/time in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm)
 * @param {string} [event.end] - End date/time in ISO format (optional)
 * @param {string} [event.location] - Venue name/address (optional)
 * @param {string} [event.description] - Description/extra info (optional)
 * @returns {string} - ICS file content
 */
export function generateIcs(event) {
  // format dates for ICS (YYYYMMDD or YYYYMMDDTHHmmssZ)
  function formatIcsDate(dateStr) {
    if (!dateStr) return "";
    // If time is included, use full format, else just date
    if (dateStr.length > 10) {
      // Assume UTC if Z, else local
      const d = new Date(dateStr);
      return d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    } else {
      return dateStr.replace(/-/g, "");
    }
  }

  const dtStart = formatIcsDate(event.start);
  const dtEnd = event.end ? formatIcsDate(event.end) : undefined;
  const uid = `${dtStart}-${event.title.replace(/\s+/g, "-")}`;

  let ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//bay-punks//calendar//EN\nBEGIN:VEVENT\nUID:${uid}@baypunks\nSUMMARY:${event.title}\nDTSTART:${dtStart}\n`;
  if (dtEnd) ics += `DTEND:${dtEnd}\n`;
  if (event.location) ics += `LOCATION:${event.location}\n`;
  if (event.description) ics += `DESCRIPTION:${event.description}\n`;
  ics += `END:VEVENT\nEND:VCALENDAR`;
  return ics;
}

/**
 * Trigger download of an ICS file for the given event
 * @param {Object} event - See generateIcs for fields
 * @param {string} [filename] - Optional filename for the .ics file
 */
export function downloadIcsForEvent(event, filename) {
  const icsContent = generateIcs(event);
  const blob = new Blob([icsContent], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `${event.title.replace(/\s+/g, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
