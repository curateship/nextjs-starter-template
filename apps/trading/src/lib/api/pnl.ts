import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

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

export type PnlCalendarResponse = {
  walletId: string | null
  /** Current account equity, used to express daily P&L as a % return. 0 if unknown. */
  accountValue: number
  /** Distinct coins across the window, for the symbol filter. */
  symbols: string[]
  /** Realizing fills over the trailing window (~365 days). */
  trades: PnlTrade[]
}

// Trailing window for the calendar. Note: userFillsByTime returns at most ~2000
// fills for the range, so a very high-frequency account may see older days
// truncated (incomplete). Revisit with time-paged fetching if that becomes real.
const CALENDAR_WINDOW_MS = 365 * 86_400_000

const pnlCalendarSchema = z.object({
  walletId: z.string().min(1).nullable(),
})

const loadPnlCalendarFn = createServerFn({ method: "POST" })
  .inputValidator(pnlCalendarSchema)
  .handler(async ({ data }): Promise<PnlCalendarResponse> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user) throw new Error("Missing Custom Shell session")

    const { listUserWallets } = await import("@/server/wallets")
    const { getInfoClient } = await import("@/server/hyperliquid/info")

    const wallets = await listUserWallets(user.id)
    const wallet = data.walletId
      ? (wallets.find((row) => row.id === data.walletId) ?? null)
      : (wallets[0] ?? null)
    if (!wallet) {
      return { walletId: null, accountValue: 0, symbols: [], trades: [] }
    }

    const address = (wallet.vaultAddress ??
      wallet.accountAddress) as `0x${string}`
    const network = wallet.network as "testnet" | "mainnet"
    const info = getInfoClient(network)
    const now = Date.now()

    const [fills, clearinghouse] = await Promise.all([
      info
        .userFillsByTime({ user: address, startTime: now - CALENDAR_WINDOW_MS })
        .catch(() => []),
      info.clearinghouseState({ user: address }).catch(() => null),
    ])

    const accountValueRaw = Number(
      clearinghouse?.marginSummary?.accountValue ?? 0
    )
    const accountValue = Number.isFinite(accountValueRaw) ? accountValueRaw : 0

    const symbols = new Set<string>()
    const trades: PnlTrade[] = []
    for (const fill of fills) {
      const gross = Number(fill.closedPnl)
      // Only fills that realized a P&L are meaningful "trades" for the calendar.
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
      walletId: wallet.id,
      accountValue,
      symbols: [...symbols].sort(),
      trades,
    }
  })

export function loadPnlCalendar(walletId: string | null = null) {
  return loadPnlCalendarFn({ data: { walletId } })
}
