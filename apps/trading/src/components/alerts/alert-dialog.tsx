import * as React from "react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createAlert, updateAlert } from "@/lib/api/alerts"
import {
  ALERT_COOLDOWNS,
  ALERT_WINDOWS,
  type AlertCooldown,
  type AlertRuleInput,
  type AlertRuleItem,
  type AlertWindow,
  type PriceLevelOperator,
} from "@/lib/alerts"

type AlertDraft = {
  name: string
  message: string
  coin: string
  kind: "price_level" | "price_move" | "volume_spike"
  operator: PriceLevelOperator
  level: string
  direction: "up" | "down"
  percent: string
  multiplier: string
  window: AlertWindow
  triggerMode: "once" | "repeat"
  cooldown: AlertCooldown
}

export function AlertDialog({
  open,
  alert,
  prefill,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  alert?: AlertRuleItem | null
  prefill?: { coin: string; level: number }
  onOpenChange: (open: boolean) => void
  onSaved: (alert: AlertRuleItem) => void | Promise<void>
}) {
  const [draft, setDraft] = React.useState<AlertDraft>(() =>
    draftFor(alert ?? null, prefill)
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const input = inputFor(draft)
      const saved = alert
        ? await updateAlert(alert.id, input)
        : await createAlert(input)
      await onSaved(saved)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saving the alert failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{alert ? "Edit alert" : "Add alert"}</DialogTitle>
          <DialogDescription>
            {alert
              ? "Update the condition or delivery message."
              : "Create an alert for the current Trade market."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <Card size="sm">
            <CardHeader>
              <CardTitle>Identity and message</CardTitle>
              <CardDescription>
                The message appears in the inbox and browser alert.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              <Field label="Name" htmlFor="alert-name">
                <Input
                  id="alert-name"
                  className="h-8"
                  autoFocus
                  maxLength={100}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Market" htmlFor="alert-market">
                <Input
                  id="alert-market"
                  className="h-8"
                  value={draft.coin}
                  readOnly
                  aria-readonly="true"
                />
              </Field>
              <Field
                label="Message (optional)"
                htmlFor="alert-message"
                className="md:col-span-2"
              >
                <Textarea
                  id="alert-message"
                  maxLength={1_000}
                  value={draft.message}
                  onChange={(event) =>
                    setDraft({ ...draft, message: event.target.value })
                  }
                />
              </Field>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Condition</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              <SelectField
                label="Type"
                value={draft.kind}
                onValueChange={(kind) =>
                  setDraft({ ...draft, kind: kind as AlertDraft["kind"] })
                }
                options={[
                  { value: "price_level", label: "Exact price" },
                  { value: "price_move", label: "Price move" },
                  { value: "volume_spike", label: "Unusual volume" },
                ]}
              />

              {draft.kind === "price_level" ? (
                <>
                  <SelectField
                    label="Operator"
                    value={draft.operator}
                    onValueChange={(operator) =>
                      setDraft({
                        ...draft,
                        operator: operator as PriceLevelOperator,
                      })
                    }
                    options={[
                      { value: "crossing", label: "Crossing" },
                      { value: "crossing_up", label: "Crossing upward" },
                      { value: "crossing_down", label: "Crossing downward" },
                    ]}
                  />
                  <Field label="Price level" htmlFor="alert-level">
                    <Input
                      id="alert-level"
                      className="h-8"
                      type="number"
                      min="0"
                      step="any"
                      value={draft.level}
                      onChange={(event) =>
                        setDraft({ ...draft, level: event.target.value })
                      }
                    />
                  </Field>
                </>
              ) : draft.kind === "price_move" ? (
                <>
                  <SelectField
                    label="Direction"
                    value={draft.direction}
                    onValueChange={(direction) =>
                      setDraft({
                        ...draft,
                        direction: direction as AlertDraft["direction"],
                      })
                    }
                    options={[
                      { value: "up", label: "Up" },
                      { value: "down", label: "Down" },
                    ]}
                  />
                  <Field label="Move percent" htmlFor="alert-percent">
                    <Input
                      id="alert-percent"
                      className="h-8"
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.1"
                      value={draft.percent}
                      onChange={(event) =>
                        setDraft({ ...draft, percent: event.target.value })
                      }
                    />
                  </Field>
                  <WindowField draft={draft} setDraft={setDraft} />
                </>
              ) : (
                <>
                  <Field
                    label="Times normal volume"
                    htmlFor="alert-multiplier"
                  >
                    <Input
                      id="alert-multiplier"
                      className="h-8"
                      type="number"
                      min="1.01"
                      max="100"
                      step="0.1"
                      value={draft.multiplier}
                      onChange={(event) =>
                        setDraft({ ...draft, multiplier: event.target.value })
                      }
                    />
                  </Field>
                  <WindowField draft={draft} setDraft={setDraft} />
                </>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Trigger settings</CardTitle>
              <CardDescription>
                One-time alerts stop after firing. Repeating alerts must reset
                before firing again.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              <SelectField
                label="Trigger"
                value={draft.triggerMode}
                onValueChange={(triggerMode) =>
                  setDraft({
                    ...draft,
                    triggerMode: triggerMode as AlertDraft["triggerMode"],
                  })
                }
                options={[
                  { value: "once", label: "Once" },
                  { value: "repeat", label: "Repeat" },
                ]}
              />
              {draft.triggerMode === "repeat" ? (
                <SelectField
                  label="Cooldown"
                  value={draft.cooldown}
                  onValueChange={(cooldown) =>
                    setDraft({ ...draft, cooldown: cooldown as AlertCooldown })
                  }
                  options={ALERT_COOLDOWNS.map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              ) : null}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`grid gap-2${className ? ` ${className}` : ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function WindowField({
  draft,
  setDraft,
}: {
  draft: AlertDraft
  setDraft: React.Dispatch<React.SetStateAction<AlertDraft>>
}) {
  return (
    <SelectField
      label="Time window"
      value={draft.window}
      onValueChange={(window) =>
        setDraft({ ...draft, window: window as AlertWindow })
      }
      options={ALERT_WINDOWS.map((value) => ({ value, label: value }))}
    />
  )
}

function draftFor(
  alert: AlertRuleItem | null,
  prefill?: { coin: string; level: number }
): AlertDraft {
  if (!alert) {
    return {
      name: `${prefill?.coin ?? "Market"} price alert`,
      message: "",
      coin: prefill?.coin ?? "",
      kind: "price_level",
      operator: "crossing",
      level: String(prefill?.level ?? ""),
      direction: "up",
      percent: "5",
      multiplier: "3",
      window: "15m",
      triggerMode: "once",
      cooldown: "5m",
    }
  }

  return {
    name: alert.name,
    message: alert.message ?? "",
    coin: alert.coin,
    kind: alert.kind,
    operator: alert.kind === "price_level" ? alert.operator : "crossing",
    level: alert.kind === "price_level" ? String(alert.level) : "",
    direction: alert.kind === "price_move" ? alert.direction : "up",
    percent: alert.kind === "price_move" ? String(alert.percent) : "5",
    multiplier:
      alert.kind === "volume_spike" ? String(alert.multiplier) : "3",
    window: alert.kind === "price_level" ? "15m" : alert.window,
    triggerMode: alert.triggerMode,
    cooldown: alert.triggerMode === "repeat" ? alert.cooldown : "5m",
  }
}

function inputFor(draft: AlertDraft): AlertRuleInput {
  const shared = {
    name: draft.name,
    ...(draft.message.trim() ? { message: draft.message } : {}),
    coin: draft.coin,
  }
  const trigger =
    draft.triggerMode === "repeat"
      ? { triggerMode: "repeat" as const, cooldown: draft.cooldown }
      : { triggerMode: "once" as const }
  if (draft.kind === "price_level") {
    return {
      ...shared,
      ...trigger,
      kind: "price_level",
      operator: draft.operator,
      level: Number(draft.level),
    }
  }
  if (draft.kind === "price_move") {
    return {
      ...shared,
      ...trigger,
      kind: "price_move",
      direction: draft.direction,
      percent: Number(draft.percent),
      window: draft.window,
    }
  }
  return {
    ...shared,
    ...trigger,
    kind: "volume_spike",
    multiplier: Number(draft.multiplier),
    window: draft.window,
  }
}
