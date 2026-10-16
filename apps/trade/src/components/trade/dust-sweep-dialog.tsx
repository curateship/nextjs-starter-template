import * as React from "react"
import { Loader2Icon } from "lucide-react"

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
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { NumberField } from "@/components/ui/number-field"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  loadDustSweepPreview,
  sweepDustCoinApi,
} from "@/lib/api/trade/dust-sweep"
import { marketSymbol, type MarketRow } from "@/lib/protocols/contracts"
import {
  DEFAULT_LEFTOVER_LIMIT_USD,
  MAX_LEFTOVER_LIMIT_USD,
  type DustSweepPreview,
  type LeftoverRow,
} from "@/lib/trade/dust-sweep"
import { formatUsd } from "@/lib/trade/format"
import { WARNING_SURFACE } from "@/lib/trade/money-tone"
import type { TradeWallet } from "@/lib/trade/wallets"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Outcome =
  | { status: "running" }
  | { status: "swept"; backUsd: number | null }
  | { status: "skipped" | "refused"; reason: string }

type Preview =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DustSweepPreview }

/** An answer, kept with the limit and try it answered. */
type Answer = Exclude<Preview, { status: "loading" }> & { asked: string }

/**
 * Sweep leftovers: the small coin balances in a Solana or BNB Chain wallet,
 * swapped back into its dollar coin. `workspace/docs/wallets/dust-sweeper.md`.
 *
 * The window is the preview and the confirm in one. It lists every leftover
 * with its worth, the fee and what comes back, then sweeps the ones marked to
 * go one at a time, each row saying how it went as soon as it is done.
 */
export function DustSweepDialog({
  wallet,
  markets,
  onClose,
  onSwept,
}: {
  /** Null keeps the window closed. */
  wallet: TradeWallet | null
  markets: ReadonlyMap<string, MarketRow>
  onClose: () => void
  /** After a sweep that sold anything, so the wallet's figures reload. */
  onSwept: () => void
}) {
  // A sweep under way finishes in the window that started it, so its
  // results are seen. The window's own buttons are held the same way.
  const sweeping = React.useRef(false)
  return (
    <Dialog
      open={wallet !== null}
      onOpenChange={(open) => {
        if (!open && !sweeping.current) onClose()
      }}
    >
      {wallet ? (
        <SweepContent
          key={wallet.id}
          wallet={wallet}
          markets={markets}
          onClose={onClose}
          onSwept={onSwept}
          onBusyChange={(busy) => {
            sweeping.current = busy
          }}
        />
      ) : null}
    </Dialog>
  )
}

function SweepContent({
  wallet,
  markets,
  onClose,
  onSwept,
  onBusyChange,
}: {
  wallet: TradeWallet
  markets: ReadonlyMap<string, MarketRow>
  onClose: () => void
  onSwept: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [limitUsd, setLimitUsd] = React.useState(DEFAULT_LEFTOVER_LIMIT_USD)
  const [answer, setAnswer] = React.useState<Answer | null>(null)
  const [outcomes, setOutcomes] = React.useState<ReadonlyMap<string, Outcome>>(
    new Map()
  )
  const [phase, setPhase] = React.useState<"preview" | "sweeping" | "done">(
    "preview"
  )
  const [attempt, setAttempt] = React.useState(0)

  // The limit reloads the preview a moment after the last keystroke, the
  // same wait a setting takes before it saves.
  // An answer for an older limit counts as still loading.
  const asked = `${limitUsd}:${attempt}`
  React.useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      loadDustSweepPreview({ walletId: wallet.id, limitUsd })
        .then((data) => {
          if (current) setAnswer({ status: "ready", data, asked })
        })
        .catch((error: unknown) => {
          if (current)
            setAnswer({
              status: "error",
              message:
                error instanceof Error && error.message
                  ? error.message
                  : "The wallet's leftovers could not be read.",
              asked,
            })
        })
    }, 500)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [wallet.id, limitUsd, asked])
  const preview: Preview =
    answer && answer.asked === asked ? answer : { status: "loading" }

  const data = preview.status === "ready" ? preview.data : null
  const rows = data?.rows ?? []
  const toSweep = rows.filter((row) => row.verdict === "sweep")
  const busy = phase === "sweeping"

  async function sweep() {
    if (!data) {
      showErrorToast("Wait for the preview to finish before sweeping.")
      return
    }
    if (!data.realMoneyOn) {
      showErrorToast(
        "Real-money trading is switched off, so nothing can be swept. Turn it on in Settings first."
      )
      return
    }
    if (toSweep.length === 0) {
      showErrorToast("There is nothing here worth sweeping.")
      return
    }
    setPhase("sweeping")
    onBusyChange(true)
    let sold = false
    // One at a time, in the order shown. Each coin's answer lands on its row
    // before the next coin is asked, and a refusal never stops the rest.
    for (const row of toSweep) {
      setOutcomes((now) => new Map(now).set(row.marketKey, { status: "running" }))
      let outcome: Outcome
      try {
        outcome = await sweepDustCoinApi({
          walletId: wallet.id,
          marketKey: row.marketKey,
          limitUsd,
        })
      } catch (error) {
        outcome = {
          status: "refused",
          reason:
            error instanceof Error && error.message
              ? error.message
              : "The app could not reach the server for this coin.",
        }
      }
      if (outcome.status === "swept") sold = true
      setOutcomes((now) => new Map(now).set(row.marketKey, outcome))
    }
    setPhase("done")
    onBusyChange(false)
    if (sold) onSwept()
  }

  const symbolOf = (key: string) => markets.get(key)?.symbol ?? marketSymbol(key)

  return (
    <DialogContent
      variant="admin"
      className="sm:max-w-2xl"
    >
      <DialogHeader>
        <DialogTitle>Sweep leftovers</DialogTitle>
        <DialogDescription>
          Small balances in {wallet.label} are swapped back into{" "}
          {data?.dollarCoin ?? "the wallet's dollar coin"}, one coin at a time.
          A coin is left alone when the fee is more than half of what it is
          worth.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Card size="sm">
          <CardContent className="grid gap-4">
            <NumberField
              id="dust-sweep-limit"
              label="Leftover limit in dollars"
              hint="A coin worth less than this counts as a leftover."
              value={limitUsd}
              min={1}
              max={MAX_LEFTOVER_LIMIT_USD}
              disabled={phase !== "preview"}
              className="sm:max-w-48"
              onChange={setLimitUsd}
            />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Leftovers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {preview.status === "loading" ? (
              <LoadingRow label="Quoting each leftover" />
            ) : preview.status === "error" ? (
              <ErrorRow
                message={preview.message}
                onRetry={() => setAttempt((n) => n + 1)}
              />
            ) : rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing in this wallet is worth less than{" "}
                {formatUsd(limitUsd)}, so there is nothing to sweep.
              </p>
            ) : (
              <>
                {data && !data.realMoneyOn ? (
                  <p
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-xs",
                      WARNING_SURFACE
                    )}
                  >
                    Real-money trading is switched off, so nothing will be
                    sent. Turn it on in Settings to sweep.
                  </p>
                ) : null}
                <ScrollArea className="max-h-80">
                  <Table containerClassName="overflow-visible">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Coin</TableHead>
                        <TableHead className="text-right">Worth</TableHead>
                        <TableHead className="text-right">Fee</TableHead>
                        <TableHead className="text-right">Back</TableHead>
                        <TableHead>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <LeftoverLine
                          key={row.marketKey}
                          row={row}
                          symbol={symbolOf(row.marketKey)}
                          outcome={outcomes.get(row.marketKey)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
                <SweepSummary
                  rows={rows}
                  outcomes={outcomes}
                  dollarCoin={data?.dollarCoin ?? "USDC"}
                  phase={phase}
                />
              </>
            )}
          </CardContent>
        </Card>
      </DialogBody>
      <DialogFooter>
        {phase === "done" ? (
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void sweep()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {toSweep.length === 0
                ? "Sweep leftovers"
                : toSweep.length === 1
                  ? "Sweep 1 coin"
                  : `Sweep ${toSweep.length} coins`}
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

function money(value: number | null): string {
  if (value === null) return "-"
  if (value > 0 && value < 0.01) return "under $0.01"
  return formatUsd(value)
}

function LeftoverLine({
  row,
  symbol,
  outcome,
}: {
  row: LeftoverRow
  symbol: string
  outcome: Outcome | undefined
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{symbol}</TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {money(row.valueUsd)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {money(row.feeUsd)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {money(row.backUsd)}
      </TableCell>
      <TableCell className="max-w-64 text-xs whitespace-normal">
        <ResultText row={row} outcome={outcome} />
      </TableCell>
    </TableRow>
  )
}

function ResultText({
  row,
  outcome,
}: {
  row: LeftoverRow
  outcome: Outcome | undefined
}) {
  if (!outcome) {
    return row.verdict === "sweep" ? (
      <span>Will swap</span>
    ) : (
      <span className="text-muted-foreground">Skipped. {row.reason}</span>
    )
  }
  if (outcome.status === "running")
    return (
      <span className="flex items-center gap-1.5" role="status">
        <Loader2Icon className="size-3 animate-spin" />
        Swapping
      </span>
    )
  if (outcome.status === "swept")
    return (
      <span>
        Swapped
        {outcome.backUsd !== null
          ? `, ${money(outcome.backUsd)} came back`
          : ". The chain has not reported the fill yet, so check the wallet."}
      </span>
    )
  return (
    <span className="text-destructive">
      {outcome.status === "skipped" ? "Skipped. " : "Refused. "}
      {outcome.reason}
    </span>
  )
}

function SweepSummary({
  rows,
  outcomes,
  dollarCoin,
  phase,
}: {
  rows: readonly LeftoverRow[]
  outcomes: ReadonlyMap<string, Outcome>
  dollarCoin: string
  phase: "preview" | "sweeping" | "done"
}) {
  const toSweep = rows.filter((row) => row.verdict === "sweep")
  const skipped = rows.length - toSweep.length
  const sum = (values: (number | null)[]) =>
    values.reduce<number>((total, one) => total + (one ?? 0), 0)

  if (phase === "preview") {
    const worth = sum(toSweep.map((row) => row.valueUsd))
    const back = sum(toSweep.map((row) => row.backUsd))
    return (
      <p className="text-sm text-muted-foreground">
        {toSweep.length === 0
          ? "Every leftover here costs more than half its worth to swap, or cannot be swapped."
          : `${toSweep.length === 1 ? "1 coin" : `${toSweep.length} coins`} worth ${money(worth)} would bring back about ${money(back)} ${dollarCoin}.`}
        {skipped > 0 ? ` ${skipped} skipped.` : ""}
      </p>
    )
  }

  const swept = toSweep.filter(
    (row) => outcomes.get(row.marketKey)?.status === "swept"
  )
  const quoted = sum(swept.map((row) => row.backUsd))
  const came = swept.map((row) => {
    const outcome = outcomes.get(row.marketKey)
    return outcome?.status === "swept" ? outcome.backUsd : null
  })
  const unread = came.some((one) => one === null)
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {phase === "sweeping"
        ? `Swept ${swept.length} of ${toSweep.length} so far.`
        : `Swept ${swept.length} of ${toSweep.length}. ${money(sum(came))} ${dollarCoin} came back${unread ? " so far" : ""}, against ${money(quoted)} quoted.`}
    </p>
  )
}
