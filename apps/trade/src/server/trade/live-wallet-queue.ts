import type { TradeWallet } from "@/lib/trade/wallets"
import { withWalletPlanWrite } from "@/server/trade/db"

/** Runs one live wallet's writes in order across the website and worker. */
export async function serializeLiveWallet<T>(
  userId: string,
  wallet: TradeWallet,
  work: () => Promise<T>
): Promise<T> {
  return await withWalletPlanWrite(userId, wallet.id, work)
}
