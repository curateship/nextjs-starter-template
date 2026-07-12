import * as React from "react"
import { Loader2Icon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MainnetConfirmField } from "@/components/trading/connect-wallet-flow"
import {
  getAutomation,
  getAutomationErrorMessage,
  listAutomations,
  type AutomationDetail,
  type AutomationListItem,
} from "@/lib/api/automations"
import { createBot, getBotErrorMessage } from "@/lib/api/bots"
import {
  loadStrategyLibrary,
  type StrategyTemplateListItem,
} from "@/lib/api/strategies"
import {
  loadTradingContext,
  type TradingContextResponse,
} from "@/lib/api/trading"
import { useMarketRows } from "@/lib/hl/hooks"
import { strategySummary } from "@/lib/strategies/strategy-config"
import { StrategyTemplatePicker } from "@/components/strategies/strategy-picker"

/** Exchanges the bot can trade on. Only Hyperliquid exists today. */
const EXCHANGES: { id: string; label: string }[] = [
  { id: "hyperliquid", label: "Hyperliquid" },
]

/** Guided bot creation from a saved template or valid Automation snapshot. */
type NewBotDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (botId: string) => void
  /** Opens on this saved Automation when launched from its canvas. */
  initialAutomationId?: string
}

export function NewBotDialog(props: NewBotDialogProps) {
  // A fresh form on each open also reapplies a canvas launch's source cleanly.
  return (
    <NewBotDialogForm
      key={`${props.open ? "open" : "closed"}:${props.initialAutomationId ?? ""}`}
      {...props}
    />
  )
}

function NewBotDialogForm({
  open,
  onOpenChange,
  onCreated,
  initialAutomationId,
}: NewBotDialogProps) {
  const [context, setContext] = React.useState<TradingContextResponse | null>(
    null
  )
  const [strategies, setStrategies] = React.useState<
    StrategyTemplateListItem[] | null
  >(null)
  const [automations, setAutomations] = React.useState<
    AutomationListItem[] | null
  >(null)
  const [source, setSource] = React.useState<"strategy" | "automation">(
    initialAutomationId ? "automation" : "strategy"
  )

  const [name, setName] = React.useState("")
  const [walletId, setWalletId] = React.useState("")
  const [mode, setMode] = React.useState<"paper" | "live">("paper")
  const [strategyId, setStrategyId] = React.useState<string | null>(null)
  const [automationId, setAutomationId] = React.useState<string | null>(
    initialAutomationId ?? null
  )
  const [automationRequest, setAutomationRequest] = React.useState<{
    id: string
    detail: AutomationDetail | null
  } | null>(null)
  const [exchange, setExchange] = React.useState("")
  const [selectedMarkets, setSelectedMarkets] = React.useState<string[]>([])
  const [paperEquity, setPaperEquity] = React.useState("10000")
  const [mainnetConfirm, setMainnetConfirm] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const [ctx, saved, savedAutomations] = await Promise.all([
          loadTradingContext(),
          loadStrategyLibrary(),
          listAutomations(),
        ])
        if (cancelled) return
        setContext(ctx)
        setStrategies(saved.strategies.flatMap((row) => row.templates))
        setAutomations(savedAutomations.automations)
        const selectable = ctx.wallets.filter(
          (wallet) => wallet.status === "active"
        )
        setWalletId(
          (current) =>
            current ||
            (selectable.find((wallet) => wallet.is_active)?.id ??
              selectable[0]?.id ??
              "")
        )
      } catch (err) {
        if (!cancelled) setError(getBotErrorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const network = context?.network ?? "testnet"
  const marketRows = useMarketRows(network)

  // Bots only run signal strategies — DCA is backtest-only for now. Hidden
  // templates are counted so the picker can say why they're missing.
  const botStrategies = React.useMemo(
    () => strategies?.filter((row) => row.config.kind === "signal") ?? null,
    [strategies]
  )
  const hiddenCount = (strategies?.length ?? 0) - (botStrategies?.length ?? 0)
  const validAutomations = React.useMemo(
    () => automations?.filter((row) => row.isValid) ?? null,
    [automations]
  )
  const selectedAutomationId =
    source === "automation"
      ? (automationId ?? validAutomations?.[0]?.id ?? null)
      : null

  React.useEffect(() => {
    if (!open || !selectedAutomationId) return
    let cancelled = false
    void getAutomation(selectedAutomationId)
      .then((detail) => {
        if (!cancelled) {
          setAutomationRequest({ id: selectedAutomationId, detail })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAutomationRequest({ id: selectedAutomationId, detail: null })
          setError(getAutomationErrorMessage(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, selectedAutomationId])

  const automation =
    automationRequest?.id === selectedAutomationId
      ? automationRequest.detail
      : null
  const automationLoading =
    selectedAutomationId !== null &&
    automationRequest?.id !== selectedAutomationId

  const strategy = botStrategies?.find((row) => row.id === strategyId) ?? null
  const config =
    source === "automation"
      ? (automation?.compiledConfig ?? null)
      : (strategy?.config ?? null)
  const sourceChosen = config != null
  const showMarkets = sourceChosen && exchange !== ""

  const availableMarkets = marketRows.filter(
    (row) => !selectedMarkets.includes(row.coin)
  )

  async function submit() {
    setError(null)
    if (!name.trim()) return setError("Give the bot a name.")
    if (!walletId) return setError("Select a wallet.")
    if (source === "strategy" && !strategy) return setError("Pick a template.")
    if (
      source === "automation" &&
      (!selectedAutomationId || !automation?.compiledConfig)
    ) {
      return setError("Pick a valid Automation.")
    }
    if (!exchange) return setError("Select an exchange.")
    if (selectedMarkets.length === 0)
      return setError("Pick at least one market.")
    if (source === "automation" && selectedMarkets.length !== 1) {
      return setError("Automation bots can trade exactly one market.")
    }
    const equity = Number(paperEquity)
    if (mode === "paper" && !(equity > 0)) {
      return setError("Paper equity must be a positive number.")
    }

    setBusy(true)
    try {
      const { botId } = await createBot({
        name: name.trim(),
        walletId,
        markets: selectedMarkets,
        exchange,
        mode,
        params: source === "strategy" ? strategy?.config : undefined,
        strategyId: source === "strategy" ? strategy?.id : undefined,
        automationId:
          source === "automation"
            ? (selectedAutomationId ?? undefined)
            : undefined,
        paperStartingEquity: mode === "paper" ? equity : undefined,
      })
      onOpenChange(false)
      onCreated(botId)
    } catch (err) {
      setError(getBotErrorMessage(err))
      setBusy(false)
    }
  }

  // Pending (unapproved) wallets are never valid bot targets.
  const wallets = (context?.wallets ?? []).filter(
    (wallet) => wallet.status === "active"
  )
  const selectedWallet = wallets.find((wallet) => wallet.id === walletId)
  const isLiveMainnet = mode === "live" && selectedWallet?.network === "mainnet"
  const mainnetConfirmed = !isLiveMainnet || mainnetConfirm.trim() === "MAINNET"

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>New Bot</DialogTitle>
          <DialogDescription>
            Pick a saved template or Automation, then choose where it trades.
            The bot keeps its own copy of that setup.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>General settings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bot-name">Name</Label>
                <Input
                  id="bot-name"
                  value={name}
                  placeholder="QQE 15m basket"
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Wallet</Label>
                  <Select value={walletId} onValueChange={setWalletId}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue
                        placeholder={
                          wallets.length === 0 ? "No wallets" : "Select"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          {wallet.label} ({wallet.network})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Mode</Label>
                  <Select
                    value={mode}
                    onValueChange={(value) =>
                      setMode(value as "paper" | "live")
                    }
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paper">
                        Paper (simulated fills)
                      </SelectItem>
                      <SelectItem value="live">
                        Live (signs real orders)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {mode === "live" && !isLiveMainnet ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                  Live mode signs real orders with this wallet on its network.
                  Paper-test the setup first.
                </div>
              ) : null}

              {isLiveMainnet ? (
                <MainnetConfirmField
                  id="bot-mainnet-confirm"
                  message="This bot will trade real money on mainnet. Type MAINNET to confirm."
                  value={mainnetConfirm}
                  disabled={busy}
                  onChange={setMainnetConfirm}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Source</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Tabs
                value={source}
                onValueChange={(value) => {
                  const next = value as "strategy" | "automation"
                  setSource(next)
                  if (next === "automation") {
                    setSelectedMarkets((current) => current.slice(0, 1))
                  }
                  setError(null)
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="strategy">Template</TabsTrigger>
                  <TabsTrigger value="automation">Automation</TabsTrigger>
                </TabsList>
              </Tabs>

              {source === "strategy" ? (
                <>
                  <StrategyTemplatePicker
                    hideLabel
                    templates={botStrategies}
                    selectedId={strategyId}
                    onSelect={(id) => {
                      setStrategyId(id)
                      setError(null)
                    }}
                  />
                  {hiddenCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {hiddenCount} DCA{" "}
                      {hiddenCount === 1 ? "strategy is" : "strategies are"}{" "}
                      hidden — DCA is handled by the simple Strategies system.
                    </p>
                  ) : null}
                </>
              ) : validAutomations === null ? (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Loading Automations…
                </div>
              ) : validAutomations.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No valid Automations yet. Finish and save one on the
                  Automations page first.
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="bot-automation">Automation</Label>
                  <Select
                    value={selectedAutomationId ?? ""}
                    onValueChange={(id) => {
                      setAutomationId(id)
                      setError(null)
                    }}
                  >
                    <SelectTrigger id="bot-automation" className="h-8 w-full">
                      <SelectValue placeholder="Select Automation" />
                    </SelectTrigger>
                    <SelectContent>
                      {validAutomations.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} · {item.interval} · {item.summary}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {automationLoading ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2Icon className="size-3 animate-spin" />
                      Loading saved Automation…
                    </p>
                  ) : automation?.compiledConfig ? (
                    <p className="text-xs text-muted-foreground">
                      {automation.compiledConfig.rules.length} action{" "}
                      {automation.compiledConfig.rules.length === 1
                        ? "rule"
                        : "rules"}{" "}
                      · {automation.interval}
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {sourceChosen ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {source === "automation" ? "Market" : "Markets"}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Exchange</Label>
                  <Select value={exchange} onValueChange={setExchange}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Select exchange" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXCHANGES.map((ex) => (
                        <SelectItem key={ex.id} value={ex.id}>
                          {ex.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {showMarkets ? (
                  <div className="grid gap-2">
                    <Label>
                      {source === "automation" ? "Market" : "Markets"}{" "}
                      {selectedMarkets.length > 0 ? (
                        <span className="font-normal text-muted-foreground">
                          ({selectedMarkets.length} selected)
                        </span>
                      ) : null}
                    </Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedMarkets.map((coin) => (
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
                              setSelectedMarkets((current) =>
                                current.filter((item) => item !== coin)
                              )
                            }
                          >
                            <XIcon className="size-3" />
                          </button>
                        </Badge>
                      ))}
                      {availableMarkets.length > 0 &&
                      (source === "strategy" ||
                        selectedMarkets.length === 0) ? (
                        <Select
                          value=""
                          onValueChange={(coin) =>
                            setSelectedMarkets((current) =>
                              source === "automation"
                                ? [coin]
                                : current.includes(coin)
                                  ? current
                                  : [...current, coin]
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue
                              placeholder={
                                source === "automation"
                                  ? "Select market"
                                  : "Add market"
                              }
                            />
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
                ) : null}

                {showMarkets && mode === "paper" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="bot-equity">
                      Paper equity
                      {source === "strategy" ? " per market" : ""} (USD)
                    </Label>
                    <Input
                      id="bot-equity"
                      inputMode="decimal"
                      value={paperEquity}
                      className="w-40"
                      onChange={(event) =>
                        setPaperEquity(event.target.value.trim())
                      }
                    />
                  </div>
                ) : null}

                {config && selectedMarkets.length > 0 ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    {selectedMarkets.length} market
                    {selectedMarkets.length === 1 ? "" : "s"} · {config.kind} ·{" "}
                    {config.interval} · {strategySummary(config)}
                  </div>
                ) : null}
              </CardContent>
            </Card>
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
            disabled={busy || !mainnetConfirmed}
            onClick={() => void submit()}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Create {mode} bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
