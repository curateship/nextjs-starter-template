import * as React from "react"
import { Loader2Icon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getAutomation,
  listAutomations,
  type AutomationDetail,
  type AutomationListItem,
} from "@/lib/api/automations"
import { runBacktest } from "@/lib/api/backtests"
import {
  loadStrategyLibrary,
  type StrategyTemplateListItem,
} from "@/lib/api/strategies"
import {
  DEFAULT_BACKTEST_COSTS,
  MAX_EXTRA_MARKETS,
  maxWindowDays,
} from "@/lib/backtest/types"
import {
  strategyKindOf,
  strategyTypeLabel,
  strategyTypeOf,
  type StrategyConfig,
  type StrategyTypeId,
} from "@/lib/strategies/strategy-config"
import { StrategyConfigFields } from "@/components/strategies/strategy-config-fields"
import { StrategyTemplatePicker } from "@/components/strategies/strategy-picker"

type MarketRowLike = { coin: string }

/** Prefill for re-running an existing run group with the same strategy. */
export type RunEditTarget = {
  groupId: string
  name: string
  market: string
  extraMarkets: string[]
  windowDays: number
  equity: number
  takerFeeBps: number
  makerFeeBps: number
  slippageBps: number
  config: StrategyConfig
}

/**
 * New Backtest Run: pick a saved template, the markets, and the window.
 */
export function NewRunDialog({
  open,
  onOpenChange,
  markets,
  defaultMarket,
  strategyType,
  initialAutomationId,
  editTarget,
  onLaunched,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  markets: MarketRowLike[]
  defaultMarket: string
  /** Scopes the dialog to one strategy type's templates (a strategy page's New Run). */
  strategyType?: StrategyTypeId
  /** Opens directly on a valid Automation when launched from its canvas. */
  initialAutomationId?: string
  /** Re-run mode: locked strategy config, prefilled run settings. */
  editTarget?: RunEditTarget
  /** Receives the main run's id once the run group is queued. */
  onLaunched: (backtestId: string) => void | Promise<void>
}) {
  const [strategies, setStrategies] = React.useState<
    StrategyTemplateListItem[] | null
  >(null)
  const [strategyId, setStrategyId] = React.useState<string | null>(null)
  const [source, setSource] = React.useState<"strategy" | "automation">(
    initialAutomationId || strategyType === "automation"
      ? "automation"
      : "strategy"
  )
  const [automations, setAutomations] = React.useState<
    AutomationListItem[] | null
  >(null)
  const [automationId, setAutomationId] = React.useState<string | null>(
    initialAutomationId ?? null
  )
  const [automation, setAutomation] = React.useState<AutomationDetail | null>(
    null
  )
  const [automationLoading, setAutomationLoading] = React.useState(false)
  /** Re-run mode: an editable copy of the group's saved config. */
  const [draftConfig, setDraftConfig] = React.useState<StrategyConfig | null>(
    null
  )
  const [name, setName] = React.useState("")
  const [market, setMarket] = React.useState(defaultMarket)
  const [extraMarkets, setExtraMarkets] = React.useState<string[]>([])
  const [windowDays, setWindowDays] = React.useState("30")
  const [equity, setEquity] = React.useState("10000")
  const [taker, setTaker] = React.useState(
    String(DEFAULT_BACKTEST_COSTS.takerFeeBps)
  )
  const [maker, setMaker] = React.useState(
    String(DEFAULT_BACKTEST_COSTS.makerFeeBps)
  )
  const [slippage, setSlippage] = React.useState(
    String(DEFAULT_BACKTEST_COSTS.slippageBps)
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Seed ONLY when the dialog opens (or targets another group). The parent
  // re-renders on every market-price tick, re-creating the editTarget object
  // — keying the effect on it would silently wipe in-progress edits back to
  // the saved config (same pattern as quick-test-dialog's configRef).
  const editTargetRef = React.useRef(editTarget)
  editTargetRef.current = editTarget
  const editGroupId = editTarget?.groupId
  React.useEffect(() => {
    if (!open) return
    const target = editTargetRef.current
    setError(null)
    const initialSource =
      initialAutomationId || strategyType === "automation"
        ? "automation"
        : "strategy"
    setSource(initialSource)
    setAutomationId(initialAutomationId ?? null)
    setAutomation(null)
    setDraftConfig(target?.config ?? null)
    setName(target?.name ?? "")
    setMarket(target?.market ?? defaultMarket)
    setExtraMarkets(target?.extraMarkets ?? [])
    setWindowDays(String(target?.windowDays ?? 30))
    setEquity(String(target?.equity ?? 10_000))
    setTaker(String(target?.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps))
    setMaker(String(target?.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps))
    setSlippage(
      String(target?.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps)
    )
    if (target) return
    let cancelled = false
    void Promise.all([loadStrategyLibrary(), listAutomations()])
      .then(([library, savedAutomations]) => {
        if (!cancelled) {
          setStrategies(library.strategies.flatMap((row) => row.templates))
          setAutomations(savedAutomations.automations)
        }
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load strategies"
        )
      )
    return () => {
      cancelled = true
    }
  }, [open, editGroupId, defaultMarket, initialAutomationId, strategyType])

  // A strategy page's New Run only offers that strategy type's templates.
  const visibleStrategies = React.useMemo(() => {
    if (!strategies) return null
    if (!strategyType) return strategies
    return strategies.filter(
      (row) => strategyTypeOf(row.config) === strategyType
    )
  }, [strategies, strategyType])

  // Scoped dialog: preselect the first matching template so the run is one
  // click away (and never leave a foreign type's template selected).
  React.useEffect(() => {
    if (!open || editTarget || !strategyType || !visibleStrategies) return
    if (
      visibleStrategies.length > 0 &&
      !visibleStrategies.some((row) => row.id === strategyId)
    ) {
      setStrategyId(visibleStrategies[0].id)
    }
  }, [open, editTarget, strategyType, visibleStrategies, strategyId])

  const validAutomations = React.useMemo(
    () => automations?.filter((row) => row.isValid) ?? null,
    [automations]
  )

  React.useEffect(() => {
    if (!open || editTarget || source !== "automation" || !validAutomations) {
      return
    }
    if (
      validAutomations.length > 0 &&
      !validAutomations.some((row) => row.id === automationId)
    ) {
      setAutomationId(validAutomations[0].id)
    }
  }, [open, editTarget, source, validAutomations, automationId])

  React.useEffect(() => {
    if (!open || editTarget || source !== "automation" || !automationId) {
      setAutomation(null)
      setAutomationLoading(false)
      return
    }
    let cancelled = false
    setAutomationLoading(true)
    void getAutomation(automationId)
      .then((detail) => {
        if (!cancelled) setAutomation(detail)
      })
      .catch((err) => {
        if (!cancelled) {
          setAutomation(null)
          setError(
            err instanceof Error ? err.message : "Failed to load Automation"
          )
        }
      })
      .finally(() => {
        if (!cancelled) setAutomationLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, editTarget, source, automationId])

  const strategy = editTarget
    ? null
    : (visibleStrategies?.find((row) => row.id === strategyId) ?? null)
  const config = editTarget
    ? draftConfig
    : source === "automation"
      ? (automation?.compiledConfig ?? null)
      : (strategy?.config ?? null)

  const availableMarkets = markets.filter(
    (row) => row.coin !== market && !extraMarkets.includes(row.coin)
  )

  async function submit() {
    setError(null)
    if (!config) {
      return setError(
        source === "automation"
          ? "Pick a valid Automation."
          : "Pick a template."
      )
    }
    // Re-run edits are free-form — validate through the kind's own schema
    // for a precise message before anything is queued.
    const parsedConfig = strategyKindOf(config).configSchema.safeParse(config)
    if (!parsedConfig.success) {
      return setError(
        parsedConfig.error.issues[0]?.message ??
          "Invalid strategy configuration"
      )
    }
    const nextConfig = parsedConfig.data as StrategyConfig
    const days = Number(windowDays)
    if (!(days >= 1)) return setError("Window must be at least 1 day.")
    const maxDays = maxWindowDays(nextConfig.interval)
    if (days > maxDays) {
      return setError(
        `That window is too long for ${nextConfig.interval} candles — at most ${maxDays} days.`
      )
    }
    const startingEquity = Number(equity)
    if (!(startingEquity > 0)) return setError("Equity must be positive.")

    setBusy(true)
    try {
      const { backtestId } = await runBacktest({
        automationId:
          !editTarget && source === "automation"
            ? (automationId ?? undefined)
            : undefined,
        name: name.trim() || undefined,
        groupId: editTarget?.groupId,
        market,
        extraMarkets,
        interval: nextConfig.interval,
        windowDays: days,
        startingEquity,
        takerFeeBps: Number(taker),
        makerFeeBps: Number(maker),
        slippageBps: Number(slippage),
        params: nextConfig,
      })
      onOpenChange(false)
      await onLaunched(backtestId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            {editTarget ? "Re-run Backtest" : "New Backtest Run"}
          </DialogTitle>
          <DialogDescription>
            {editTarget
              ? "Adjust anything — strategy, markets, window, or costs — and re-run this group. Changing the strategy or window replaces every market's results; only adding markets keeps existing ones."
              : "Pick a saved template or Automation and the markets to replay it on — one result per market."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {/* Every section is its own card with the title contained inside. */}
          <Card size="sm">
            <CardHeader>
              <CardTitle>
                {editTarget ? "Saved configuration" : "Source"}
              </CardTitle>
              {editTarget ? (
                <CardDescription className="text-xs">
                  Starts from this run's saved config — edit freely.
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              {editTarget && draftConfig ? (
                <StrategyConfigFields
                  value={draftConfig}
                  onChange={setDraftConfig}
                />
              ) : (
                <div className="grid gap-3">
                  {!strategyType ? (
                    <Tabs
                      value={source}
                      onValueChange={(value) => {
                        setSource(value as "strategy" | "automation")
                        setError(null)
                      }}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="strategy">Template</TabsTrigger>
                        <TabsTrigger value="automation">Automation</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  ) : null}

                  {source === "automation" ? (
                    validAutomations !== null &&
                    validAutomations.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                        No valid Automations yet. Finish and save one on the
                        Automations canvas first.
                      </div>
                    ) : (
                      <div className="grid gap-1.5">
                        <Label htmlFor="run-automation">Automation</Label>
                        <Select
                          value={automationId ?? ""}
                          onValueChange={(id) => {
                            setAutomationId(id)
                            setError(null)
                          }}
                        >
                          <SelectTrigger id="run-automation">
                            <SelectValue placeholder="Pick an Automation" />
                          </SelectTrigger>
                          <SelectContent>
                            {(validAutomations ?? []).map((row) => (
                              <SelectItem key={row.id} value={row.id}>
                                {row.name} · {row.interval}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {automationLoading ? (
                          <span className="text-xs text-muted-foreground">
                            Loading Automation…
                          </span>
                        ) : null}
                      </div>
                    )
                  ) : strategyType &&
                    visibleStrategies !== null &&
                    visibleStrategies.length === 0 ? (
                    <div className="grid justify-items-center gap-3 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                      <span>
                        No saved template for {strategyTypeLabel(strategyType)}{" "}
                        yet — a template is this strategy plus its parameters
                        and settings.
                      </span>
                      <span>
                        Create one from this strategy's settings on the
                        Strategies page.
                      </span>
                    </div>
                  ) : (
                    <StrategyTemplatePicker
                      hideLabel
                      templates={visibleStrategies}
                      selectedId={strategyId}
                      onSelect={(id) => {
                        setStrategyId(id)
                        setError(null)
                      }}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {config ? (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Markets</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Main market</Label>
                    <Select value={market} onValueChange={setMarket}>
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {markets.map((row) => (
                          <SelectItem key={row.coin} value={row.coin}>
                            {row.coin}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>
                      Extra markets{" "}
                      <span className="font-normal text-muted-foreground">
                        (same strategy replayed on each · max{" "}
                        {MAX_EXTRA_MARKETS})
                      </span>
                    </Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {extraMarkets.map((coin) => (
                        <Badge
                          key={coin}
                          variant="secondary"
                          className="gap-1 font-mono"
                        >
                          {coin}
                          <button
                            type="button"
                            aria-label={`Remove ${coin}`}
                            onClick={() =>
                              setExtraMarkets((current) =>
                                current.filter((c) => c !== coin)
                              )
                            }
                          >
                            <XIcon className="size-3" />
                          </button>
                        </Badge>
                      ))}
                      {availableMarkets.length > 0 &&
                      extraMarkets.length < MAX_EXTRA_MARKETS ? (
                        <Select
                          value=""
                          onValueChange={(coin) =>
                            setExtraMarkets((current) =>
                              current.includes(coin)
                                ? current
                                : [...current, coin]
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue placeholder="Add market" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableMarkets.map((row) => (
                              <SelectItem key={row.coin} value={row.coin}>
                                {row.coin}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>General settings</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="run-name">Name (optional)</Label>
                    <Input
                      id="run-name"
                      value={name}
                      placeholder="Named after the strategy when empty"
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="run-window">
                        Window (days) — timeframe {config.interval}
                      </Label>
                      <Input
                        id="run-window"
                        inputMode="numeric"
                        value={windowDays}
                        onChange={(event) =>
                          setWindowDays(event.target.value.trim())
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="run-equity">
                        Starting equity (USD, per market)
                      </Label>
                      <Input
                        id="run-equity"
                        inputMode="decimal"
                        value={equity}
                        onChange={(event) =>
                          setEquity(event.target.value.trim())
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>
                      Costs{" "}
                      <span className="font-normal text-muted-foreground">
                        (basis points — realistic fees keep results honest)
                      </span>
                    </Label>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="grid gap-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          Taker
                        </span>
                        <Input
                          inputMode="decimal"
                          value={taker}
                          onChange={(event) =>
                            setTaker(event.target.value.trim())
                          }
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          Maker
                        </span>
                        <Input
                          inputMode="decimal"
                          value={maker}
                          onChange={(event) =>
                            setMaker(event.target.value.trim())
                          }
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          Slippage
                        </span>
                        <Input
                          inputMode="decimal"
                          value={slippage}
                          onChange={(event) =>
                            setSlippage(event.target.value.trim())
                          }
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !config}
            onClick={() => void submit()}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {editTarget ? "Re-run" : "Run backtest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
