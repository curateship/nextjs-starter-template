/**
 * Picking a usable contact address out of imported data.
 *
 * Importers scrape a business's own website, and websites carry addresses that
 * are not contacts: the error-reporting inbox a site builder wires in (Wix
 * relays through `…@sentry-next.wixpress.com`, whose name is a 32-character key
 * that reads on the page as a meaningless string of letters and numbers),
 * automated senders nobody reads, and placeholder addresses from a template.
 * None of those belong on a listing, so they never get saved.
 */

// Matches a plain address. Deliberately simple: this decides whether to keep a
// scraped value, not whether an address can receive mail.
const EMAIL_PATTERN = /^[^\s@,;<>()[\]]+@[^\s@,;<>()[\]]+\.[a-z]{2,}$/i

/** Hosts, and any host beneath them, that only ever carry machine addresses. */
const NON_CONTACT_DOMAINS = [
  "wixpress.com",
  "sentry.io",
  "example.com",
  "example.net",
  "example.org",
  "localhost",
  "invalid",
  "test",
]

/** Mailbox names that exist to send, not to be written to. */
const NON_CONTACT_MAILBOXES = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "no_reply",
]

function isContactEmail(candidate: string): boolean {
  if (!EMAIL_PATTERN.test(candidate)) return false

  const atIndex = candidate.lastIndexOf("@")
  const mailbox = candidate.slice(0, atIndex).toLowerCase()
  const domain = candidate.slice(atIndex + 1).toLowerCase()

  if (NON_CONTACT_DOMAINS.some((host) => domain === host || domain.endsWith(`.${host}`))) return false
  if (NON_CONTACT_MAILBOXES.includes(mailbox)) return false

  // A long run of nothing but hex is a generated key, not a mailbox someone
  // reads. Real addresses that long always carry a dot, dash or other letter.
  if (mailbox.length >= 24 && /^[0-9a-f]+$/.test(mailbox)) return false

  return true
}

/**
 * The first usable contact address in an imported value, or an empty string when
 * there is none. Accepts a single address, a comma or semicolon separated list,
 * or an array — importers hand back all three shapes.
 */
export function pickContactEmail(value: unknown): string {
  const candidates = (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item ?? "").split(/[,;]/))
    .map((item) => item.trim().replace(/^mailto:/i, "").trim())
    .filter(Boolean)

  return candidates.find(isContactEmail) ?? ""
}
