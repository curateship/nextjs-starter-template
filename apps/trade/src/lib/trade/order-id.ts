import { z } from "zod"

/**
 * What an exchange's own order id is allowed to look like.
 *
 * Every exchange names its orders differently. Hyperliquid numbers them,
 * Phemex gives each one a uuid with dashes, and KuCoin a hex string. The rule
 * has to fit all three, so it allows letters, digits, dashes and underscores
 * and nothing else.
 *
 * **Why it lives in its own file.** A rule written for one exchange refuses
 * the others before the request ever leaves the app, and all the person sees
 * is that the action did not go through — nothing says which rule stopped it.
 * On 19 Aug 2026 a Phemex order could not be cancelled for exactly that
 * reason: the cancel door demanded digits and at most 24 characters, and a
 * Phemex id is a 36-character uuid. One rule, in one place, with a test on it.
 */
export const orderIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/)
