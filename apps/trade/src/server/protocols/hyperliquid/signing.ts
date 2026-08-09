import { privateKeyToAccount } from "viem/accounts"

import type { NetworkId } from "@/lib/protocols/contracts"

/**
 * The one place a trading key becomes a signer, and the rules that guard it.
 *
 * Three rules, all load-bearing:
 *
 * - **The key never leaves this folder.** It arrives decrypted for one call,
 *   becomes a signer, and is let go when the call ends — never cached, never
 *   logged, never part of an error. `scrubSecrets` is the belt on top of the
 *   braces: any hex string long enough to be a key is struck out of every
 *   message that could travel.
 * - **Real money is blocked until it is deliberately switched on.** Testnet
 *   signs freely; mainnet signing throws unless `TRADE_ENABLE_MAINNET=true`
 *   is set on the server. The check lives here, on the signing path itself,
 *   so no screen and no future endpoint can route around it.
 * - **Nothing here is exported past the protocol registry.** The fence test
 *   keeps this package (and viem) inside this folder.
 */

/**
 * Refuses to sign for real money until the switch is deliberately flipped.
 * The env var is read at call time, not import time, so tests and ops can
 * flip it. The funded testnet run in `workspace/tasks/Trading/real-orders.md`
 * is the condition for flipping it — see that task's acceptance list.
 */
export function assertRealOrdersAllowed(network: NetworkId): void {
  if (network === "testnet") return
  if (process.env.TRADE_ENABLE_MAINNET !== "true") {
    throw new Error("LIVE_MAINNET_OFF")
  }
}

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

/**
 * Strikes anything key-shaped out of a message before it can travel — 64 or
 * more hex characters, with or without 0x, is long enough to be a private key
 * and short enough to be nothing anyone needs to read. Addresses (40 hex) are
 * left alone; they are public. Capped in length because exchange errors can
 * carry whole payloads back.
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
