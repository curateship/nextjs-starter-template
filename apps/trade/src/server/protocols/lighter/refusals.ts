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
} as const

export type LighterRefusal = keyof typeof SENTENCES

export function lighterRefusalCode(
  status: number,
  code: string
): LighterRefusal | null {
  // 429 is the ordinary rate answer; Lighter's docs also name 405 for the
  // same thing, served by its firewall with a static 60-second cooldown.
  if (status === 429 || status === 405) return "EXCHANGE_BUSY"
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
