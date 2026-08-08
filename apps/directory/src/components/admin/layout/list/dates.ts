// The one set of date formatters for admin lists. Every "Modified", "Created",
// "Date Added" and "Last Active" cell renders through these — never a local
// copy, never a bare toLocaleDateString.

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const exactDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toValidDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Jul 17, 2026" — for dates that should always read exactly. */
export function formatShortDate(value: string | Date | null | undefined, fallback = "-") {
  const date = toValidDate(value);
  return date ? shortDateFormatter.format(date) : fallback;
}

/** "Jul 17, 2026, 3:42 PM" — the hover title behind every relative date. */
export function formatExactDateTime(value: string | Date | null | undefined, fallback = "-") {
  const date = toValidDate(value);
  return date ? exactDateTimeFormatter.format(date) : fallback;
}

/**
 * The one rule for activity timestamps: relative inside 30 days ("Just now",
 * "5 minutes ago", "3 hours ago", "4 days ago", "2 weeks ago"), the exact date
 * beyond that. A date in the future shows the exact date instead of pretending
 * it already happened. Months never appear as relative text, so "1 months ago"
 * cannot come back. Prefer rendering through `RelativeDate` so the exact
 * moment is one hover away.
 */
export function formatRelativeDate(value: string | Date | null | undefined, fallback = "-") {
  const date = toValidDate(value);
  if (!date) return fallback;

  const elapsed = Date.now() - date.getTime();
  if (elapsed < 0 || elapsed >= 30 * DAY) return shortDateFormatter.format(date);
  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  const weeks = Math.floor(elapsed / (7 * DAY));
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}
