import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Signed one-click unsubscribe links. The token is an HMAC over the contact
 * id keyed by NEWSLETTER_ENCRYPTION_KEY (already required for email
 * sending), so links can't be forged to unsubscribe other contacts.
 */

function getSigningKey() {
  const key = process.env.NEWSLETTER_ENCRYPTION_KEY
  if (!key) {
    throw new Error("NEWSLETTER_ENCRYPTION_KEY environment variable is not set")
  }
  return Buffer.from(key, "base64")
}

export function unsubscribeToken(contactId: string) {
  return createHmac("sha256", getSigningKey())
    .update(`unsubscribe:${contactId}`, "utf8")
    .digest("hex")
    .slice(0, 32)
}

export function verifyUnsubscribeToken(contactId: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(contactId), "utf8")
  const provided = Buffer.from(token, "utf8")
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  )
}

/**
 * The externally reachable origin used in email links. Falls back to the
 * first configured app origin so dev links point at the local server.
 */
export function getPublicOrigin() {
  const configured = process.env.NEWSLETTER_PUBLIC_ORIGIN?.trim()
  if (configured) return configured.replace(/\/$/, "")

  const firstAppOrigin = (process.env.CUSTOM_SHELL_APP_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean)[0]
  if (firstAppOrigin) return firstAppOrigin

  throw new Error(
    "Set NEWSLETTER_PUBLIC_ORIGIN or CUSTOM_SHELL_APP_ORIGINS to build unsubscribe links"
  )
}

export function buildUnsubscribeUrl(contactId: string) {
  const params = new URLSearchParams({
    c: contactId,
    t: unsubscribeToken(contactId),
  })
  return `${getPublicOrigin()}/api/v1/unsubscribe?${params.toString()}`
}
