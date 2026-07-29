import * as React from "react"

import {
  deployBot,
  getBotErrorMessage,
  loadAutomationBot,
} from "@/lib/api/bots"
import { loadTradingContext } from "@/lib/api/trading"
import type { WalletItem } from "@/lib/api/wallets"

const DEFAULT_MARKETS = ["BTC"]

/**
 * State machine for the editor's Bot mode — setup only. The live run lives
 * on its own page (/bots/$botId): entering the mode when the automation
 * already has a CURRENT (unnamed) run calls onRunFound with its id, and so
 * does a successful deploy — the editor navigates to the run page. The
 * setup form only shows when nothing is deployed yet. Named runs are
 * history (they live on /bots) and never resume here; naming happens on the
 * run page.
 */
export function useAutomationBot(
  automationId: string,
  onRunFound: (botId: string) => void
) {
  const [open, setOpen] = React.useState(false)
  const [selectedMarkets, setSelectedMarkets] =
    React.useState<string[]>(DEFAULT_MARKETS)
  const [walletId, setWalletId] = React.useState("")
  const [mode, setMode] = React.useState<"paper" | "live">("paper")
  const [paperEquity, setPaperEquity] = React.useState("10000")
  const [wallets, setWallets] = React.useState<WalletItem[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [deploying, setDeploying] = React.useState(false)
  /** True once the latest-run lookup settled — gates the setup-form flash. */
  const [hydrated, setHydrated] = React.useState(false)

  const onRunFoundRef = React.useRef(onRunFound)
  React.useEffect(() => {
    onRunFoundRef.current = onRunFound
  })

  // Entering the mode looks up the automation's CURRENT (unnamed) run. If
  // one exists this mode is the wrong place — hand the id up so the editor
  // can leave for the run page instead of flashing the setup form.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setHydrated(false)
    void loadAutomationBot(automationId)
      .then(({ botId }) => {
        if (cancelled) return
        if (botId) {
          onRunFoundRef.current(botId)
          return
        }
        setHydrated(true)
      })
      .catch(() => {
        // Transient — the setup form still works; a deploy refreshes it.
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, automationId])

  // Wallets for the setup form (a live run cannot exist without a wallet).
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void loadTradingContext()
      .then((ctx) => {
        if (cancelled) return
        const selectable = ctx.wallets.filter(
          (wallet) => wallet.status === "active"
        )
        setWallets(selectable)
        setWalletId(
          (current) =>
            current ||
            (selectable.find((wallet) => wallet.is_active)?.id ??
              selectable[0]?.id ??
              "")
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  const enter = React.useCallback(() => setOpen(true), [])
  const exit = React.useCallback(() => setOpen(false), [])

  /**
   * Deploys the run (replacing any previous unnamed one server-side), then
   * hands the new id up — the editor navigates to the run page.
   */
  const deploy = React.useCallback(async () => {
    if (deploying) return
    setError(null)
    if (selectedMarkets.length === 0) {
      setError("Pick at least one market.")
      return
    }
    if (!walletId) {
      setError("Select a wallet.")
      return
    }
    const equity = Number(paperEquity)
    if (mode === "paper" && !(equity > 0)) {
      setError("Paper starting equity must be a positive number.")
      return
    }
    setDeploying(true)
    try {
      const { botId: created } = await deployBot({
        automationId,
        markets: selectedMarkets,
        walletId,
        mode,
        paperStartingEquity: mode === "paper" ? equity : undefined,
      })
      onRunFoundRef.current(created)
    } catch (deployError) {
      setError(getBotErrorMessage(deployError))
    } finally {
      setDeploying(false)
    }
  }, [automationId, deploying, mode, paperEquity, selectedMarkets, walletId])

  return {
    open,
    /** Looking up the automation's latest run — don't flash the setup form. */
    hydrating: !hydrated,
    selectedMarkets,
    setSelectedMarkets,
    walletId,
    setWalletId,
    mode,
    setMode,
    paperEquity,
    setPaperEquity,
    wallets,
    error,
    deploying,
    enter,
    exit,
    deploy,
  }
}

export type AutomationBotState = ReturnType<typeof useAutomationBot>
