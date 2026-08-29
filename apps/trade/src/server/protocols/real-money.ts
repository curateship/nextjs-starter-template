import type { NetworkId } from "@/lib/protocols/contracts"
import { type CustomShellDb, db } from "@/server/db"
import {
  forgetRealMoneySwitch,
  realMoneyYesRemembered,
  rememberRealMoneyYes,
} from "@/server/protocols/real-money-memory"
import { realMoneySwitch } from "@/server/trade/workers"

/**
 * The one gate every exchange connector passes before touching real money.
 *
 * Two layers, both required, checked on the signing path itself so no screen
 * and no future endpoint can route around them:
 *
 * - **The master lock**: `TRADE_ENABLE_MAINNET=true` on the server. It can
 *   only be changed by a deploy, so nothing clicked in a browser can arm an
 *   install that was never meant to trade for real.
 * - **The Settings toggle** behind that lock: the `real-money` row in
 *   `trade_worker_controls`, read through `realMoneySwitch`. A missing row
 *   means off — real money is the one thing a fresh database never allows
 *   until somebody switches it on out loud.
 *
 * This file sits above the per-exchange folders on purpose. One switch arms
 * every venue at once: three exchanges, one lever, and a connector that
 * forgot to call it is one grep away from being found. Testnet skips both
 * layers — a practice network is what practice is for. KuCoin has no testnet
 * at all, so for it this gate is the only thing between a click and money.
 *
 * Both refusals throw the same `LIVE_MAINNET_OFF`, so every screen's
 * "switched off on this server" wording stays true whichever layer said no.
 */

/**
 * The master lock alone — the synchronous half, for callers that cannot wait
 * on the database (flow specs being frozen, dry checks before work starts).
 * The env var is read at call time, not import time, so tests and ops can
 * flip it.
 */
export function assertRealOrdersAllowed(network: NetworkId): void {
  if (network === "testnet") return
  if (process.env.TRADE_ENABLE_MAINNET !== "true") {
    throw new Error("LIVE_MAINNET_OFF")
  }
}

/**
 * The Settings toggle behind the lock. Refuses unless BOTH layers say yes.
 *
 * A "yes" is remembered for two seconds — see `real-money-memory.ts` for
 * why that never delays an OFF in the process that took the click, and why
 * "off" itself is never remembered.
 */
export async function assertRealMoneySwitchOn(
  database: CustomShellDb = db
): Promise<void> {
  if (realMoneyYesRemembered(database)) return
  const real = await realMoneySwitch(database)
  if (!real.masterAllowed || !real.enabled) {
    forgetRealMoneySwitch()
    throw new Error("LIVE_MAINNET_OFF")
  }
  rememberRealMoneyYes(database)
}

/**
 * Both layers in one call — what a connector's place/cancel/modify/close/
 * setBrackets calls first, before building anything that could sign.
 */
export async function assertRealMoneyAllowed(network: NetworkId): Promise<void> {
  assertRealOrdersAllowed(network)
  if (network !== "testnet") await assertRealMoneySwitchOn()
}
