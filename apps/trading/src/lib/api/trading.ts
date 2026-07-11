import { createServerFn } from "@tanstack/react-start"

import type { PaperWalletItem } from "@/lib/api/paper"
import type { TradingNetwork } from "@/lib/hl/network"
import type { WalletItem } from "@/lib/api/wallets"

export type TradingContextResponse = {
  network: TradingNetwork
  mainnetEnabled: boolean
  wallets: WalletItem[]
  paperWallets: PaperWalletItem[]
  workerOnline: boolean
}

const WORKER_ONLINE_WINDOW_MS = 30_000

const loadTradingContextFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<TradingContextResponse> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()
    if (!user) {
      throw new Error("Missing Custom Shell session")
    }

    const { listUserWallets, serializeWalletsWithEquity } = await import(
      "@/server/wallets"
    )
    const { getDefaultNetwork, isMainnetEnabled } = await import(
      "@/server/hyperliquid/transport"
    )
    const { desc } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { tradingWorkerHeartbeats } = await import("@/server/schema")
    const { listPaperWallets } = await import("@/server/paper")
    const { serializePaperWallet } = await import("@/lib/api/paper")

    const [wallets, paperWallets, [heartbeat]] = await Promise.all([
      listUserWallets(user.id),
      listPaperWallets(user.id),
      db
        .select({ lastSeenAt: tradingWorkerHeartbeats.lastSeenAt })
        .from(tradingWorkerHeartbeats)
        .orderBy(desc(tradingWorkerHeartbeats.lastSeenAt))
        .limit(1),
    ])

    return {
      network: getDefaultNetwork(),
      mainnetEnabled: isMainnetEnabled(),
      wallets: await serializeWalletsWithEquity(wallets),
      paperWallets: paperWallets.map(serializePaperWallet),
      workerOnline: heartbeat
        ? Date.now() - heartbeat.lastSeenAt.getTime() < WORKER_ONLINE_WINDOW_MS
        : false,
    }
  }
)

export function loadTradingContext() {
  return loadTradingContextFn()
}
