import { PlusIcon, Trash2Icon } from "lucide-react"

import { BaseStopFields } from "@/components/trade/base-stop-fields"
import {
  rungFields,
  type DcaSettingsFormState,
  type DcaSettingsInspection,
} from "@/components/trade/dca-settings-form"
import { OptionCard } from "@/components/trade/option-card"
import { parseOrderNumber } from "@/components/trade/order-window-form"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CandleInterval } from "@/lib/protocols/contracts"
import {
  DCA_ANCHOR_HINTS,
  DCA_ANCHOR_LABELS,
  DCA_ANCHORS,
  DCA_TP_MODE_HINTS,
  DCA_TP_MODE_LABELS,
  DCA_TP_MODES,
  type DcaAnchor,
  type DcaTpMode,
} from "@/lib/trade/dca"
import { formatUsd } from "@/lib/trade/format"

function PercentField({
  id,
  value,
  disabled,
  invalid,
  onChange,
  onBlur,
}: {
  id: string
  value: string
  disabled: boolean
  invalid: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="min-w-0 flex-1 bg-background"
      />
      <span className="shrink-0 text-xs text-muted-foreground">%</span>
    </div>
  )
}

export function DcaSettingsFields({
  idPrefix,
  form,
  full,
  interval,
  busy,
  showValidation,
  inspection,
  suggestedSlPct,
  plannedRungs = [],
  volumeCapped = false,
  takeProfitFixed = false,
  stopLossFixed = false,
  onChange,
  onBlur,
}: {
  idPrefix: string
  form: DcaSettingsFormState
  full: boolean
  interval: CandleInterval
  busy: boolean
  showValidation: boolean
  inspection: DcaSettingsInspection
  suggestedSlPct: number
  plannedRungs?: readonly { dollars: number }[]
  volumeCapped?: boolean
  takeProfitFixed?: boolean
  stopLossFixed?: boolean
  onChange: (next: DcaSettingsFormState) => void
  onBlur: () => void
}) {
  const id = (name: string) => `${idPrefix}-${name}`
  const change = <Key extends keyof DcaSettingsFormState>(
    key: Key,
    value: DcaSettingsFormState[Key]
  ) => onChange({ ...form, [key]: value })
  const setRung = (rungId: string, value: string) =>
    change(
      "rungs",
      form.rungs.map((rung) => (rung.id === rungId ? { ...rung, value } : rung))
    )
  const removeRung = (rungId: string) =>
    change(
      "rungs",
      form.rungs.filter((rung) => rung.id !== rungId)
    )
  const addRung = () => {
    const last = parseOrderNumber(form.rungs.at(-1)?.value ?? "")
    const next = last !== null && last > 0 ? Math.min(99, last + 3) : 5
    change("rungs", [...form.rungs, ...rungFields([next])])
  }

  return (
    <>
      {full ? (
        <OptionCard
          id={id("ladder")}
          title="Ladder"
          hint="Each step is measured below the buy above it, so the drops compound. Change the boxes here or drag the ladder on the chart."
        >
          {form.rungs.map((rung, index) => (
            <div key={rung.id} className="flex items-center gap-2">
              <span className="w-4 text-right text-xs text-muted-foreground">
                {index + 1}
              </span>
              <div className="flex w-24 items-center gap-2">
                <Input
                  id={id(`rung-${index + 1}`)}
                  inputMode="decimal"
                  value={rung.value}
                  disabled={busy}
                  aria-label={`Rung ${index + 1}, percent below the buy above`}
                  aria-invalid={
                    showValidation && inspection.invalid.rungs[index]
                  }
                  onChange={(event) => setRung(rung.id, event.target.value)}
                  onBlur={onBlur}
                  className="min-w-0 bg-background"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
                {plannedRungs[index]
                  ? formatUsd(plannedRungs[index].dollars)
                  : "—"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy || form.rungs.length <= 1}
                aria-label={`Remove rung ${index + 1}`}
                onClick={() => removeRung(rung.id)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={busy || form.rungs.length >= 20}
            onClick={addRung}
          >
            <PlusIcon className="size-4" />
            Add rung
          </Button>
        </OptionCard>
      ) : null}

      {full ? (
        <OptionCard
          id={id("position")}
          title="Position"
          hint="How much of the account this ladder may put to work, and how that money is spread across the buys."
        >
          <div className="grid gap-4">
            <div className="grid gap-2">
              <FieldLabel
                htmlFor={id("pot")}
                hint="The most of the account the whole ladder can spend, split across the buys by the size ramp."
              >
                Max position
              </FieldLabel>
              <PercentField
                id={id("pot")}
                value={form.maxPositionPct}
                disabled={busy}
                invalid={showValidation && inspection.invalid.maxPositionPct}
                onChange={(value) => change("maxPositionPct", value)}
                onBlur={onBlur}
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor={id("ramp")}
                hint="How much bigger each buy is than the one above it. 1 makes every buy equal, and 2 doubles each buy."
              >
                Size ramp ×
              </FieldLabel>
              <Input
                id={id("ramp")}
                inputMode="decimal"
                value={form.sizeMultiplier}
                disabled={busy}
                aria-invalid={
                  showValidation && inspection.invalid.sizeMultiplier
                }
                onChange={(event) =>
                  change("sizeMultiplier", event.target.value)
                }
                onBlur={onBlur}
                className="bg-background"
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor={id("leverage")}
                hint="How many dollars of coin each dollar of the account buys. 1 uses no borrowing. A higher choice lets the exchange close the position sooner if it falls."
              >
                Borrowing ×
              </FieldLabel>
              <Input
                id={id("leverage")}
                inputMode="numeric"
                value={form.leverage}
                disabled={busy}
                aria-invalid={showValidation && inspection.invalid.leverage}
                onChange={(event) => change("leverage", event.target.value)}
                onBlur={onBlur}
                className="bg-background"
              />
            </div>
          </div>
        </OptionCard>
      ) : null}

      <OptionCard
        id={id("tp-on")}
        title="Take profit"
        hint={DCA_TP_MODE_HINTS[form.tpMode]}
        foldWhenOff={false}
        toggle={{
          checked: form.tpOn,
          disabled: busy,
          onChange: (value) => change("tpOn", value),
        }}
      >
        {takeProfitFixed ? (
          <p className="text-xs text-muted-foreground">
            The target was moved by hand and sits where it was put. Saving puts
            it back under a rule.
          </p>
        ) : null}
        {form.tpOn ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <FieldLabel htmlFor={id("tp-mode")}>Exit</FieldLabel>
              <Select
                value={form.tpMode}
                disabled={busy}
                onValueChange={(value) => change("tpMode", value as DcaTpMode)}
              >
                <SelectTrigger id={id("tp-mode")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent data-order-frame-control>
                  {DCA_TP_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {DCA_TP_MODE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.tpMode === "average" ? (
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor={id("tp-pct")}
                  hint="How far above the average buy the ladder takes profit."
                >
                  Target
                </FieldLabel>
                <PercentField
                  id={id("tp-pct")}
                  value={form.tpPct}
                  disabled={busy}
                  invalid={showValidation && inspection.invalid.takeProfit}
                  onChange={(value) => change("tpPct", value)}
                  onBlur={onBlur}
                />
              </div>
            ) : form.tpMode === "exitLadder" ? (
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor={id("exit-gap")}
                  hint="Extra room above the mirrored exit prices. Dragging an exit line changes the same number."
                >
                  Extra gap
                </FieldLabel>
                <PercentField
                  id={id("exit-gap")}
                  value={form.exitGapPct}
                  disabled={busy}
                  invalid={showValidation && inspection.invalid.exitGap}
                  onChange={(value) => change("exitGapPct", value)}
                  onBlur={onBlur}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </OptionCard>

      <OptionCard
        id={id("sl-on")}
        title="Stop loss"
        hint="Percent below the average buy. If the stop hits, everything sells and the waiting rungs are cancelled. A confirmed-base stop can step the ladder down first."
        foldWhenOff={false}
        toggle={{
          checked: form.slOn,
          disabled: busy,
          onChange: (value) =>
            onChange({
              ...form,
              slOn: value,
              ...(value ? { slPct: String(suggestedSlPct) } : {}),
            }),
        }}
      >
        {stopLossFixed ? (
          <p className="text-xs text-muted-foreground">
            The stop was moved by hand and sits where it was put. Saving puts it
            back under a rule.
          </p>
        ) : null}
        {form.slOn ? (
          <>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor={id("sl-pct")}
                hint="Where the stop rests until a base takes over. 100 means price would have to reach zero, which leaves the base as the practical stop."
              >
                Stop
              </FieldLabel>
              <PercentField
                id={id("sl-pct")}
                value={form.slPct}
                disabled={busy}
                invalid={showValidation && inspection.invalid.stopLoss}
                onChange={(value) => change("slPct", value)}
                onBlur={onBlur}
              />
            </div>
            <BaseStopFields
              on={form.baseOn}
              underPct={form.baseUnderPct}
              reclaimDays={form.baseReclaimDays}
              disabled={busy}
              showErrors={showValidation}
              onOn={(value) => change("baseOn", value)}
              onUnderPct={(value) => change("baseUnderPct", value)}
              onReclaimDays={(value) => change("baseReclaimDays", value)}
              onBlur={onBlur}
            />
          </>
        ) : null}
      </OptionCard>

      {full ? (
        <OptionCard
          id={id("advanced")}
          title="Advanced settings"
          defaultOpen={false}
          footer={
            volumeCapped ? (
              <p className="text-xs text-muted-foreground">
                The liquidity limit is shrinking some buys. The rung amounts
                above include the limit.
              </p>
            ) : null
          }
        >
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={id("anchor")}
              hint={DCA_ANCHOR_HINTS[form.anchor]}
            >
              Rungs measured from
            </FieldLabel>
            <Select
              value={form.anchor}
              disabled={busy}
              onValueChange={(value) => change("anchor", value as DcaAnchor)}
            >
              <SelectTrigger id={id("anchor")} className="w-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent data-order-frame-control>
                {DCA_ANCHORS.map((anchor) => (
                  <SelectItem key={anchor} value={anchor}>
                    {DCA_ANCHOR_LABELS[anchor]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={id("vol-guard")}
              hint="No single buy can exceed this share of the coin's last 24 hours of trading volume. Thin coins get smaller orders. 0 turns the limit off."
            >
              Max order, % of day's volume
            </FieldLabel>
            <PercentField
              id={id("vol-guard")}
              value={form.maxOrderVolPct}
              disabled={busy}
              invalid={showValidation && inspection.invalid.maxOrderVolPct}
              onChange={(value) => change("maxOrderVolPct", value)}
              onBlur={onBlur}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={id("two-green")}
              checked={form.twoGreen}
              disabled={busy}
              onCheckedChange={(value) => change("twoGreen", value === true)}
            />
            <FieldLabel
              htmlFor={id("two-green")}
              hint={`Nothing rests on the exchange. The ladder watches the ${interval} candles and buys once two green closes confirm the turn, so a fill can sit away from its line.`}
            >
              Only buy after 2 green {interval} candles
            </FieldLabel>
          </div>
        </OptionCard>
      ) : null}
    </>
  )
}
