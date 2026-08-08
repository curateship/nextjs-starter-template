import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import type { ChartIndicators } from "@/components/trade/use-indicators"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { focusRingInset } from "@/lib/layout/focus-ring"
import type {
  IndicatorField,
  IndicatorGroup,
  IndicatorModule,
  IndicatorParams,
} from "@/lib/trade/indicators/contract"
import {
  INDICATOR_LIST,
  indicatorsOn,
  type IndicatorState,
} from "@/lib/trade/indicators/registry"
import { cn } from "@/lib/utils"

/**
 * The Indicators dropdown, in the market header beside the timeframe.
 *
 * There is no indicators page and no dashboard behind this. An indicator is a
 * chart control — a way of reading the candles in front of you — so switching
 * one on and setting it up both happen here, in one place, without leaving the
 * chart you are looking at.
 *
 * The menu is built from the library rather than written out: it knows how to
 * draw a number field, a switch and a sentence, and nothing about what any
 * indicator does. Adding one to `registry.ts` puts it in this list with its own
 * settings, and nothing in this file changes.
 */
export function IndicatorsMenu({
  indicators,
}: {
  indicators: ChartIndicators
}) {
  const on = indicatorsOn(indicators.settings)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // The chart's own control strip, not a form: it sits beside the
          // timeframe buttons and matches their height rather than the 32px
          // every field on a page uses. A control a third taller than the row
          // it is in would read as belonging to something else.
          className="h-6 px-2 text-xs"
        >
          Indicators{on ? ` (${on})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-1">
        {INDICATOR_LIST.map((module) => (
          <IndicatorRow
            key={module.kind}
            module={module}
            state={indicators.settings[module.kind]}
            onOpenChange={(next) => indicators.setOpen(module.kind, next)}
            onCardOpenChange={(title, next) =>
              indicators.setCardOpen(module.kind, title, next)
            }
            onToggle={(next) => indicators.toggle(module.kind, next)}
            onSet={(key, value) =>
              indicators.setParam(module.kind, key, value)
            }
            onReset={() => indicators.reset(module.kind)}
          />
        ))}
      </PopoverContent>
    </Popover>
  )
}

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

/** One indicator: its switch, its name, and its settings folded behind it. */
function IndicatorRow({
  module,
  state,
  onOpenChange,
  onCardOpenChange,
  onToggle,
  onSet,
  onReset,
}: {
  module: IndicatorModule
  state: IndicatorState
  onOpenChange: (open: boolean) => void
  onCardOpenChange: (title: string, open: boolean) => void
  onToggle: (on: boolean) => void
  onSet: (key: string, value: number | boolean) => void
  onReset: () => void
}) {
  const params = state.params
  const note = module.note?.(params) ?? null

  return (
    <Collapsible
      open={state.open}
      onOpenChange={onOpenChange}
      className="grid gap-2"
    >
      <div className="flex items-center gap-2">
        <Checkbox
          id={`indicator-${module.kind}`}
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
        <p className="text-xs text-muted-foreground">{module.description}</p>
        {module.groups.map((group) => (
          <SettingsCard
            key={group.title}
            title={group.title}
            open={!state.shutCards.includes(group.title)}
            onOpenChange={(next) => onCardOpenChange(group.title, next)}
            fields={fieldsOn(module, group)}
            kind={module.kind}
            params={params}
            onSet={onSet}
          />
        ))}
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={onReset}
        >
          Back to the defaults
        </Button>
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
 *
 * In the same light grey the DCA window uses for its advanced settings, so a
 * card in a menu and a card in a window read the same.
 */
function SettingsCard({
  title,
  open,
  onOpenChange,
  fields,
  kind,
  params,
  onSet,
}: {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  fields: IndicatorField[]
  kind: string
  params: IndicatorParams
  onSet: (key: string, value: number | boolean) => void
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="grid gap-4 rounded-lg border border-foreground/5 bg-muted/30 p-3"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/card flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left text-sm leading-none font-medium select-none",
            focusRingInset
          )}
        >
          {title}
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/card:-rotate-90" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-4">
        {fields.map((field) => (
          <Setting
            key={field.key}
            kind={kind}
            field={field}
            value={params[field.key]}
            onSet={(value) => onSet(field.key, value)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function Setting({
  kind,
  field,
  value,
  onSet,
}: {
  kind: string
  field: IndicatorField
  value: number | boolean | undefined
  onSet: (value: number | boolean) => void
}) {
  const id = `indicator-${kind}-${field.key}`

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
        // The shared field is see-through, which on a grey card makes a box you
        // type into look like one you cannot.
        className="bg-background"
        onChange={(event) => {
          setText(event.target.value)
          const typed = Number(event.target.value)
          if (event.target.value.trim() === "" || !Number.isFinite(typed)) return
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
