/**
 * A claim's code: how it is written, how it is read back out of whatever the
 * counter was handed, and the page that shows it.
 *
 * Kept free of every server import and of every Node built-in, so the counter
 * screen in the browser, the server and the tests all read the one set of
 * rules. Drawing the code is the server's job, in
 * `server/promotions/claims.ts`, because only it has a random source worth
 * trusting.
 *
 * The event tickets in `workspace/tasks/events/30-qr-tickets-and-door-check-in.md`
 * are the same shape and can lift this file's reader rather than writing a
 * second one.
 */

/** Letters and digits nobody misreads: no 0/O, no 1/I/L. */
export const CLAIM_CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/** Four and four: short enough to read aloud across a counter. */
const GROUP = 4
const GROUPS = 2

/** `K7QX-P2MD` as written down and stored. */
const WRITTEN = new RegExp(
  `^[${CLAIM_CODE_LETTERS}]{${GROUP}}(-[${CLAIM_CODE_LETTERS}]{${GROUP}}){${GROUPS - 1}}$`
)

export function isClaimCode(value: unknown): value is string {
  return typeof value === "string" && WRITTEN.test(value)
}

/** `K7QXP2MD` written the way it is shown: `K7QX-P2MD`. */
export function formatClaimCode(letters: string): string {
  return (letters.match(new RegExp(`.{1,${GROUP}}`, "g")) ?? []).join("-")
}

/**
 * The code inside whatever the counter screen received, or "".
 *
 * Three things arrive there: the code as it is printed, the code typed without
 * its dash or in lower case, and the whole counter address a phone camera
 * hands over. Anything outside the code's own letters is dropped, and what is
 * left has to be exactly one code, so an address carrying other letters and
 * digits can never be stitched into one that looks real.
 */
export function readScannedCode(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  const fromLink = /\/deals\/code\/([^/?#\s]+)/i.exec(trimmed)
  const typed = (fromLink ? fromLink[1] : trimmed).toUpperCase()
  const letters = typed
    .split("")
    .filter((letter) => CLAIM_CODE_LETTERS.includes(letter))
    .join("")
  if (letters.length !== GROUP * GROUPS) return ""
  const code = formatClaimCode(letters)
  return isClaimCode(code) ? code : ""
}

/** The page the code is shown on, which is what the QR holds. */
export function claimPageUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/$/, "")}/deals/code/${code}`
}
