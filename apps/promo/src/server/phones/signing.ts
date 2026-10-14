import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * How Promo and the rack program sign what they send each other. The rack's
 * half of the same rule is in `rack/promo_rack.py`; a change here is a change
 * there, or every message is refused.
 *
 * Both sides hold one key, given to the rack when it paired. A request is
 * signed over its method, its path, the time, a random word used once and a
 * hash of its body, so a changed body, a message replayed later and a message
 * sent to another address all fail. A reply is signed over its status, the
 * request's random word, the time and a hash of its body, so a reply cannot
 * be swapped for an old one.
 */

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex")
}

function hmacHex(key: string, canonical: string): string {
  return createHmac("sha256", Buffer.from(key, "utf8")).update(canonical, "utf8").digest("hex")
}

export function requestSignature(
  key: string,
  method: string,
  path: string,
  stamp: number,
  nonce: string,
  body: string
): string {
  return hmacHex(key, [method, path, String(stamp), nonce, sha256Hex(body)].join("\n"))
}

export function replySignature(key: string, status: number, nonce: string, stamp: number, body: string): string {
  return hmacHex(key, ["reply", String(status), nonce, String(stamp), sha256Hex(body)].join("\n"))
}

/** Compares two hex signatures without leaking how much of them matched. */
export function sameSignature(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8")
  const b = Buffer.from(expected, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}
