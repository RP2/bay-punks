import * as React from "react";

interface AddToCalendarButtonProps {
  title: string;
  date: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  venue?: string;
  description?: string;
  filename?: string;
  className?: string;
}

function generateIcs({
  title,
  date,
  venue,
  description,
}: AddToCalendarButtonProps) {
  function formatIcsDate(dateStr: string) {
    if (!dateStr) return "";
    if (dateStr.length > 10) {
      const d = new Date(dateStr);
      return d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    } else {
      return dateStr.replace(/-/g, "");
    }
  }
  const dtStart = formatIcsDate(date);
  const uid = `${dtStart}-${title.replace(/\s+/g, "-")}`;
  let ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//bay-punks//calendar//EN\nBEGIN:VEVENT\nUID:${uid}@baypunks\nSUMMARY:${title}\nDTSTART:${dtStart}\n`;
  if (venue) ics += `LOCATION:${venue}\n`;
  if (description) ics += `DESCRIPTION:${description}\n`;
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
