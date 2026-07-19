import * as React from "react"

import {
  deployBot,
  getBotErrorMessage,
  loadAutomationBot,
  loadBotDetail,
  renameBot,
  type BotDetailResponse,
} from "@/lib/api/bots"
import { loadTradingContext } from "@/lib/api/trading"
import type { WalletItem } from "@/lib/api/wallets"

const POLL_MS = 5000
const DEFAULT_MARKETS = ["BTC"]

type AutomationBotPhase = "setup" | "live"

/**
 * State machine for the editor's Bot mode — the automation running live.
 * Mirrors useAutomationBacktest: instantiated unconditionally so leaving and
 * re-entering the mode resumes, and the run itself lives server-side (the
 * worker keeps trading whether or not the editor is open).
 *
 * Lifecycle mirrors the backtest's save-override: a deploy auto-names the run
 * "Previous run · …" and the next deploy replaces it (flatten + stop + delete).
 * keep(name) makes it a permanent history entry — then the next deploy starts
 * a fresh run alongside it.
 */
export function useAutomationBot(automationId: string) {
  const [open, setOpen] = React.useState(false)
  const [phase, setPhase] = React.useState<AutomationBotPhase>("setup")
  const [selectedMarkets, setSelectedMarkets] =
    React.useState<string[]>(DEFAULT_MARKETS)
  const [walletId, setWalletId] = React.useState("")
  const [mode, setMode] = React.useState<"paper" | "live">("paper")
  const [paperEquity, setPaperEquity] = React.useState("10000")
  const [wallets, setWallets] = React.useState<WalletItem[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [deploying, setDeploying] = React.useState(false)
  const [botId, setBotId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<BotDetailResponse | null>(null)
  /** The market whose chart + trades fill the workspace. */
  const [selectedMarket, setSelectedMarket] = React.useState("")
  /** True once the latest-run lookup settled — gates the setup-form flash. */
  const [hydrated, setHydrated] = React.useState(false)

  // Read botId inside effects without making it a dep (same guard pattern as
  // the backtest hook — hydration must not re-fire off its own setBotId).
  const hydratedRef = React.useRef(false)
  const botIdRef = React.useRef(botId)
  React.useEffect(() => {
    botIdRef.current = botId
  })

  // First open with nothing loaded: pull the automation's CURRENT (unnamed)
  // run so the live dashboard survives leaving the editor (or the browser).
  // Named runs are history — they never rehydrate here.
  React.useEffect(() => {
    if (!open || botIdRef.current || hydratedRef.current) return
    hydratedRef.current = true
    let cancelled = false
    void loadAutomationBot(automationId)
      .then(({ botId: latest }) => {
        if (cancelled) return
        setHydrated(true)
        if (!latest) return
        setBotId(latest)
        setPhase("live")
      })
      .catch(() => {
        // Transient — the setup form still works; a deploy refreshes it.
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
      hydratedRef.current = false
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

  // Live polling — the whole dashboard reads from this one detail response.
  React.useEffect(() => {
    if (!open || !botId) return
    let cancelled = false
    const poll = () => {
      if (document.visibilityState !== "visible") return
      void loadBotDetail(botId)
        .then((response) => {
          if (cancelled) return
          setDetail(response)
          setSelectedMarket((current) =>
            current && response.bot.markets.includes(current)
              ? current
              : (response.bot.markets[0] ?? "")
          )
        })
        .catch((pollError: unknown) => {
          // The run row can vanish under us (deleted from the history page);
          // fall back to the setup form instead of a dead dashboard. Other
          // errors are transient — keep polling; the worker is unaffected.
          if (cancelled) return
          if (getBotErrorMessage(pollError).includes("not found")) {
            setBotId(null)
            setDetail(null)
            setPhase("setup")
          }
        })
    }
    const timer = setInterval(poll, POLL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    poll()
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [open, botId])

  const enter = React.useCallback(() => setOpen(true), [])
  const exit = React.useCallback(() => setOpen(false), [])

  const refresh = React.useCallback(() => {
    const current = botIdRef.current
    if (!current) return
    void loadBotDetail(current)
      .then(setDetail)
      .catch(() => {})
  }, [])

  /** Deploys the run: replaces the previous unnamed run, starts the new one. */
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
      // Keep the previous run's dashboard on screen until the new run's
      // first poll lands — clearing it would flash the bare canvas.
      setBotId(created)
      setSelectedMarket(selectedMarkets[0] ?? "")
      setPhase("live")
    } catch (deployError) {
      setError(getBotErrorMessage(deployError))
    } finally {
      setDeploying(false)
    }
  }, [automationId, deploying, mode, paperEquity, selectedMarkets, walletId])

  /**
   * Names the run — it graduates to the run history (still trading) and the
   * mode returns to the market selector for the next run, mirroring the
   * backtest's "saving a run starts a new one".
   */
  const keep = React.useCallback(async (name: string) => {
    const trimmed = name.trim()
    const current = botIdRef.current
    if (!current || !trimmed) return
    try {
      await renameBot(current, trimmed)
      setBotId(null)
      setDetail(null)
      setError(null)
      setPhase("setup")
    } catch (renameError) {
      setError(getBotErrorMessage(renameError))
    }
  }, [])

  return {
    open,
    phase,
    /** Looking up the automation's latest run — don't flash the setup form. */
    hydrating: !hydrated && botId === null,
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
    botId,
    detail,
    selectedMarket,
    setSelectedMarket,
    enter,
    exit,
    deploy,
    keep,
    refresh,
  }
}

export type AutomationBotState = ReturnType<typeof useAutomationBot>
