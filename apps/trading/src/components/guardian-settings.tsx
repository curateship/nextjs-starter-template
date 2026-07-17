import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  getGuardianErrorMessage,
  loadGuardianStatus,
  rearmGuardian,
  saveGuardianConfig,
  type GuardianStatus,
} from "@/lib/api/guardian"
import { GUARDIAN_TRIP_STREAK, type GuardianAction } from "@/lib/trading/guardian"

const FLATTEN_CONFIRM_WORD = "FLATTEN"

type GuardianForm = {
  enabled: boolean
  dailyLossLimitUsd: string
  dailyLossLimitPct: string
  maxDrawdownPct: string
  action: GuardianAction
}

function formFromStatus(status: GuardianStatus): GuardianForm {
  return {
    enabled: status.enabled,
    dailyLossLimitUsd: status.dailyLossLimitUsd?.toString() ?? "",
    dailyLossLimitPct: status.dailyLossLimitPct?.toString() ?? "",
    maxDrawdownPct: status.maxDrawdownPct?.toString() ?? "",
    action: status.action,
  }
}

/** Blank or non-positive input means "this limit is off". */
function limitFromInput(value: string, max?: number): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return max !== undefined ? Math.min(parsed, max) : parsed
}

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/**
 * Settings → Trading card for the account guardian (automatic kill switch).
 * Self-contained: guardian settings live in their own table (the worker
 * writes the same row), not in the shell settings blob the page passes down.
 */
export function GuardianSettings() {
  const [status, setStatus] = React.useState<GuardianStatus | null>(null)
  const [form, setForm] = React.useState<GuardianForm | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [confirmingFlatten, setConfirmingFlatten] = React.useState(false)
  const [confirmWord, setConfirmWord] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    loadGuardianStatus()
      .then((loaded) => {
        if (cancelled) return
        setStatus(loaded)
        setForm(formFromStatus(loaded))
      })
      .catch((loadError) => {
        if (!cancelled) setError(getGuardianErrorMessage(loadError))
      })
    return () => {
      cancelled = true
    }
  }, [])

  function update(partial: Partial<GuardianForm>) {
    setForm((current) => (current ? { ...current, ...partial } : current))
    setSaved(false)
  }

  function chooseAction(action: GuardianAction) {
    if (action === "flatten_all") {
      // Flatten crosses spreads with market orders — never arm it from a
      // stray dropdown click. The dialog requires typing the word out.
      setConfirmWord("")
      setConfirmingFlatten(true)
      return
    }
    update({ action })
  }

  async function save() {
    if (!form) return
    const config = {
      enabled: form.enabled,
      dailyLossLimitUsd: limitFromInput(form.dailyLossLimitUsd),
      // Percent limits share the server's 100% ceiling so a typo like 150
      // saves as 100 instead of bouncing off validation.
      dailyLossLimitPct: limitFromInput(form.dailyLossLimitPct, 100),
      maxDrawdownPct: limitFromInput(form.maxDrawdownPct, 100),
      action: form.action,
    }
    if (
      config.enabled &&
      config.dailyLossLimitUsd === null &&
      config.dailyLossLimitPct === null &&
      config.maxDrawdownPct === null
    ) {
      setError("Set at least one limit before turning the guardian on.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await saveGuardianConfig(config)
      setStatus(next)
      setForm(formFromStatus(next))
      setSaved(true)
    } catch (saveError) {
      setError(getGuardianErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function rearm() {
    setBusy(true)
    setError(null)
    try {
      const next = await rearmGuardian()
      setStatus(next)
      setForm(formFromStatus(next))
    } catch (rearmError) {
      setError(getGuardianErrorMessage(rearmError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bot guardian (automatic kill switch)</CardTitle>
        <CardDescription>
          Watches your account's total value once a minute. If today's loss or
          the drop from the account's peak stays past a limit for{" "}
          {GUARDIAN_TRIP_STREAK} checks in a row, the guardian pauses (or
          flattens) all bots by itself and sends an alert — the streak rule
          means one bad price blip can't trigger it. After it trips, bots stay
          paused and the guardian stays off until you re-arm it. Manual trades
          count too, because they move the same account value. Leave a limit
          blank to skip it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!form ? (
          error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="guardian-enabled"
                checked={form.enabled}
                disabled={busy}
                onCheckedChange={(checked) =>
                  update({ enabled: checked === true })
                }
              />
              <Label htmlFor="guardian-enabled" className="font-normal">
                Watch my account and stop all bots automatically
              </Label>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="guardian-daily-usd" className="font-normal">
                  Daily loss limit ($)
                </Label>
                <Input
                  id="guardian-daily-usd"
                  type="number"
                  min={0}
                  step={10}
                  placeholder="Off"
                  value={form.dailyLossLimitUsd}
                  disabled={busy}
                  className="w-28"
                  onChange={(event) =>
                    update({ dailyLossLimitUsd: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="guardian-daily-pct" className="font-normal">
                  Daily loss limit (% of day's start)
                </Label>
                <Input
                  id="guardian-daily-pct"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder="Off"
                  value={form.dailyLossLimitPct}
                  disabled={busy}
                  className="w-28"
                  onChange={(event) =>
                    update({ dailyLossLimitPct: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="guardian-drawdown-pct" className="font-normal">
                  Max drop from peak (%)
                </Label>
                <Input
                  id="guardian-drawdown-pct"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder="Off"
                  value={form.maxDrawdownPct}
                  disabled={busy}
                  className="w-28"
                  onChange={(event) =>
                    update({ maxDrawdownPct: event.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="guardian-action" className="font-normal">
                When a limit is hit
              </Label>
              <Select
                value={form.action}
                disabled={busy}
                onValueChange={(value) => chooseAction(value as GuardianAction)}
              >
                <SelectTrigger id="guardian-action" className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="pause_all">
                    Pause all bots (positions stay open)
                  </SelectItem>
                  <SelectItem value="flatten_all">
                    Close all bot positions, then pause
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {status?.trippedAt ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                <span>
                  Tripped {timeFormatter.format(new Date(status.trippedAt))}
                  {status.trippedReason ? ` — ${status.trippedReason}` : ""}.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void rearm()}
                >
                  Re-arm guardian
                </Button>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button type="button" disabled={busy} onClick={() => void save()}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save guardian
              </Button>
              {saved ? (
                <span className="text-sm text-muted-foreground">Saved.</span>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
      </CardContent>

      <Dialog
        open={confirmingFlatten}
        onOpenChange={(open) => {
          if (!open) setConfirmingFlatten(false)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Use flatten as the automatic action?</DialogTitle>
            <DialogDescription>
              When the guardian trips, it will close every bot position at the
              going market price — that locks in the loss and pays the spread —
              and then pause all bots. Type {FLATTEN_CONFIRM_WORD} to confirm.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              value={confirmWord}
              placeholder={FLATTEN_CONFIRM_WORD}
              aria-label={`Type ${FLATTEN_CONFIRM_WORD} to confirm`}
              onChange={(event) => setConfirmWord(event.target.value)}
            />
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingFlatten(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={confirmWord.trim() !== FLATTEN_CONFIRM_WORD}
                onClick={() => {
                  update({ action: "flatten_all" })
                  setConfirmingFlatten(false)
                }}
              >
                Use flatten
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
