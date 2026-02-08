import * as React from "react";

interface AddToCalendarButtonProps {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // e.g., "6:30pm", "7pm/8pm"
  venue?: string;
  description?: string;
  filename?: string;
  className?: string;
}

function parseTime(timeStr: string): { hour: number; minute: number } | null {
  if (!timeStr) return null;

  // Match patterns like "6:30pm", "7pm", "6:30", "19:00", etc.
  const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  let minute = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();

  // Convert to 24-hour format
  if (period === "pm" && hour !== 12) {
    hour += 12;
  } else if (period === "am" && hour === 12) {
    hour = 0;
  }

  return { hour, minute };
}

function extractStartTime(extraStr: string): string | null {
  if (!extraStr) return null;

  // Look for time patterns like "6:30pm", "7pm", "19:00" in the extra field
  // Common patterns in data: "a/a 6:30pm", "7pm/8pm", "doors 8pm"
  const timeMatch = extraStr.match(
    /(\d{1,2}:\d{2}\s*(?:am|pm)|\d{1,2}\s*(?:am|pm))/i,
  );
  if (!timeMatch) return null;

  const parsed = parseTime(timeMatch[1]);
  if (!parsed) return null;

  return `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
}

function generateIcs({
  title,
  date,
  time,
  venue,
  description,
}: AddToCalendarButtonProps) {
  function formatIcsDate(dateStr: string, timeStr?: string) {
    if (!dateStr) return "";

    // If we have a time, combine date and time
    if (timeStr) {
      const startTime = extractStartTime(timeStr) || "20:00"; // default to 8pm if parsing fails
      const [year, month, day] = dateStr.split("-").map(Number);
      const [hour, minute] = startTime.split(":").map(Number);

      // Create date in Pacific Time (Bay Area)
      const dt = new Date(Date.UTC(year, month - 1, day, hour + 8, minute)); // PST is UTC-8
      return dt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    }

    // No time provided - create all-day event
    return dateStr.replace(/-/g, "");
  }

  const dtStart = formatIcsDate(date, time);
  const uid = `${dtStart}-${title.replace(/\s+/g, "-")}`;

  // Build description with all relevant info
  let fullDescription = "";
  if (description) {
    fullDescription = description;
  }

  let ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//bay-punks//calendar//EN\nBEGIN:VEVENT\nUID:${uid}@baypunks\nSUMMARY:${title}\nDTSTART:${dtStart}\n`;

  // Add DTEND for timed events (assume 3 hour duration by default)
  if (time) {
    const startTime = extractStartTime(time) || "20:00";
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = startTime.split(":").map(Number);
    const endHour = hour + 3;
    const endDt = new Date(Date.UTC(year, month - 1, day, endHour + 8, minute));
    const dtEnd = endDt
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    ics += `DTEND:${dtEnd}\n`;
  }

  if (venue) ics += `LOCATION:${venue}\n`;
  if (fullDescription) ics += `DESCRIPTION:${fullDescription}\n`;
  ics += `END:VEVENT\nEND:VCALENDAR`;
  return ics;
}

function downloadIcsForEvent(props: AddToCalendarButtonProps) {
  const icsContent = generateIcs(props);
  const blob = new Blob([icsContent], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    props.filename || `${props.date}-${props.title.replace(/\s+/g, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export const AddToCalendarButton: React.FC<AddToCalendarButtonProps> = ({
  title,
  date,
  venue,
  description,
  filename,
  className,
}) => {
  return (
    <button
      type="button"
      className={
        className ||
        "add-to-calendar-btn mt-1 cursor-pointer text-xs text-blue-600 hover:underline"
      }
      onClick={() =>
        downloadIcsForEvent({ title, date, venue, description, filename })
      }
    >
      Add to Calendar
    </button>
  );
};
