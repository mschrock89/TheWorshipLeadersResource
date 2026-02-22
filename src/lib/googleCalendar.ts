export interface GoogleCalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toAllDayDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function toUtcDateTime(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function createGoogleCalendarUrl(input: GoogleCalendarEventInput): string {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", input.title);

  if (input.description) {
    url.searchParams.set("details", input.description);
  }

  if (input.location) {
    url.searchParams.set("location", input.location);
  }

  if (input.allDay) {
    const startDate = toAllDayDate(input.start);
    const endDate = toAllDayDate(
      input.end ?? new Date(input.start.getTime() + 24 * 60 * 60 * 1000)
    );
    url.searchParams.set("dates", `${startDate}/${endDate}`);
  } else {
    const start = toUtcDateTime(input.start);
    const end = toUtcDateTime(
      input.end ?? new Date(input.start.getTime() + 60 * 60 * 1000)
    );
    url.searchParams.set("dates", `${start}/${end}`);
  }

  return url.toString();
}

export function openGoogleCalendar(input: GoogleCalendarEventInput): void {
  const url = createGoogleCalendarUrl(input);
  window.open(url, "_blank", "noopener,noreferrer");
}
