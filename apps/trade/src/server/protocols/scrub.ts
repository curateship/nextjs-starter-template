/**
 * Strikes secrets out of messages before they can travel.
 *
 * Every exchange connector throws errors that may carry whole request or
 * response payloads back — and a signed request carries a credential. These
 * two helpers are the last line: nothing key-shaped survives into a journal
 * row, a screen, or a log. They lived in the Hyperliquid folder while it was
 * the only exchange; they moved here the day a second one arrived, because
 * scrubbing is policy, not a venue quirk.
 *
 * The rule is deliberately blunt: 64 or more hex characters, with or without
 * 0x, is long enough to be a private key or an API secret and short enough to
 * be nothing anyone needs to read. Addresses (40 hex) are left alone; they
 * are public. A connector whose secrets are not hex (KuCoin's passphrase, a
 * base64 secret) must scrub those itself BEFORE building a message — this is
 * the belt, not the whole outfit.
 */

export function scrubSecrets(message: string): string {
  const struck = message
    .replace(/0x[0-9a-fA-F]{64,}/gi, "0x…")
    .replace(/\b[0-9a-fA-F]{64,}\b/g, "…")
  return struck.length > 300 ? `${struck.slice(0, 300)}…` : struck
}

/** An unknown error as a scrubbed sentence, for journals and refusals. */
export function scrubbedMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error"
  return scrubSecrets(raw)
}
