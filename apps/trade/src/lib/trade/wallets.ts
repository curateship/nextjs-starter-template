import {
  protocolLabel,
  type NetworkId,
  type ProtocolId,
  type WalletAccountFigures,
} from "@/lib/protocols/contracts"
import { runAtFromTimezoneInput } from "@/lib/automations/schedule"

const WALLET_PROFIT_TIMEZONE = "America/Toronto"

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
export type WalletStatus = "active" | "inactive"

export type TradeWallet = {
  id: string
  label: string
  kind: WalletKind
  status: WalletStatus
  protocol: ProtocolId
  network: NetworkId
  /** Paper: its opening cash. Live: its fixed non-compounding sizing baseline. */
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
      /** Settled since yesterday plus what is still open now. */
      madeOrLost: number
      /** Trade money already banked since midnight yesterday in Toronto. */
      settled: number
      /** Recent fills whose profit the venue has not stated. */
      unpricedFills: number
      /**
       * These figures are the last ones that landed, not this second's — the
       * exchange has missed a read or two since. Set by `keepGoodSummaries`
       * on the browser's side, never by the server.
       */
      stale?: boolean
    } & WalletAccountFigures)
  | { walletId: string; state: "unreachable" }
  /**
   * Switched off, so the exchange was never asked. Kept apart from
   * "unreachable" because they look identical on screen and mean opposite
   * things: one is a wallet nobody is using, the other is a wallet that would
   * not answer.
   */
  | { walletId: string; state: "inactive" }

/**
 * How many reads in a row must come back empty before the card says so.
 *
 * Three, at fifteen seconds apart, so a single hiccup is invisible and a real
 * outage is admitted inside a minute.
 */
export const MISSES_BEFORE_UNREACHABLE = 3

/**
 * The figures that stand until a read actually lands.
 *
 * **A read that failed is not "this wallet is worth nothing".** The exchange
 * rations requests and this panel asks for three things per wallet, so a miss
 * is ordinary — and drawn straight, one miss replaced the whole card with
 * "Can't reach it" until the next tick fifteen seconds later put it back. The
 * card flickered all day on an account that was never actually unreachable.
 *
 * So the last good figures stay, marked stale so nothing claims to be fresh,
 * until the misses pile up — then the card says it plainly and stops
 * pretending. This is the same rule `keepUnreachableRows` already applies to
 * positions and orders, which was written after real positions blinked out
 * the same way.
 */
export function keepGoodSummaries(
  was: ReadonlyMap<string, WalletAccountSummary>,
  next: readonly WalletAccountSummary[],
  misses: ReadonlyMap<string, number>
): {
  summaries: Map<string, WalletAccountSummary>
  misses: Map<string, number>
} {
  const summaries = new Map<string, WalletAccountSummary>()
  const nextMisses = new Map<string, number>()

  for (const summary of next) {
    // A wallet that was never asked has not missed anything.
    if (summary.state === "ok" || summary.state === "inactive") {
      summaries.set(summary.walletId, summary)
      continue
    }
    // Counted per wallet: one coin's wallet being unreadable says nothing
    // about the others, and they are read in the same answer.
    const missed = (misses.get(summary.walletId) ?? 0) + 1
    nextMisses.set(summary.walletId, missed)
    const before = was.get(summary.walletId)
    summaries.set(
      summary.walletId,
      before?.state === "ok" && missed < MISSES_BEFORE_UNREACHABLE
        ? { ...before, stale: true }
        : summary
    )
  }

  // Wallets no longer in the answer are gone; their misses go with them.
  return { summaries, misses: nextMisses }
}

/**
 * Turns one account read and its recent settled money into the five rows.
 * Settled plus open profit always equals made or lost.
 */
export function summarizeWallet(
  wallet: Pick<TradeWallet, "id">,
  figures: WalletAccountFigures,
  performance: { settled: number; unpricedFills: number }
): WalletAccountSummary {
  return {
    walletId: wallet.id,
    state: "ok",
    ...figures,
    madeOrLost: performance.settled + figures.openProfit,
    ...performance,
  }
}

/** KuCoin gives a figure when a position closes, not when part is sold. */
export function moneyForWalletFill(fill: {
  protocol: ProtocolId
  side: "buy" | "sell"
  closedPnl: number
  fee: number
}): number | null {
  if (
    fill.protocol === "kucoin" &&
    fill.side === "sell" &&
    fill.closedPnl === 0
  ) {
    return null
  }
  return fill.closedPnl - fill.fee
}

/** Midnight at the start of yesterday in the account owner's timezone. */
export function walletProfitWindowStart(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WALLET_PROFIT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  const localDay = new Date(
    Date.UTC(value("year"), value("month") - 1, value("day"))
  )
  localDay.setUTCDate(localDay.getUTCDate() - 1)
  const input = `${localDay.getUTCFullYear()}-${String(localDay.getUTCMonth() + 1).padStart(2, "0")}-${String(localDay.getUTCDate()).padStart(2, "0")}T00:00`
  const instant = runAtFromTimezoneInput(input, WALLET_PROFIT_TIMEZONE)
  if (!instant) throw new Error("WALLET_PROFIT_WINDOW")
  return new Date(instant).getTime()
}

/**
 * What a flow's spending cap becomes the moment a wallet is picked: what that
 * wallet has free right now.
 *
 * **Because anything larger does nothing.** A ladder sizes itself from the
 * smaller of the cap and the account, so a cap of $3,000 over a wallet holding
 * $1,000 buys exactly what $1,000 would. Carrying a backtest's pot across left
 * a number on screen the flow would never honour, every time a strategy went
 * from tested to traded — which is the one moment it matters most.
 *
 * The fallback stands in when the exchange could not be reached, or when the
 * account is empty. Neither is a cap worth writing, and a cap of zero is not
 * one the box would accept anyway.
 */
export function capForPickedWallet(
  summary: WalletAccountSummary | undefined,
  fallback: number
): number {
  if (!summary || summary.state !== "ok" || !(summary.free > 0)) return fallback
  return summary.free
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
 * Looked up rather than compared against, so no screen ever holds a
 * protocol name of its own.
 */
export function venueLabel(protocol: ProtocolId, network: NetworkId): string {
  const name = protocolLabel(protocol)
  return network === "testnet" ? `${name} Testnet` : name
}

/**
 * The specifics behind "that key is not approved", when the refusal carried
 * them: which address the pasted key signs as, and which the exchange lists.
 *
 * **Why this is worth saying.** Without it the refusal is a wall — a key you
 * cannot read, checked against a list you cannot see, with nothing to compare.
 * With it the mismatch is obvious in one glance, and so is the common case of
 * having generated a key twice and authorised the other one.
 *
 * Everything here is public. An agent's address is not a secret; its key is,
 * and the key never leaves the browser it was typed into.
 */
export function describeKeyMismatch(message: string): string | null {
  const match = /KEY_NOT_APPROVED:(0x[0-9a-f]{40})\|([0-9a-fx,]*)/i.exec(
    message
  )
  if (!match) return null
  const mine = shortAddress(match[1])
  const approved = match[2]
    .split(",")
    .filter((one) => one !== "")
    .map(shortAddress)
  if (approved.length === 0) {
    return `The key you pasted is for ${mine}, and this account has no approved keys at all — nothing has been authorised on this network yet.`
  }
  return `The key you pasted is for ${mine}. Hyperliquid lists ${approved.join(" and ")} as approved, so it is not one of those.`
}

/** `0x1234…5678` — enough to compare two addresses by eye, short enough to read. */
function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
