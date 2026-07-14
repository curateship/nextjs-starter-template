import { createServerFn } from "@tanstack/react-start"

/** A single realizing fill (a fill that closed part of a position for a P&L). */
export type PnlTrade = {
  /** Fill timestamp, ms since epoch. */
  time: number
  coin: string
  /** Hyperliquid direction label, e.g. "Close Long". */
  dir: string
  /** Order side: "B" = buy/bid, "A" = sell/ask. */
  side: "B" | "A"
  /** Fill size (base units). */
  sz: number
  /** Net realized P&L for this fill: closedPnl − fee. */
  pnl: number
  /** Gross realized P&L (closedPnl) before fees, used to classify win/loss. */
  gross: number
}

/** One wallet's realizing fills plus the context needed to score it. */
export type PnlWallet = {
  id: string
  label: string
  network: "testnet" | "mainnet"
  /** Current account equity, used to express P&L as a % return. 0 if unknown. */
  accountValue: number
  /** Distinct coins across the window, for the symbol filter. */
  symbols: string[]
  /** Realizing fills over the trailing window (~365 days). */
  trades: PnlTrade[]
}

export type PnlOverviewResponse = {
  /** Every wallet the user owns, each with its own realizing fills. */
  wallets: PnlWallet[]
}

// Trailing window for the calendar. Note: userFillsByTime returns at most ~2000
// fills for the range, so a very high-frequency account may see older days
// truncated (incomplete). Revisit with time-paged fetching if that becomes real.
const CALENDAR_WINDOW_MS = 365 * 86_400_000

const loadPnlOverviewFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PnlOverviewResponse> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user) throw new Error("Missing Custom Shell session")

    const { listUserWallets } = await import("@/server/wallets")
    const { getInfoClient } = await import("@/server/hyperliquid/info")

    const wallets = await listUserWallets(user.id)
    const startTime = Date.now() - CALENDAR_WINDOW_MS

    // Fetch every wallet's fills and equity in parallel; a failed wallet falls
    // back to empty rather than sinking the whole page.
    const rows = await Promise.all(
      wallets.map(async (wallet): Promise<PnlWallet> => {
        const address = (wallet.vaultAddress ??
          wallet.accountAddress) as `0x${string}`
        const network = wallet.network as "testnet" | "mainnet"
        const info = getInfoClient(network)

        const [fills, clearinghouse] = await Promise.all([
          info.userFillsByTime({ user: address, startTime }).catch(() => []),
          info.clearinghouseState({ user: address }).catch(() => null),
        ])

        const accountValueRaw = Number(
          clearinghouse?.marginSummary?.accountValue ?? 0
        )
        const accountValue = Number.isFinite(accountValueRaw)
          ? accountValueRaw
          : 0

        const symbols = new Set<string>()
        const trades: PnlTrade[] = []
        for (const fill of fills) {
          const gross = Number(fill.closedPnl)
          // Only fills that realized a P&L are meaningful "trades" here.
          if (!gross) continue
          const fee = Number(fill.fee)
          trades.push({
            time: fill.time,
            coin: fill.coin,
            dir: fill.dir,
            side: fill.side,
            sz: Number(fill.sz),
            pnl: gross - fee,
            gross,
          })
          symbols.add(fill.coin)
        }

        return {
          id: wallet.id,
          label: wallet.label,
          network,
          accountValue,
          symbols: [...symbols].sort(),
          trades,
        }
      })
    )

    return { wallets: rows }
  }
)

export function loadPnlOverview() {
  return loadPnlOverviewFn()
}
