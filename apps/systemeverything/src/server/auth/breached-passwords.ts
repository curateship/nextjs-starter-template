import { createHash } from "node:crypto"

/**
 * Have I Been Pwned's range API, the public list of passwords found in known
 * data breaches.
 *
 * Only the first five characters of the password's SHA-1 ever leave this
 * server. The service answers with every hash it knows that starts with those
 * five, and the comparison happens here — so it is never told the password, its
 * full hash, or whose account is being set up.
 */
const RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/"

/** Long enough for a normal round trip, short enough that signing up never hangs. */
const TIMEOUT_MS = 2_000

/**
 * Refuses a password that appears in a known breach.
 *
 * Fails open on purpose: if the outside service is slow, unreachable or
 * unhappy, the password is accepted. This check is worth having but it is not
 * worth taking sign-up down for.
 */
export async function enforcePasswordNotBreached(password: string) {
  // SHA-1 is what the API's ranges are keyed by. It is the lookup key for a
  // public list, not a way of protecting anything, so its age does not matter.
  const digest = createHash("sha1")
    .update(password, "utf8")
    .digest("hex")
    .toUpperCase()
  const prefix = digest.slice(0, 5)
  const suffix = digest.slice(5)

  let body: string
  try {
    const response = await fetch(`${RANGE_ENDPOINT}${prefix}`, {
      // Asks for the reply to be bulked out with decoys, so anyone watching the
      // connection cannot infer the answer from how big it is.
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    body = await response.text()
  } catch (error) {
    console.warn(
      `[custom-shell] breached-password check skipped: ${String(error)}`
    )
    return
  }

  const found = body.split("\n").some((line) => {
    const [candidate, count] = line.trim().split(":")
    // The decoys come back with a count of zero; a real match never does.
    return candidate === suffix && Number(count) > 0
  })

  if (found) {
    throw new Error("PASSWORD_BREACHED")
  }
}
