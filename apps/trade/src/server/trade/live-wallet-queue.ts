import type { TradeWallet } from "@/lib/trade/wallets"

const workByWallet = new Map<string, Promise<unknown>>()

/** Runs one live wallet's writes in order, even when two screens ask at once. */
export async function serializeLiveWallet<T>(
  userId: string,
  wallet: TradeWallet,
  work: () => Promise<T>
): Promise<T> {
  const key = `${userId}:${wallet.id}`
  const previous = workByWallet.get(key) ?? Promise.resolve()
  const started = previous.catch(() => undefined).then(work)
  workByWallet.set(key, started)
  try {
    return await started
  } finally {
    if (workByWallet.get(key) === started) workByWallet.delete(key)
  }
}
