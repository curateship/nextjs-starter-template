/**
 * Where an event's tickets are sold, drawn as "Get tickets" on the event page
 * and sent to Google as the offer's address (task events/37, Part 2). Read by
 * the event window and by the server, so the two refuse the same addresses.
 */

export const TICKETS_URL_MAX = 600

/**
 * The address as it is kept, or empty for none. Only `https://` addresses are
 * taken, the same rule as the AI step's source page, so the button never
 * opens a plain-text page or a `javascript:` one.
 */
export function cleanTicketsUrl(raw: string): string {
  const typed = raw.trim()
  if (!typed) return ""
  let url: URL
  try {
    url = new URL(typed)
  } catch {
    throw new Error("The tickets link has to be a full address starting https://.")
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) {
    throw new Error("The tickets link has to be a full address starting https://.")
  }
  const kept = url.toString()
  if (kept.length > TICKETS_URL_MAX) {
    throw new Error("The tickets link is too long.")
  }
  return kept
}

/** The site the link goes to, for the button's small line: "eventbrite.ca". */
export function ticketsHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}
