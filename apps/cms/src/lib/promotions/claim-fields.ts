/**
 * What a deal's claims allow, read by the deal windows in the browser and by
 * the server, so the two never disagree. The name and email a visitor gives
 * are checked by the same rules as an event sign-up, in
 * `lib/events/sign-up-fields.ts`.
 */

/** The most people a deal can be for, the same as the database's check. */
export const MAX_CLAIM_LIMIT = 100_000

/** How many claims one internet address may make on one site an hour. */
export const CLAIMS_PER_HOUR = 8

/**
 * A typed limit as the number to save: null for an empty box, which means
 * anyone can claim, and an error in words for anything else that is not a
 * whole number from 1 up.
 */
export function readClaimLimit(typed: string): number | null {
  const trimmed = typed.trim()
  if (!trimmed) return null
  const limit = Number(trimmed)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CLAIM_LIMIT) {
    throw new Error(
      "How many can claim it has to be a whole number from 1 up, or empty for no limit."
    )
  }
  return limit
}

/** "30 of 50 left", or null with no limit. */
export function claimsLeftText(box: {
  limit: number | null
  left: number | null
}): string | null {
  if (box.limit === null || box.left === null) return null
  return `${box.left} of ${box.limit} left`
}
