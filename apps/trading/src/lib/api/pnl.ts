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
  /** Gross realized P&L (closedPnl) before fees; fees ride in `fees` entries. */
  gross: number
}

/** One dated cost or credit: a fill's fee, or a funding payment. */
export type PnlCostEntry = {
  /** Timestamp, ms since epoch. */
  time: number
  coin: string
  /**
   * Fees: the amount charged (positive = paid, rebates negative).
   * Funding: signed USDC credited — positive = received, negative = paid.
   */
  amount: number
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
  /** Every fill's fee over the window — opening fills included. */
  fees: PnlCostEntry[]
  /** Stored funding payments over the window (positive = received). */
  funding: PnlCostEntry[]
  /** Earliest stored funding payment, or null if none stored yet. */
  fundingSince: number | null
  /** True when this wallet's funding refresh failed — recent payments may be missing. */
  fundingStale: boolean
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
    const { syncWalletFunding, listWalletFunding } = await import(
      "@/server/funding"
    )

    const wallets = await listUserWallets(user.id)
    const startTime = Date.now() - CALENDAR_WINDOW_MS

    // Refresh stored funding first (throttled). A wallet whose refresh failed
    // is flagged rather than hidden, so the page can say so instead of showing
    // a silently wrong total. A throttled pass returns [] — data is fresh.
    const fundingStatus = await syncWalletFunding(user.id).catch(() =>
      wallets.map((wallet) => ({ walletId: wallet.id, ok: false }))
    )
    const staleWalletIds = new Set(
      fundingStatus.filter((status) => !status.ok).map((s) => s.walletId)
    )
    const fundingByWallet = await listWalletFunding(
      wallets.map((wallet) => wallet.id),
      startTime
    ).catch(() => new Map<string, never[]>())

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
        const fees: PnlCostEntry[] = []
        for (const fill of fills) {
          const fee = Number(fill.fee)
          // Every fill's fee counts — an opening fill has no realized P&L but
          // its fee is just as real, and skipping it understates costs.
          if (fee) {
            fees.push({ time: fill.time, coin: fill.coin, amount: fee })
            symbols.add(fill.coin)
          }
          const gross = Number(fill.closedPnl)
          // Only fills that realized a P&L are meaningful "trades" here.
          if (!gross) continue
          trades.push({
            time: fill.time,
            coin: fill.coin,
            dir: fill.dir,
            side: fill.side,
            sz: Number(fill.sz),
            gross,
          })
          symbols.add(fill.coin)
        }

        const funding = fundingByWallet.get(wallet.id) ?? []
        for (const payment of funding) symbols.add(payment.coin)

        return {
          id: wallet.id,
          label: wallet.label,
          network,
          accountValue,
          symbols: [...symbols].sort(),
          trades,
          fees,
          funding,
          fundingSince: funding.length ? funding[0].time : null,
          fundingStale: staleWalletIds.has(wallet.id),
        }
      })
    )

    return { wallets: rows }
  }
)

export function loadPnlOverview() {
  return loadPnlOverviewFn()
}
