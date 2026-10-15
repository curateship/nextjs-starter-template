import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { TradeNumberField } from "@/components/recipes/trade-number-field"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CHART_INTERVALS } from "@/lib/trade/chart-interval"
import { LOST_MONEY } from "@/lib/trade/money-tone"
import {
  ADDABLE_CARD_TYPES,
  INTERVAL_LABELS,
  LINE_POSITIONS,
  MAX_RULE_CARDS,
  newRuleCard,
  RULE_CARD_TITLES,
  RULE_LINE_KINDS,
  type EmaReading,
  type LinePosition,
  type RuleCard,
  type RuleLineKind,
  type RuleMatch,
} from "@/lib/trade/trading-rules"

const LINE_KIND_LABELS: Record<RuleLineKind, string> = {
  either: "lines",
  trendline: "trendlines",
  level: "levels",
}

const EMA_READING_LABELS: Record<EmaReading, string> = {
  now: "Price now",
  close: "Last closed candle's close",
  candle: "Whole last closed candle",
}

/**
 * The stacked conditions of one trading rule.
 *
 * The anatomy of the contact segment builder
 * (`src/components/broadcasts/segment-rule-builder.tsx`), copied rather than
 * shared, because that one only knows contact conditions and is a shell file.
 * A heading card holds "Add a condition" and the all-or-any choice; each
 * condition is a card of its own below it, with the bin on the card it
 * removes. No nested groups: a rule nobody can read back is not a rule.
 */
export function TradingRuleBuilder({
  idPrefix,
  cards,
  match,
  onCardsChange,
  onMatchChange,
}: {
  idPrefix: string
  cards: RuleCard[]
  match: RuleMatch
  onCardsChange: (cards: RuleCard[]) => void
  onMatchChange: (match: RuleMatch) => void
}) {
  const full = cards.length >= MAX_RULE_CARDS
  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
          <CardDescription>
            What must be true before you trade. When it is not, the rule warns
            or blocks.
          </CardDescription>
          <CardAction>
            <DisabledReason
              disabled={full}
              reason={`A rule can hold up to ${MAX_RULE_CARDS} conditions.`}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" disabled={full}>
                    <PlusIcon className="size-4" />
                    Add a condition
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  {ADDABLE_CARD_TYPES.map((type) => (
                    <DropdownMenuItem
                      key={type}
                      onSelect={() => onCardsChange([...cards, newRuleCard(type)])}
                    >
                      {RULE_CARD_TITLES[type]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </DisabledReason>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={`${idPrefix}-match`}
              hint="Choose whether every condition must be true, or one is enough."
            >
              Fine to trade when
            </FieldLabel>
            <Select
              value={match}
              onValueChange={(value) => onMatchChange(value as RuleMatch)}
            >
              <SelectTrigger id={`${idPrefix}-match`} className="w-full sm:w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All of these are true</SelectItem>
                <SelectItem value="any">Any of these is true</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {cards.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              No conditions yet, so this rule never warns or blocks anything.
            </span>
          ) : null}
        </CardContent>
      </Card>

      {cards.map((card, index) => (
        <ConditionCard
          key={index}
          id={`${idPrefix}-${index}`}
          index={index}
          card={card}
          onChange={(next) =>
            onCardsChange(cards.map((current, at) => (at === index ? next : current)))
          }
          onRemove={() => onCardsChange(cards.filter((_, at) => at !== index))}
        />
      ))}
    </>
  )
}

function ConditionCard({
  id,
  index,
  card,
  onChange,
  onRemove,
}: {
  id: string
  index: number
  card: RuleCard
  onChange: (card: RuleCard) => void
  onRemove: () => void
}) {
  const title = RULE_CARD_TITLES[card.type]
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onRemove}
                aria-label={`Remove condition ${index + 1}, ${title.toLowerCase()}`}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove this condition</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <ConditionFields id={id} index={index} card={card} onChange={onChange} />
      </CardContent>
    </Card>
  )
}

function ConditionFields({
  id,
  index,
  card,
  onChange,
}: {
  id: string
  index: number
  card: RuleCard
  onChange: (card: RuleCard) => void
}) {
  const number = index + 1
  switch (card.type) {
    case "ema":
      return (
        <>
          <Choice
            id={`${id}-reading`}
            label={`What condition ${number} reads`}
            value={card.reading}
            options={Object.keys(EMA_READING_LABELS) as EmaReading[]}
            labels={EMA_READING_LABELS}
            onChange={(reading) => onChange({ ...card, reading })}
          />
          <Words>is</Words>
          <Choice
            id={`${id}-position`}
            label={`Above or under, condition ${number}`}
            value={card.position}
            options={["under", "above"] as const}
            labels={{ under: "under", above: "above" }}
            onChange={(position) => onChange({ ...card, position })}
          />
          <Words>EMA</Words>
          <Amount
            id={`${id}-period`}
            label={`EMA length for condition ${number}`}
            value={card.period}
            min={2}
            max={400}
            onChange={(period) => onChange({ ...card, period })}
          />
          <Words>on</Words>
          <Choice
            id={`${id}-interval`}
            label={`Timeframe for condition ${number}`}
            value={card.interval}
            options={CHART_INTERVALS}
            labels={INTERVAL_LABELS}
            onChange={(interval) => onChange({ ...card, interval })}
          />
        </>
      )
    case "line": {
      const named = card.line !== null
      return (
        <>
          <Words>Price is</Words>
          <Choice<LinePosition>
            id={`${id}-position`}
            label={`Where price is, condition ${number}`}
            value={card.position}
            options={named ? LINE_POSITIONS : ["within"]}
            labels={{ within: "within", above: "above", under: "under" }}
            onChange={(position) => onChange({ ...card, position })}
          />
          {card.position === "within" ? (
            <div className="w-28">
              <TradeNumberField
                id={`${id}-percent`}
                label={`Percent for condition ${number}`}
                hideLabel
                value={card.percent}
                min={0.01}
                max={50}
                suffix="%"
                onChange={(percent) => onChange({ ...card, percent })}
              />
            </div>
          ) : null}
          <Words>of</Words>
          <Choice
            id={`${id}-which`}
            label={`Which line, condition ${number}`}
            value={named ? "named" : "nearest"}
            options={["nearest", "named"] as const}
            labels={{ nearest: "the nearest line", named: "the line named" }}
            onChange={(which) =>
              onChange(
                which === "named"
                  ? { ...card, line: card.line ?? "Support" }
                  : { ...card, line: null, position: "within" }
              )
            }
          />
          {named ? (
            <LineNameInput
              id={`${id}-name`}
              number={number}
              value={card.line ?? ""}
              onChange={(line) => onChange({ ...card, line })}
            />
          ) : null}
        </>
      )
    }
    case "gridsOnExchange":
    case "gridsInWallet":
    case "gridsOnCoin":
    case "positionsOnExchange": {
      const after: Record<typeof card.type, string> = {
        gridsOnExchange: "real-money grids running on this exchange",
        gridsInWallet: "grids running in this wallet",
        gridsOnCoin: "real-money grids running on this coin",
        positionsOnExchange: "real-money positions open on this exchange",
      }
      return (
        <>
          <Words>At most</Words>
          <Amount
            id={`${id}-count`}
            label={`How many, condition ${number}`}
            value={card.count}
            min={1}
            max={200}
            onChange={(count) => onChange({ ...card, count })}
          />
          <Words>{after[card.type]}</Words>
        </>
      )
    }
    case "lines":
      return (
        <>
          <Words>At least</Words>
          <Amount
            id={`${id}-count`}
            label={`How many lines, condition ${number}`}
            value={card.count}
            min={1}
            max={20}
            onChange={(count) => onChange({ ...card, count })}
          />
          <Choice
            id={`${id}-kinds`}
            label={`What counts as a line, condition ${number}`}
            value={card.kinds}
            options={RULE_LINE_KINDS}
            labels={LINE_KIND_LABELS}
            onChange={(kinds) => onChange({ ...card, kinds })}
          />
          <Words>above the price and as many below it</Words>
        </>
      )
    case "timeOnChart":
    case "timeSinceLastOrder":
      return (
        <>
          <Words>At least</Words>
          <Amount
            id={`${id}-minutes`}
            label={`Minutes, condition ${number}`}
            value={card.minutes}
            min={1}
            max={1440}
            onChange={(minutes) => onChange({ ...card, minutes })}
          />
          <Words>
            {card.type === "timeOnChart"
              ? "minutes on this chart"
              : "minutes since the last order on this coin"}
          </Words>
        </>
      )
    case "unreadable":
      return (
        <p className={`text-sm ${LOST_MONEY}`}>
          This condition was saved by a different version of Trade and cannot be
          read here. Until it is removed, the rule warns instead of blocking.
        </p>
      )
  }
}

/** The words between the boxes, read as part of the sentence. */
function Words({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-muted-foreground">{children}</span>
}

function Amount({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <NumberField
      id={id}
      label={label}
      labelClassName="sr-only"
      className="w-20 shrink-0 gap-0"
      inputClassName="w-20"
      min={min}
      max={max}
      value={value}
      onChange={onChange}
    />
  )
}

function Choice<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (value: T) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={id} aria-label={label} className="w-full sm:w-fit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * The name of a line, matched on whichever coin is open, so one rule can mean
 * "Weekly support" on BTC and on ETH. A blank name is kept on screen, marked,
 * and not saved until it has letters again.
 */
function LineNameInput({
  id,
  number,
  value,
  onChange,
}: {
  id: string
  number: number
  value: string
  onChange: (value: string) => void
}) {
  const [text, setText] = React.useState(value)
  const [last, setLast] = React.useState(value)
  if (value !== last) {
    setLast(value)
    setText(value)
  }
  const invalid = text.trim() === "" || text.trim().length > 60
  return (
    <Input
      id={id}
      aria-label={`Line name for condition ${number}`}
      aria-invalid={invalid || undefined}
      className="w-full sm:w-48"
      value={text}
      maxLength={60}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        if (next.trim() !== "") onChange(next)
      }}
    />
  )
}
