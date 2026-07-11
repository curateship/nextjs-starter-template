import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type PortfolioResponse = {
  walletId: string | null
  equity: { t: number; equity: number }[]
  dailyPnl: { date: string; pnl: number }[]
  markets: { coin: string; pnl: number; fills: number; volume: number }[]
  stats: {
    totalPnl: number
    fees: number
    wins: number
    losses: number
    fills: number
  }
  funding: { time: number; coin: string; usdc: number; rate: number }[]
}

const portfolioSchema = z.object({
  walletId: z.string().min(1).nullable(),
})

const loadPortfolioFn = createServerFn({ method: "POST" })
  .inputValidator(portfolioSchema)
  .handler(async ({ data }): Promise<PortfolioResponse> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user) throw new Error("Missing Custom Shell session")

    const { asc, eq } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { tradingAccountSnapshots } = await import("@/server/schema")
    const { listUserWallets } = await import("@/server/wallets")
    const { getInfoClient } = await import("@/server/hyperliquid/info")

    const wallets = await listUserWallets(user.id)
    const wallet = data.walletId
      ? (wallets.find((row) => row.id === data.walletId) ?? null)
      : (wallets.find((row) => row.isActive) ?? wallets[0] ?? null)
    if (!wallet) {
      return {
        walletId: null,
        equity: [],
        dailyPnl: [],
        markets: [],
        stats: { totalPnl: 0, fees: 0, wins: 0, losses: 0, fills: 0 },
        funding: [],
      }
    }

    const address = (wallet.vaultAddress ??
      wallet.accountAddress) as `0x${string}`
    const network = wallet.network as "testnet" | "mainnet"
    const info = getInfoClient(network)
    const now = Date.now()

    const [snapshots, fills, funding] = await Promise.all([
      db
        .select({
          capturedAt: tradingAccountSnapshots.capturedAt,
          equity: tradingAccountSnapshots.equity,
        })
        .from(tradingAccountSnapshots)
        .where(eq(tradingAccountSnapshots.walletId, wallet.id))
        .orderBy(asc(tradingAccountSnapshots.capturedAt))
        .limit(2000),
      info
        .userFillsByTime({
          user: address,
          startTime: now - 90 * 86_400_000,
        })
        .catch(() => []),
      info
        .userFunding({ user: address, startTime: now - 30 * 86_400_000 })
        .catch(() => []),
    ])

    const dailyPnlMap = new Map<string, number>()
    const marketMap = new Map<
      string,
      { pnl: number; fills: number; volume: number }
    >()
    let totalPnl = 0
    let fees = 0
    let wins = 0
    let losses = 0

    for (const fill of fills) {
      const closed = Number(fill.closedPnl)
      const fee = Number(fill.fee)
      const realized = closed - fee
      totalPnl += realized
      fees += fee
      if (closed > 0) wins += 1
      else if (closed < 0) losses += 1

      const day = new Date(fill.time).toISOString().slice(0, 10)
      dailyPnlMap.set(day, (dailyPnlMap.get(day) ?? 0) + realized)

      const market = marketMap.get(fill.coin) ?? {
        pnl: 0,
        fills: 0,
        volume: 0,
      }
      market.pnl += realized
      market.fills += 1
      market.volume += Number(fill.px) * Number(fill.sz)
      marketMap.set(fill.coin, market)
    }

    return {
      walletId: wallet.id,
      equity: snapshots.map((row) => ({
        t: row.capturedAt.getTime(),
        equity: Number(row.equity),
      })),
      dailyPnl: [...dailyPnlMap.entries()]
        .map(([date, pnl]) => ({ date, pnl }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      markets: [...marketMap.entries()]
        .map(([coin, value]) => ({ coin, ...value }))
        .sort((a, b) => b.volume - a.volume),
      stats: { totalPnl, fees, wins, losses, fills: fills.length },
      funding: funding.slice(-100).map((entry) => ({
        time: entry.time,
        coin: entry.delta.coin,
        usdc: Number(entry.delta.usdc),
        rate: Number(entry.delta.fundingRate),
      })),
    }
  })

export function loadPortfolio(walletId: string | null = null) {
  return loadPortfolioFn({ data: { walletId } })
}
