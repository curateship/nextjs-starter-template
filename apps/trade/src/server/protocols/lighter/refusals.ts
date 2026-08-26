/**
 * Lighter's answers as named refusals, the way Aster's `refusals.ts` does it.
 *
 * No raw Lighter text ever leaves this folder: a refusal is one of these
 * sentences, or the general one with only Lighter's numeric code kept.
 * The list grows as the order stages land and real codes are seen; the
 * rate-limit cases are here first because the markets-only stage can hit
 * them.
 */

const SENTENCES = {
  EXCHANGE_BUSY:
    "Lighter is asking Trade to slow down. Trade has paused Lighter requests for a minute and will try again after the hold.",
  LIGHTER_NOT_FOUND:
    "Lighter says it has no such market or record. Refresh the market list before trying again.",
  LIGHTER_NO_ACCOUNT:
    "Lighter has no account at that address. Check the address on Lighter's own site, and make sure it is the wallet you trade with there.",
  LIGHTER_KEY_NOT_REGISTERED:
    "That API key is not one Lighter has registered for this account. Make a new API key on Lighter's site and paste the private key it gives you.",
  LIGHTER_AUTH:
    "Lighter did not accept this API key. Make a new one on Lighter's site and check that it belongs to this account.",
  LIGHTER_REGION_BLOCKED:
    "Lighter will not accept orders from this server's country. Reading markets and the account still works; only placing, changing and cancelling are refused. Lighter decides this by where the server sits, so it takes a server somewhere Lighter serves, not a different key.",
  LIGHTER_NONCE:
    "Lighter refused the transaction's sequence number. Trade has thrown its count away and will ask Lighter for the right one before the next order.",
} as const

export type LighterRefusal = keyof typeof SENTENCES

export function lighterRefusalCode(
  status: number,
  code: string
): LighterRefusal | null {
  // 429 is the ordinary rate answer; Lighter's docs also name 405 for the
  // same thing, served by its firewall with a static 60-second cooldown.
  if (status === 429 || status === 405) return "EXCHANGE_BUSY"
  // 21100 is Lighter's answer for an address it holds no account for, and
  // 21109 for an API key index it has never registered. Both are things a
  // person can fix, so they get their own words rather than the general one.
  if (code === "21100") return "LIGHTER_NO_ACCOUNT"
  if (code === "21109") return "LIGHTER_KEY_NOT_REGISTERED"
  // Measured 26 Aug 2026: Lighter answers 20558 on `sendTx` from a country it
  // does not serve, while every read from the same address still answers 200.
  if (code === "20558") return "LIGHTER_REGION_BLOCKED"
  if (code === "21120" || code === "21121") return "LIGHTER_NONCE"
  if (status === 401 || status === 403) return "LIGHTER_AUTH"
  if (status === 404 || code === "21500") return "LIGHTER_NOT_FOUND"
  return null
}

export function lighterRefusalError(input: {
  status: number
  code: string
}): Error {
  const named = lighterRefusalCode(input.status, input.code)
  if (named) return new Error(`${named}:${SENTENCES[named]}`)
  const safeCode = /^-?\d{1,10}$/.test(input.code) ? input.code : "unknown"
  return new Error(
    `LIGHTER_REFUSED:Lighter refused the request for a reason Trade does not recognize (code ${safeCode}). Check Lighter's status before trying again.`
  )
}

export function lighterRefusalSentence(code: LighterRefusal): string {
  return SENTENCES[code]
}
