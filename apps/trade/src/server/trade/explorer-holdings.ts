import { listWalletsWithCredentials } from "./wallets"
import { loadLivePortfolio } from "./live-orders"
import { loadPaperPortfolio } from "./paper"

export async function loadExplorerHoldings(userId: string) {
  const read = await listWalletsWithCredentials(userId)
  const results = await Promise.allSettled([
    loadLivePortfolio(userId, read.wallets, {
      credentials: read.credentials,
      journalOpen: false,
    }),
    loadPaperPortfolio(userId, read.wallets),
  ])
  const failed = new Set<string>()
  const marks: { marketKey: string; wallet: string; size: number | null }[] = []
  const names = new Map(read.wallets.map((wallet) => [wallet.id, wallet.label]))
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      for (const wallet of read.wallets.filter(
        (wallet) => wallet.kind === (index === 0 ? "live" : "paper")
      ))
        failed.add(wallet.id)
      continue
    }
    const portfolio = result.value
    if ("unreachable" in portfolio)
      for (const id of portfolio.unreachable) failed.add(id)
    for (const position of portfolio.positions) {
      if (!failed.has(position.walletId))
        marks.push({
          marketKey: position.marketKey,
          wallet: names.get(position.walletId) ?? "Wallet",
          size: position.szi,
        })
    }
    for (const order of portfolio.orders) {
      if (!failed.has(order.walletId))
        marks.push({
          marketKey: order.marketKey,
          wallet: names.get(order.walletId) ?? "Wallet",
          size: null,
        })
    }
  }
  return { marks, failed: failed.size }
}
