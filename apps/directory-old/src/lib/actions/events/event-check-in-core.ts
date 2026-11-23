// Pure helpers for event check-in: minting a ticket code, reading one back out
// of whatever the door screen was handed, and printing it. Kept free of
// 'server-only', of any DB import and of any Node built-in, so the server
// actions, the door screen in the browser and the unit tests
// (event-check-in-core.test.ts) can all use it.

/**
 * Ticket codes are uppercase hex, 16 characters — 64 bits of randomness, the
 * same shape migration 198 backfills onto the registrations that predate it.
 * The code is a bearer token: whoever holds it can open the ticket page.
 */
export const CHECK_IN_CODE_LENGTH = 16
const CHECK_IN_CODE_REGEX = /^[0-9A-F]{16}$/

export function generateCheckInCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CHECK_IN_CODE_LENGTH / 2))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function isCheckInCode(value: unknown): value is string {
  return typeof value === 'string' && CHECK_IN_CODE_REGEX.test(value)
}

/**
 * The code inside whatever the door screen received, or ''.
 *
 * Accepts the bare code, the code typed with the spacing the ticket prints
 * (`1A2B-3C4D-…`), and the ticket URL a phone camera hands over — a scanner
 * returns the whole URL, and an organizer reading a code off a phone screen
 * types the groups they can see. Anything that is not hex is dropped, then the
 * result has to be exactly one code, so a URL carrying other digits (a port, a
 * query string) cannot be stitched into a valid-looking one.
 */
export function extractCheckInCode(value: unknown): string {
  if (typeof value !== 'string') return ''

  const trimmed = value.trim()
  const fromUrl = /\/tickets\/([0-9a-fA-F-]+)/.exec(trimmed)
  const candidate = (fromUrl ? fromUrl[1] : trimmed).replace(/[^0-9a-fA-F]/g, '').toUpperCase()

  return isCheckInCode(candidate) ? candidate : ''
}

/** `1A2B-3C4D-5E6F-7890` — four groups, so it can be read aloud and typed back. */
export function formatCheckInCode(code: string): string {
  return (code.match(/.{1,4}/g) || []).join('-')
}

/** The public ticket page for a code. `siteUrl` has no trailing slash. */
export function buildTicketUrl(siteUrl: string, code: string): string {
  return `${siteUrl}/tickets/${code}`
}

/** The QR image the confirmation email embeds. Absolute, so mail clients can fetch it. */
export function buildTicketQrUrl(siteUrl: string, code: string): string {
  return `${siteUrl}/api/tickets/${code}/qr`
}
