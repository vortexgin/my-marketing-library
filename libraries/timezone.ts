/**
 * Organization timezone helpers. Timestamps stay UTC in storage; schedule
 * inputs and displays convert through the organization's IANA zone.
 */

function supportedTimezones(): Set<string> {
  try {
    const values = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (Array.isArray(values) && values.length > 0) {
      return new Set(values);
    }
  } catch {
    // Fall through to the curated fallback below.
  }
  return new Set(["UTC", "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Singapore", "Asia/Kuala_Lumpur", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Berlin", "Australia/Sydney"]);
}

/** Allowlisted IANA timezone check for organization settings. */
export function isValidTimezone(value: unknown): value is string {
  return typeof value === "string" && supportedTimezones().has(value);
}

/** UTC offset in minutes for a zone at a given instant (DST-aware). */
function offsetMinutesAt(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - at.getTime()) / 60000;
}

/**
 * Interprets a wall-clock datetime (`YYYY-MM-DDTHH:mm`) in the given zone
 * and returns the UTC instant. Throws on unknown zones or bad input.
 */
export function orgLocalToUtc(local: string, timeZone: string): Date {
  if (!isValidTimezone(timeZone)) {
    throw new Error(`Unknown timezone: ${timeZone}`);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!match) {
    throw new Error("Schedule must be YYYY-MM-DDTHH:mm in the organization timezone.");
  }
  const [, year, month, day, hour, minute] = match.map(Number);
  // Iterate the offset twice: the wall clock maps to an instant whose own
  // offset then corrects the first guess (covers DST folds).
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let round = 0; round < 2; round += 1) {
    guess = new Date(Date.UTC(year, month - 1, day, hour, minute) - offsetMinutesAt(timeZone, guess) * 60000);
  }
  return guess;
}

/** Formats a UTC instant as `YYYY-MM-DDTHH:mm` wall clock in the given zone. */
export function utcToOrgLocal(at: Date, timeZone: string): string {
  const zone = isValidTimezone(timeZone) ? timeZone : "Asia/Jakarta";
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
