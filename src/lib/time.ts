export const EVENT_TIME_ZONE = "Asia/Kolkata";

export function isValidEventTimeZone(timeZone: string) {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function getDateTimeParts(instant: Date, timeZone: string) {
  if (!isValidEventTimeZone(timeZone)) {
    throw new Error(
      "Enter a valid IANA event timezone, such as Asia/Kolkata.",
    );
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
}

export function eventTimeInput(value: string | null, timeZone: string) {
  if (!value) return "";
  const parts = getDateTimeParts(new Date(value), timeZone);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function eventTimeIso(value: string, timeZone: string) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid event date and time.");

  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    throw new Error("Enter a valid event date and time.");
  }
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  calendarDate.setUTCHours(hour, minute, 0, 0);
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error("Enter a valid event date and time.");
  }
  const target = calendarDate.getTime();
  let instant = target;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getDateTimeParts(new Date(instant), timeZone);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((item) => item.type === type)?.value ?? 0);
    const representedDate = new Date(0);
    representedDate.setUTCFullYear(
      part("year"),
      part("month") - 1,
      part("day"),
    );
    representedDate.setUTCHours(part("hour"), part("minute"), 0, 0);
    instant += target - representedDate.getTime();
  }

  if (eventTimeInput(new Date(instant).toISOString(), timeZone) !== value) {
    throw new Error("That time does not exist in the configured event timezone.");
  }

  return new Date(instant).toISOString();
}

export function formatEventTime(value: string, timeZone: string) {
  if (!isValidEventTimeZone(timeZone)) {
    throw new Error(
      "Enter a valid IANA event timezone, such as Asia/Kolkata.",
    );
  }
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
