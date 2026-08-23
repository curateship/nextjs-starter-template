import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ColorSwatch } from "@/components/ui/color-swatch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { focusRingInset } from "@/lib/layout/focus-ring"
import type {
  IndicatorContext,
  IndicatorField,
  IndicatorGroup,
  IndicatorModule,
  IndicatorParams,
} from "@/lib/trade/indicators/contract"
import type { IndicatorState } from "@/lib/trade/indicators/registry"
import { cn } from "@/lib/utils"

/**
 * One indicator's switch and its settings, drawn from the field list.
 *
 * **Its own file because two places draw it now**, and they must not drift: the
 * Indicators menu on the chart, and the Signals step's panel on the automation
 * canvas. The step stores its own copy of the settings — that is deliberate,
 * see the Signals step — but a copy of the *form* would be the drift this file
 * exists to prevent. An indicator that gains a setting gains it in both places
 * or in neither.
 *
 * It knows how to draw a number, a switch, a clock time, a pick-one list and a
 * sentence, and nothing about what any indicator means.
 */

/**
 * The settings on one card, in the order the card lists them.
 *
 * A card naming a setting that does not exist draws nothing rather than
 * throwing, which cannot happen anyway: a test insists the cards and the
 * settings name each other exactly.
 */
function fieldsOn(
  module: IndicatorModule,
  group: IndicatorGroup
): IndicatorField[] {
  return group.keys.flatMap((key) => {
    const field = module.fields.find((one) => one.key === key)
    return field ? [field] : []
  })
}

/** The settings body shared by every indicator window. */
export function IndicatorSettingsCards({
  module,
  params,
  context,
  idPrefix,
  onSet,
}: {
  module: IndicatorModule
  params: IndicatorParams
  context: IndicatorContext
  idPrefix: string
  onSet: (key: string, value: number | boolean | string) => void
}) {
  const note = module.note?.(params, context) ?? null

  return (
    <>
      {module.groups.map((group) => (
        <SettingsCard
          key={group.title}
          title={group.title}
          open
          foldable={false}
          onOpenChange={() => {}}
          fields={fieldsOn(module, group)}
          idPrefix={idPrefix}
          params={params}
          onSet={onSet}
        />
      ))}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </>
  )
}

/** One indicator: its switch, its name, and its settings folded behind it. */
export function IndicatorRow({
  module,
  state,
  context,
  idPrefix = "indicator",
  description,
  onOpenChange,
  onCardOpenChange,
  onToggle,
  onSet,
  onReset,
}: {
  module: IndicatorModule
  state: IndicatorState
  /**
   * What the chart these settings belong to is set to — its clock and its
   * timeframe. An indicator's own sentence about its settings can depend on
   * both: a fifteen-minute opening range means nothing on four-hour candles,
   * and a session start means nothing without a timezone.
   */
  context: IndicatorContext
  /**
   * What the field ids are built from. Two of these on one screen — a chart
   * behind an open panel — would otherwise give two controls the same id, and
   * clicking a label would move focus into the wrong one.
   */
  idPrefix?: string
  /**
   * What to say under the name instead of the indicator's own sentence.
   *
   * The library describes what an indicator *draws*, which is the right
   * sentence on a chart and the wrong one on a step that trades it. Unset keeps
   * the library's own words.
   */
  description?: React.ReactNode
  onOpenChange: (open: boolean) => void
  onCardOpenChange: (title: string, open: boolean) => void
  onToggle: (on: boolean) => void
  onSet: (key: string, value: number | boolean | string) => void
  onReset: () => void
}) {
  const params = state.params
  const note = module.note?.(params, context) ?? null

  return (
    <Collapsible
      open={state.open}
      onOpenChange={onOpenChange}
      className="grid gap-2"
    >
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-${module.kind}`}
          checked={state.on}
          onCheckedChange={(next) => onToggle(next === true)}
        />
        {/* The name opens the settings rather than switching the indicator on:
            the box beside it already does that, and one thing doing two jobs
            is how somebody ends up with an indicator they only wanted to
            look at the settings of. */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "group/trigger flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-md py-0.5 text-left text-sm leading-none font-medium select-none",
              focusRingInset
            )}
          >
            <span className="min-w-0 truncate">{module.label}</span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/trigger:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="grid gap-2">
        <p className="text-xs text-muted-foreground">
          {description ?? module.description}
        </p>
        {module.groups.map((group) => (
          <SettingsCard
            key={group.title}
            title={group.title}
            open={!state.shutCards.includes(group.title)}
            onOpenChange={(next) => onCardOpenChange(group.title, next)}
            fields={fieldsOn(module, group)}
            idPrefix={`${idPrefix}-${module.kind}`}
            params={params}
            onSet={onSet}
          />
        ))}
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        {module.fields.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={onReset}
          >
            Back to the defaults
          </Button>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * One card of settings, folded away by its own title.
 *
 * Both cards start open and stay however they were left — the fold rides in
 * the same saved settings as everything else here, so it survives a reload and
 * follows the account. Folding one is for getting it out of the way while you
 * work on the other, not for hiding a setting somebody has to go looking for.
 */
function SettingsCard({
  title,
  open,
  onOpenChange,
  fields,
  idPrefix,
  params,
  onSet,
  foldable = true,
}: {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  fields: IndicatorField[]
  idPrefix: string
  params: IndicatorParams
  onSet: (key: string, value: number | boolean | string) => void
  foldable?: boolean
}) {
  const heading = foldable ? (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className={cn(
          "group/card flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left select-none",
          focusRingInset
        )}
      >
        <CardTitle>{title}</CardTitle>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/card:-rotate-90" />
      </button>
    </CollapsibleTrigger>
  ) : (
    <CardTitle>{title}</CardTitle>
  )

  return (
    // The shared Card, not a hand-drawn grey block: everything that styles a
    // card finds it by `data-slot="card"`, and the EMA window's cards are
    // already this — one window must not hold two kinds of card. The fold
    // sits INSIDE the card as `display: contents`, because wrapping the card
    // in the Collapsible (asChild) let the collapsible's own `data-slot`
    // overwrite the card's, and the element stopped being a card to CSS.
    <Card size="sm">
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        className="contents"
      >
        <CardHeader>{heading}</CardHeader>
        <CollapsibleContent asChild>
          <CardContent className="grid gap-4">
            {fields.map((field) => (
              <Setting
                key={field.key}
                id={`${idPrefix}-${field.key}`}
                field={field}
                value={params[field.key]}
                onSet={(value) => onSet(field.key, value)}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

function Setting({
  id,
  field,
  value,
  onSet,
}: {
  id: string
  field: IndicatorField
  value: number | boolean | string | undefined
  onSet: (value: number | boolean | string) => void
}) {
  if (field.kind === "choice") {
    return (
      <div className="grid gap-2">
        <FieldLabel htmlFor={id} hint={field.hint}>
          {field.label}
        </FieldLabel>
        <Select
          value={typeof value === "string" ? value : field.fallback}
          onValueChange={onSet}
        >
          {/* Full width rather than content-width: these sit in a narrow card,
              where a trigger that resizes itself as the choice changes makes
              the whole card jump. */}
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (field.kind === "time") {
    return (
      <div className="grid gap-2">
        <FieldLabel htmlFor={id} hint={field.hint}>
          {field.label}
        </FieldLabel>
        {/* The browser's own clock box. It only ever hands back a real time or
            an empty string, which is why this one needs none of the
            half-typed-value care the number box below does. */}
        <Input
          id={id}
          type="time"
          value={typeof value === "string" ? value : field.fallback}
          onChange={(event) => {
            if (event.target.value === "") return
            onSet(event.target.value)
          }}
        />
      </div>
    )
  }

  if (field.kind === "switch") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={value === true}
          onCheckedChange={(next) => onSet(next === true)}
        />
        <FieldLabel htmlFor={id} hint={field.hint}>
          {field.label}
        </FieldLabel>
      </div>
    )
  }

  if (field.kind === "color") {
    return (
      <div className="grid gap-2">
        <FieldLabel htmlFor={id} hint={field.hint}>
          {field.label}
        </FieldLabel>
        <ColorSwatch
          id={id}
          value={typeof value === "string" ? value : field.fallback}
          onChange={(event) => onSet(event.target.value)}
        />
      </div>
    )
  }

  return (
    <NumberSetting
      id={id}
      field={field}
      value={typeof value === "number" ? value : field.fallback}
      onSet={onSet}
    />
  )
}

/**
 * A count of candles.
 *
 * The box holds what was typed while it is being typed, and the chart follows
 * along at whatever that means so far — held inside the range the setting
 * offers, because a search over nine thousand candles is a frozen tab rather
 * than a chart. Leaving the box puts back the number actually in force, so a
 * half-typed one never lingers looking like the setting.
 */
function NumberSetting({
  id,
  field,
  value,
  onSet,
}: {
  id: string
  field: Extract<IndicatorField, { kind: "number" }>
  value: number
  onSet: (value: number) => void
}) {
  const [text, setText] = React.useState(String(value))
  // The last value this box itself asked for. A value that comes back equal to
  // it is this box's own change arriving, and the text stays exactly as typed;
  // anything else — Back to the defaults — is somebody else's change, and the
  // text has to follow it.
  const [asked, setAsked] = React.useState(value)
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (value !== asked) setText(String(value))
  }

  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint={field.hint}>
        {field.label}
      </FieldLabel>
      <Input
        id={id}
        inputMode="numeric"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          const typed = Number(event.target.value)
          if (event.target.value.trim() === "" || !Number.isFinite(typed))
            return
          const held = Math.min(
            Math.max(Math.round(typed), field.min),
            field.max
          )
          setAsked(held)
          onSet(held)
        }}
        onBlur={() => setText(String(value))}
      />
    </div>
  )
}
