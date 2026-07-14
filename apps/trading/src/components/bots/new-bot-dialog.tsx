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
  loadTradingContext,
  type TradingContextResponse,
} from "@/lib/api/trading"
import { useMarketRows } from "@/lib/hl/hooks"
import { hasMarketActivity } from "@/lib/hl/market-visibility"
import { automationSummary } from "@/lib/strategies/strategy-config"

/** Exchanges the bot can trade on. Only Hyperliquid exists today. */
const EXCHANGES: { id: string; label: string }[] = [
  { id: "hyperliquid", label: "Hyperliquid" },
]

/** Guided bot creation from a valid saved Automation snapshot. */
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
  const [automations, setAutomations] = React.useState<
    AutomationListItem[] | null
  >(null)

  const [name, setName] = React.useState("")
  const [walletId, setWalletId] = React.useState("")
  const [mode, setMode] = React.useState<"paper" | "live">("paper")
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
        const [ctx, savedAutomations] = await Promise.all([
          loadTradingContext(),
          listAutomations(),
        ])
        if (cancelled) return
        setContext(ctx)
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

  // Pending (unapproved) wallets are never valid bot targets.
  const wallets = (context?.wallets ?? []).filter(
    (wallet) => wallet.status === "active"
  )
  const selectedWallet = wallets.find((wallet) => wallet.id === walletId)
  const network = selectedWallet?.network ?? context?.network ?? "testnet"
  const marketRows = useMarketRows(network)

  const validAutomations = React.useMemo(
    () => automations?.filter((row) => row.isValid) ?? null,
    [automations]
  )
  const selectedAutomationId = automationId ?? validAutomations?.[0]?.id ?? null

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

  const config = automation?.compiledConfig ?? null
  const sourceChosen = config != null
  const showMarkets = sourceChosen && exchange !== ""

  const availableMarkets = marketRows.filter(
    (row) =>
      hasMarketActivity(row) && !selectedMarkets.includes(row.coin)
  )

  async function submit() {
    setError(null)
    if (!name.trim()) return setError("Give the bot a name.")
    if (!walletId) return setError("Select a wallet.")
    if (!selectedAutomationId || !automation?.compiledConfig) {
      return setError("Pick a valid Automation.")
    }
    if (!exchange) return setError("Select an exchange.")
    if (selectedMarkets.length !== 1) {
      return setError("Pick exactly one market.")
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
        automationId: selectedAutomationId,
        paperStartingEquity: mode === "paper" ? equity : undefined,
      })
      onOpenChange(false)
      onCreated(botId)
    } catch (err) {
      setError(getBotErrorMessage(err))
      setBusy(false)
    }
  }

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
            Pick a saved Automation, then choose where it trades. The bot keeps
            its own copy of that setup.
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
                  placeholder="Trend confirmation 15m"
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Wallet</Label>
                  <Select
                    value={walletId}
                    onValueChange={(value) => {
                      setWalletId(value)
                      setSelectedMarkets([])
                    }}
                  >
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
              <CardTitle>Automation</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {validAutomations === null ? (
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
                <CardTitle>Market</CardTitle>
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
                    <Label>Market</Label>
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
                      selectedMarkets.length === 0 ? (
                        <Select
                          value=""
                          onValueChange={(coin) => setSelectedMarkets([coin])}
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue placeholder="Select market" />
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
                    <Label htmlFor="bot-equity">Paper equity (USD)</Label>
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
                    {config.interval} · {automationSummary(config)}
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
