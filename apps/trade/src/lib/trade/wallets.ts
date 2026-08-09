import type {
  NetworkId,
  ProtocolId,
  WalletAccountFigures,
} from "@/lib/protocols/contracts"

/**
 * Wallets, in the app's own words — browser-safe on purpose. The server file
 * (`@/server/trade/wallets.ts`) stores them; this one holds the shapes and the
 * arithmetic, so the panel and its tests never touch a database or a secret.
 */

/**
 * The two kinds of wallet. A paper wallet is pretend money priced off the real
 * exchange, traded by the engine in `@/lib/trade/paper`; a live wallet is a
 * real Hyperliquid account this app can read and — once the ordering work
 * lands — trade with.
 */
export type WalletKind = "paper" | "live"

export type TradeWallet = {
  id: string
  label: string
  kind: WalletKind
  protocol: ProtocolId
  network: NetworkId
  /**
   * Paper: the pretend cash it began with. Live: the account's value at the
   * moment it was added here — the baseline "Since it started" measures from.
   */
  startingBalance: number
  /** The account's public address. Null on paper wallets. */
  address: string | null
  /** A trading key is stored (encrypted, server-side only). */
  hasKey: boolean
  /**
   * When the exchange says the stored trading key runs out, epoch ms — asked
   * at save time. Null on paper wallets and on approvals with no expiry.
   */
  keyValidUntil: number | null
}

/**
 * One wallet's figures as the panel shows them, or the honest admission that
 * the exchange could not be reached — never zeros pretending to be an answer.
 */
export type WalletAccountSummary =
  | ({
      walletId: string
      state: "ok"
      /** Equity minus the starting baseline: the whole journey, in dollars. */
      sinceStart: number
      /** The journey minus what is still open — the part already banked. */
      settled: number
    } & WalletAccountFigures)
  | { walletId: string; state: "unreachable" }

/**
 * Turns one account read into the five rows. The two derived figures answer
 * to each other on purpose: settled + open profit always equals the whole
 * journey, so the column can be checked by adding it up.
 */
export function summarizeWallet(
  wallet: Pick<TradeWallet, "id" | "startingBalance">,
  figures: WalletAccountFigures
): WalletAccountSummary {
  const sinceStart = figures.equity - wallet.startingBalance
  return {
    walletId: wallet.id,
    state: "ok",
    ...figures,
    sinceStart,
    settled: sinceStart - figures.openProfit,
  }
}

export const WALLET_LABEL_MAX = 40

/** Generosity, not a target — one person's hand-made list, not a fleet. */
export const MAX_WALLETS = 20

/** Paper starting cash must be a real amount someone could reason about. */
export const MAX_STARTING_BALANCE = 100_000_000

/** An EVM account address: 0x and exactly 40 hex characters. */
export function isWalletAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

/**
 * A Hyperliquid agent/API private key: 32 bytes of hex, 0x optional. Only the
 * shape is checkable here in the browser. Whether it really signs for the
 * account — and is a limited helper key rather than the account's own — is
 * proved server-side against the exchange before the key is ever saved.
 */
export function isAgentKey(value: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value)
}

/**
 * A pasted key, with the junk a web-page copy smuggles in struck out: spaces,
 * newlines, and the INVISIBLE characters (zero-width spaces, joiners, BOMs)
 * that make a key look perfect on screen and still fail the shape check.
 * Only ever removes characters that could never be part of a key.
 */
export function cleanAgentKey(value: string): string {
  return value.replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "")
}

/**
 * Why a pasted key does not read as one, in words precise enough to act on —
 * without ever echoing the key itself. Null when the (cleaned) paste is fine.
 */
export function describeAgentKeyProblem(raw: string): string | null {
  const value = cleanAgentKey(raw)
  if (isAgentKey(value)) return null
  if (/^0[xX]0[xX]/.test(value)) {
    return "It starts with 0x twice — delete one of them."
  }
  const bare = value.replace(/^0[xX]/, "")
  if (/^[0-9a-fA-F]{40}$/.test(bare)) {
    return "That is an address (40 characters) — paste the private key (64 characters) instead."
  }
  const bad = bare.match(/[^0-9a-fA-F]/)
  if (bad) {
    return `It contains a character that cannot be part of a key ("${bad[0]}").`
  }
  if (bare.length !== 64) {
    return `It is ${bare.length} characters long after the 0x — a key is exactly 64.`
  }
  return "It does not read as a key."
}

/** How an address is shown: enough of each end to recognise, "0x12ab…89cd". */
export function shortenAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * The venue line under a wallet's name — "Hyperliquid", or "Hyperliquid
 * Testnet" so practice-network money can never read as the real thing.
 * Derived from the id rather than compared against it, so no screen ever
 * holds a protocol name of its own.
 */
export function venueLabel(protocol: ProtocolId, network: NetworkId): string {
  const name = protocol.charAt(0).toUpperCase() + protocol.slice(1)
  return network === "testnet" ? `${name} Testnet` : name
}
