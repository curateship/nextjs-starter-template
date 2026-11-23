import { privateKeyToAccount } from "viem/accounts"

/**
 * The one place a trading key becomes a signer, and the rules that guard it.
 *
 * Two rules, both load-bearing:
 *
 * - **The key never leaves this folder.** It arrives decrypted for one call,
 *   becomes a signer, and is let go when the call ends — never cached, never
 *   logged, never part of an error. `@/server/protocols/scrub` is the belt on
 *   top of the braces: any hex string long enough to be a key is struck out
 *   of every message that could travel.
 * - **Nothing here is exported past the protocol registry.** The fence test
 *   keeps this package (and viem) inside this folder.
 *
 * The real-money gate used to live here too; it moved to
 * `@/server/protocols/real-money` the day a second exchange arrived, because
 * one lever must arm every venue at once.
 */

/** A key with or without its 0x, as the wallet dialog accepts both. */
export function normalizeAgentKey(agentKey: string): `0x${string}` {
  const bare = agentKey.trim().replace(/^0x/i, "")
  return `0x${bare.toLowerCase()}` as `0x${string}`
}

/**
 * The signer a decrypted trading key unlocks. Built per call and thrown away
 * with it — the old app cached these for the life of the process, which kept
 * decrypted keys resident in memory forever, and that is a mistake this app
 * chose not to copy.
 */
export function agentSigner(agentKey: string) {
  return privateKeyToAccount(normalizeAgentKey(agentKey))
}

/** The public address a trading key signs as, lowercase. */
export function agentAddress(agentKey: string): string {
  return agentSigner(agentKey).address.toLowerCase()
}
