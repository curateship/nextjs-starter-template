import * as React from "react"

import type { ProtocolId } from "@/lib/protocols/contracts"
import { loadWalletAccounts, pickWallet } from "@/lib/api/wallets"
import { keepGoodSummaries } from "@/lib/trade/wallets"
import type {
  TradeWallet,
  WalletAccountSummary,
} from "@/lib/trade/wallets"

/**
 * The one owner of wallet state. Mounted once in the workspace so the account
 * panel (and, in later tasks, the order form and the activity panel) are all
 * views of the same answer, never three polls disagreeing with each other.
 *
 * Refreshes every 15 seconds while the tab is visible, catches up the moment
 * a hidden tab comes back, and ignores any answer that arrives after a newer
 * request went out. A poll that fails keeps the last good figures on screen
 * and tries again next tick; only a first load with nothing to show yet
 * surfaces an error.
 *
 * Scoped to ONE exchange — the page's. Every dashboard belongs to exactly
 * one, and a Hyperliquid wallet sitting in the Phemex page's account column
 * reads as money that page could trade, which it cannot. Wallets on other
 * exchanges stay untouched server-side; this page simply does not show them.
 */

const REFRESH_MS = 15_000

export type TradeAccount = {
  /** True only before the first answer — never during a background refresh. */
  loading: boolean
  /** The first load failed and there is nothing to show. */
  failed: boolean
  wallets: TradeWallet[]
  summaryOf: (walletId: string) => WalletAccountSummary | null
  /**
   * The wallet being traded with, or null until one is picked. Null is a real
   * answer, never "use the first one": an order goes to whichever wallet this
   * is, so the wallet has to be chosen on purpose rather than landed on.
   */
  activeWallet: TradeWallet | null
  /** Re-reads everything; what every dialog calls after a save. */
  refresh: () => Promise<void>
  /** Makes a wallet the active one — instant on screen, remembered server-side. */
  switchWallet: (walletId: string) => void
}

export function useTradeAccount(protocol: ProtocolId): TradeAccount {
  const [wallets, setWallets] = React.useState<TradeWallet[] | null>(null)
  const [summaries, setSummaries] = React.useState<
    ReadonlyMap<string, WalletAccountSummary>
  >(new Map())
  const [lastWalletId, setLastWalletId] = React.useState<string | null>(null)
  const [chosenWalletId, setChosenWalletId] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  // Only the newest request may write state — an old answer landing after a
  // newer one would put stale figures over fresh ones.
  const requestRef = React.useRef(0)
  // What is on screen and how many empty reads each wallet has had in a row,
  // held in refs so the merge below stays a plain calculation rather than
  // something that counts twice when React runs an updater twice.
  const summariesRef = React.useRef<ReadonlyMap<string, WalletAccountSummary>>(
    new Map()
  )
  const missesRef = React.useRef<ReadonlyMap<string, number>>(new Map())

  const refresh = React.useCallback(async () => {
    const request = ++requestRef.current
    try {
      const answer = await loadWalletAccounts()
      if (requestRef.current !== request) return
      setWallets(answer.wallets.filter((one) => one.protocol === protocol))
      // A wallet the exchange would not answer for keeps the figures it last
      // had, until it has missed enough reads to be worth saying out loud.
      const merged = keepGoodSummaries(
        summariesRef.current,
        answer.summaries,
        missesRef.current
      )
      summariesRef.current = merged.summaries
      missesRef.current = merged.misses
      setSummaries(merged.summaries)
      setLastWalletId(answer.lastWalletId)
      setFailed(false)
    } catch {
      if (requestRef.current !== request) return
      // Nothing on screen yet is the only failure worth announcing; with
      // figures already up, the next tick is the retry.
      setFailed(true)
    }
  }, [protocol])

  React.useEffect(() => {
    // The first read is scheduled rather than called in the effect body, so
    // mounting never sets state mid-render pass — same shape as the poll.
    const firstRead = window.setTimeout(() => void refresh(), 0)
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(firstRead)
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  const switchWallet = React.useCallback((walletId: string) => {
    setChosenWalletId(walletId)
    // Remembered best-effort: a failed save loses the memory, not the switch.
    pickWallet(walletId).catch(() => {})
  }, [])

  const summaryOf = React.useCallback(
    (walletId: string) => summaries.get(walletId) ?? null,
    [summaries]
  )

  const list = wallets ?? []
  // A remembered id that matches nothing — the wallet was deleted, here or in
  // another tab — resolves to null, which puts the "pick one" prompt back up.
  const activeWallet =
    list.find(
      (wallet) =>
        wallet.id === (chosenWalletId ?? lastWalletId) &&
        wallet.status === "active"
    ) ?? null

  return {
    loading: wallets === null && !failed,
    failed: failed && wallets === null,
    wallets: list,
    summaryOf,
    activeWallet,
    refresh,
    switchWallet,
  }
}
