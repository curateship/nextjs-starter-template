import { usd, usdWhole } from "@/lib/format"
import {
  AlertCircleIcon,
  InfoIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  automationIntervalRatio,
  MAX_RR_RATIO,
  type AutomationInterval,
  type AutomationNode,
  type AutomationValidationError,
} from "@/lib/automations/automation"
import {
  automationNodeDescription,
  automationNodeInspector,
  automationNodeName,
} from "@/lib/automations/node-registry"
import { dcaAllocationPcts } from "@/lib/automations/dca"
import type { IndicatorParamField } from "@/lib/indicators/contract"
import { INDICATORS, type IndicatorParamValue } from "@/lib/indicators/registry"
import { cn } from "@/lib/utils"

export function AutomationInspector({
  className,
  selectedNode,
  errors,
  favorite,
  savingFavorite,
  interval,
  feedsFromDca,
  feedsFromSession,
  feedsFromBase,
  graphHasDca,
  referenceEquity,
  onNodeChange,
  onToggleFavorite,
  onAddNode,
  onDeleteNode,
}: {
  className?: string
  selectedNode: AutomationNode | null
  errors: AutomationValidationError[]
  favorite?: boolean
  savingFavorite?: boolean
  /** The automation's own timeframe — enables the indicator Timeframe field. */
  interval?: AutomationInterval
  /** True when the selected Take Profit node is fed by a DCA node. */
  feedsFromDca?: boolean
  /** True when the selected Stop Loss node is fed by a Sessions node. */
  feedsFromSession?: boolean
  /** True when the selected Stop Loss node is fed by a Base node. */
  feedsFromBase?: boolean
  /** True when the automation contains a DCA ladder anywhere in the graph. */
  graphHasDca?: boolean
  /** Account size for previewing a DCA ladder in dollars (the test capital). */
  referenceEquity?: number
  onNodeChange: (node: AutomationNode) => void
  onToggleFavorite?: () => void
  onAddNode?: (node: AutomationNode) => void
  onDeleteNode: (nodeId: string) => void
}) {
  const nodeErrors = selectedNode
    ? errors.filter((error) => error.nodeId === selectedNode.id)
    : errors

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className
      )}
    >
      <div className={cn("relative px-4 py-3", onToggleFavorite && "pr-12")}>
        <h2 className="text-sm font-semibold">
          {selectedNode ? automationNodeName(selectedNode) : "Automation"}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {selectedNode
            ? automationNodeDescription(selectedNode)
            : "Select a node to view and edit its settings."}
        </p>
        {selectedNode && onToggleFavorite ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${favorite ? "Remove" : "Add"} ${automationNodeName(selectedNode)} ${favorite ? "from" : "to"} favorites`}
            aria-pressed={favorite}
            disabled={savingFavorite}
            onClick={onToggleFavorite}
            className={cn(
              "absolute top-3 right-3",
              favorite && "text-amber-500"
            )}
          >
            <StarIcon className={cn("size-4", favorite && "fill-current")} />
          </Button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          {nodeErrors.length > 0 ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertCircleIcon className="size-3.5" />
                {selectedNode ? "Fix this node" : "Automation needs attention"}
              </div>
              <ul className="grid gap-1">
                {nodeErrors.map((error, index) => (
                  <li
                    key={`${error.code}-${error.nodeId ?? error.edgeId ?? index}`}
                  >
                    {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedNode ? (
            <NodeFields
              node={selectedNode}
              interval={interval}
              feedsFromDca={feedsFromDca}
              feedsFromSession={feedsFromSession}
              feedsFromBase={feedsFromBase}
              graphHasDca={graphHasDca}
              referenceEquity={referenceEquity}
              onChange={onNodeChange}
            />
          ) : null}

          {selectedNode ? (
            <div className="grid grid-cols-2 gap-2">
              {onAddNode ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onAddNode(selectedNode)}
                >
                  <PlusIcon className="size-4" />
                  Add node
                </Button>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className={cn(!onAddNode && "col-span-2")}
                onClick={() => onDeleteNode(selectedNode.id)}
              >
                <Trash2Icon className="size-4" />
                Delete node
              </Button>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * The house card every node's settings sit in: light gray surface, small title.
 * Nodes with several sections (DCA, grouped indicators) render one per section;
 * single-section nodes get one from {@link NodeFields}.
 */
function NodeCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card size="sm" className="bg-muted/40">
      <CardHeader>
        <CardTitle className="text-xs">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  )
}

/** Nodes whose settings are one section — wrapped in a single card by name. */
const SINGLE_CARD_TITLE: Partial<Record<AutomationNode["kind"], string>> = {
  marketScanner: "Market eligibility",
  whaleWall: "Wall detection",
  lookback: "Signal window",
  timeframe: "Timeframe",
  takeProfit: "Exit",
  stopLoss: "Exit",
}

function NodeFields(props: {
  node: AutomationNode
  interval?: AutomationInterval
  feedsFromDca?: boolean
  feedsFromSession?: boolean
  feedsFromBase?: boolean
  /** True when the automation contains a DCA ladder anywhere in the graph. */
  graphHasDca?: boolean
  referenceEquity?: number
  onChange: (node: AutomationNode) => void
}) {
  const title = SINGLE_CARD_TITLE[props.node.kind]
  if (title) {
    return (
      <NodeCard title={title}>
        <NodeFieldsInner {...props} />
      </NodeCard>
    )
  }
  return <NodeFieldsInner {...props} />
}

function NodeFieldsInner({
  node,
  interval,
  feedsFromDca,
  feedsFromSession,
  feedsFromBase,
  graphHasDca,
  referenceEquity,
  onChange,
}: {
  node: AutomationNode
  interval?: AutomationInterval
  feedsFromDca?: boolean
  feedsFromSession?: boolean
  feedsFromBase?: boolean
  graphHasDca?: boolean
  referenceEquity?: number
  onChange: (node: AutomationNode) => void
}) {
  const inspector = automationNodeInspector(node)
  if (inspector === "indicator" && node.kind === "indicator") {
    return <IndicatorFields node={node} onChange={onChange} />
  }
  if (inspector === "timeframe" && node.kind === "timeframe") {
    return (
      <TimeframeFields node={node} interval={interval} onChange={onChange} />
    )
  }
  if (inspector === "action" && node.kind === "action") {
    return <ActionFields node={node} onChange={onChange} />
  }
  if (inspector === "lookback" && node.kind === "lookback") {
    return <LookbackFields node={node} onChange={onChange} />
  }
  if (inspector === "whaleWall" && node.kind === "whaleWall") {
    return <WhaleWallFields node={node} onChange={onChange} />
  }
  if (inspector === "marketScanner" && node.kind === "marketScanner") {
    return <MarketScannerFields node={node} onChange={onChange} />
  }
  if (inspector === "dca" && node.kind === "dca") {
    return (
      <DcaFields
        node={node}
        referenceEquity={referenceEquity}
        onChange={onChange}
      />
    )
  }
  if (
    inspector === "protection" &&
    (node.kind === "takeProfit" || node.kind === "stopLoss")
  ) {
    return (
      <ProtectionNodeFields
        node={node}
        feedsFromDca={feedsFromDca}
        feedsFromSession={feedsFromSession}
        feedsFromBase={feedsFromBase}
        graphHasDca={graphHasDca}
        onChange={onChange}
      />
    )
  }
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
      {node.kind === "logic" ? node.op.toUpperCase() : "This"} node is no longer
      supported. Delete this node and connect indicators directly — chain an
      indicator&apos;s Trend output into another indicator to filter it, and
      connect several signals into one action to fire on any of them.
    </div>
  )
}

/** Small "i" beside a label; hover/tap shows what the parameter does. */
function InfoHint({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={text}
            className="inline-flex text-muted-foreground/60 hover:text-foreground"
            onClick={(event) => event.preventDefault()}
          >
            <InfoIcon className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** A field label with an optional info tooltip beside it. */
function FieldLabel({
  htmlFor,
  info,
  children,
}: {
  htmlFor?: string
  info?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor} className="text-xs">
        {children}
      </Label>
      {info ? <InfoHint text={info} /> : null}
    </div>
  )
}

function NumberField<K extends string>({
  id,
  label,
  value,
  field,
  min,
  max,
  step,
  disabled,
  info,
  onChange,
}: {
  id: string
  label: string
  value: number
  field: K
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  info?: string
  onChange: (field: K, value: number) => void
}) {
  return (
    <div className="grid gap-1">
      <FieldLabel htmlFor={id} info={info}>
        {label}
      </FieldLabel>
      <NumberInput
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onChange(field, next)}
      />
    </div>
  )
}

function MarketScannerFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "marketScanner" }>
  onChange: (node: AutomationNode) => void
}) {
  return (
    <div className="grid gap-4">
      <NumberField
        id={`market-scanner-${node.id}-minDailyVolumeUsd`}
        label="Minimum daily volume (USD)"
        field="minDailyVolumeUsd"
        value={node.minDailyVolumeUsd}
        min={0}
        max={1_000_000_000_000}
        step={1_000_000}
        info="Skip markets that trade less than this much per day, so the bot avoids thin, illiquid coins."
        onChange={(field, value) => onChange({ ...node, [field]: value })}
      />
      <div className="flex items-center gap-1">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={node.historyFilterEnabled}
            onCheckedChange={(checked) =>
              onChange({ ...node, historyFilterEnabled: checked === true })
            }
          />
          Require minimum market history
        </label>
        <InfoHint text="Only allow markets that have existed for at least the number of months below." />
      </div>
      <NumberField
        id={`market-scanner-${node.id}-minHistoryMonths`}
        label="Minimum history (months)"
        field="minHistoryMonths"
        value={node.minHistoryMonths}
        min={1}
        max={60}
        step={1}
        disabled={!node.historyFilterEnabled}
        info="How many months of price history a market must have to be eligible."
        onChange={(field, value) => onChange({ ...node, [field]: value })}
      />
      <p className="text-[11px] text-muted-foreground">
        Markets are chosen when creating the bot or Backtest. This node only
        decides whether a chosen market is eligible for the DCA ladder.
      </p>
    </div>
  )
}

function DcaFields({
  node,
  referenceEquity,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "dca" }>
  /** Account size used to preview the ladder in dollars (the test capital). */
  referenceEquity?: number
  onChange: (node: AutomationNode) => void
}) {
  const setDeviation = (index: number, value: number) => {
    onChange({
      ...node,
      rungs: node.rungs.map((rung, i) =>
        i === index ? { ...rung, deviation: value } : rung
      ),
    })
  }
  const removeRung = (index: number) => {
    if (node.rungs.length <= 1) return
    onChange({ ...node, rungs: node.rungs.filter((_, i) => i !== index) })
  }
  const addRung = () => {
    if (node.rungs.length >= 20) return
    const last = node.rungs.at(-1)
    onChange({
      ...node,
      rungs: [
        ...node.rungs,
        { deviation: last ? Math.min(99, last.deviation + 3) : 5 },
      ],
    })
  }
  const number = (
    field:
      | "maxPositionPct"
      | "sizeMultiplier"
      | "maxOrderVolPct"
      | "trendMaBars",
    label: string,
    opts: {
      min?: number
      max?: number
      step?: number
      info?: string
      disabled?: boolean
    }
  ) => (
    <NumberField
      id={`dca-${node.id}-${field}`}
      label={label}
      field={field}
      value={node[field]}
      min={opts.min}
      max={opts.max}
      step={opts.step}
      info={opts.info}
      disabled={opts.disabled}
      onChange={(key, value) => onChange({ ...node, [key]: value })}
    />
  )

  const equity =
    referenceEquity && referenceEquity > 0 ? referenceEquity : 10_000
  const allocations = dcaAllocationPcts(
    node.rungs.length,
    node.maxPositionPct,
    node.sizeMultiplier
  )
  const potUsd = (equity * node.maxPositionPct) / 100
  const money = (value: number) => (value >= 100 ? usdWhole(value) : usd(value))

  return (
    <div className="grid gap-4">
      <NodeCard title="Only buy in an uptrend">
        <div className="flex items-center gap-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={node.trendFilterEnabled}
              onCheckedChange={(checked) =>
                onChange({ ...node, trendFilterEnabled: checked === true })
              }
            />
            Skip the base unless price is above its average
          </label>
          <InfoHint text="This ladder only buys, so in a falling market it averages down into the fall. On, a new ladder only starts while price is above its own average." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {number("trendMaBars", "Average length (candles)", {
            min: 2,
            max: 1000,
            step: 1,
            disabled: !node.trendFilterEnabled,
            info: "How many candles go into the average, counted on this bot's own timeframe. On a daily bot 200 is the classic 200-day average; on a 4-hour bot 200 candles is about 33 days.",
          })}
        </div>
        <div className="flex items-center gap-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={node.exitOnTrendBreak}
              disabled={!node.trendFilterEnabled}
              onCheckedChange={(checked) =>
                onChange({ ...node, exitOnTrendBreak: checked === true })
              }
            />
            Also SELL when the trend breaks
          </label>
          <InfoHint text="Off, it only blocks new ladders — one already open rides the fall down. On, it sells the position too." />
        </div>
      </NodeCard>
      <NodeCard title="After a big crash, wait for the bottom">
        <div className="flex items-center gap-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={node.crashFilterEnabled}
              onCheckedChange={(checked) =>
                onChange({ ...node, crashFilterEnabled: checked === true })
              }
            />
            Never start the ladder in the bounce
          </label>
          <InfoHint text="After a big fall, the jump back up is usually the whole recovery. This waits until price is back at the low of the fall before buying. No big fall found = no effect." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {number("crashMinFallPct", "Counts as a crash from (%)", {
            min: 1,
            max: 99,
            step: 1,
            disabled: !node.crashFilterEnabled,
            info: "How far a coin must have fallen from its high before this rule kicks in. Below this, the ladder behaves normally.",
          })}
          {number("crashMaxFallPct", "Stop counting past (%)", {
            min: 2,
            max: 99,
            step: 1,
            disabled: !node.crashFilterEnabled,
            info: "Falls bigger than this are ignored by the rule. A coin down more than this is usually finished rather than cheap.",
          })}
          {number("crashEntryAbovePct", "Allowed above the bottom (%)", {
            min: 0,
            max: 100,
            step: 0.5,
            disabled: !node.crashFilterEnabled,
            info: "How close to the lowest point price must get before the ladder may start. 0 means at the bottom or below. Raise it to start a little earlier, at the cost of buying higher.",
          })}
          {number("crashLookbackBars", "Look back (candles)", {
            min: 50,
            max: 5000,
            step: 10,
            disabled: !node.crashFilterEnabled,
            info: "How far back to search for the high the crash fell from, counted on this bot's own timeframe. On a 4-hour bot, 500 candles is about 83 days.",
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          The bottom is the lowest close, not the lowest wick.
        </p>
      </NodeCard>
      <NodeCard title="Ladder">
        <div className="rounded-md border bg-background/60 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Money in the pot</span>
            <span className="font-medium tabular-nums">{money(potUsd)}</span>
          </div>
          <p className="mt-0.5 text-muted-foreground">
            {node.maxPositionPct}% of a {money(equity)} account.{" "}
            {node.compound
              ? "The amounts below scale with whatever account actually runs it."
              : "Fixed sizing — the amounts below stay the same however the account grows."}
          </p>
        </div>
        <div className="grid grid-cols-[1.25rem_1fr_1fr_1.75rem] items-center gap-2 text-[11px] text-muted-foreground">
          <span>#</span>
          <span className="flex items-center gap-1">
            Deviation %
            <InfoHint text="How far below the previous buy this rung sits. The first one is measured from the base." />
          </span>
          <span className="flex items-center gap-1">
            Buy size
            <InfoHint text="What this buy spends — set by the Size ramp, bigger the deeper it drops. Scales with the real account." />
          </span>
          <span />
        </div>
        {node.rungs.map((rung, index) => (
          <div
            key={index}
            className="grid grid-cols-[1.25rem_1fr_1fr_1.75rem] items-center gap-2"
          >
            <span className="text-xs text-muted-foreground">{index + 1}</span>
            <NumberInput
              aria-label={`Rung ${index + 1} deviation percent`}
              value={rung.deviation}
              min={0.1}
              max={99}
              step={0.1}
              onValueChange={(next) => setDeviation(index, next)}
            />
            <div
              className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-xs text-muted-foreground tabular-nums"
              aria-label={`Rung ${index + 1} buy amount`}
            >
              {money((equity * (allocations[index] ?? 0)) / 100)}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              disabled={node.rungs.length <= 1}
              aria-label={`Remove rung ${index + 1}`}
              onClick={() => removeRung(index)}
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
          disabled={node.rungs.length >= 20}
          onClick={addRung}
        >
          <PlusIcon className="size-4" />
          Add rung
        </Button>
      </NodeCard>
      <NodeCard title="Sizing and fills">
        <div className="grid grid-cols-2 gap-2">
          {number("maxPositionPct", "Max position (% of account)", {
            min: 1,
            max: 100,
            step: 1,
            info: "The most of your account the whole ladder can ever spend. It's split across the buys automatically by the Size ramp.",
          })}
          {number("sizeMultiplier", "Size ramp (× each buy)", {
            min: 1,
            max: 10,
            step: 0.1,
            info: "How much bigger each buy is than the one above it. 1 = every buy the same size; 2 = each buy is double the last, so you buy far more the deeper price drops.",
          })}
          {number("maxOrderVolPct", "Max order (% of 24h volume)", {
            min: 0,
            max: 5,
            step: 0.05,
            info: "Liquidity guard: no single buy bigger than this share of the coin's last-24-hours trading volume, so thin coins get small orders automatically. 0 = off.",
          })}
        </div>
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`dca-${node.id}-compound`}
            info="Compound: each buy is sized off your current balance, so profits grow your bets. Fixed: the same dollar size every time, off your starting balance."
          >
            Bet sizing
          </FieldLabel>
          <Select
            value={node.compound ? "compound" : "fixed"}
            onValueChange={(value) =>
              onChange({ ...node, compound: value === "compound" })
            }
          >
            <SelectTrigger
              id={`dca-${node.id}-compound`}
              className="h-8 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compound">
                Compound — grow bets with the account
              </SelectItem>
              <SelectItem value="fixed">Fixed — same bet every time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`dca-${node.id}-rungEntry`}
            info="Market buys the moment price reaches a rung, so you pay a little slippage. Limit rests an order at the rung's exact price and fills there. Neither ties up money until it fills."
          >
            When a rung is hit
          </FieldLabel>
          <Select
            value={node.rungEntry}
            onValueChange={(value) =>
              onChange({ ...node, rungEntry: value as "market" | "limit" })
            }
          >
            <SelectTrigger
              id={`dca-${node.id}-rungEntry`}
              className="h-8 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="market">
                Market — buy on confirmation (a bit of slippage)
              </SelectItem>
              <SelectItem value="limit">
                Limit — exact price at each rung, no slippage
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={node.requireTwoGreen}
              onCheckedChange={(checked) =>
                onChange({ ...node, requireTwoGreen: checked === true })
              }
            />
            Only buy after 2 green candles
          </label>
          <InfoHint text="A rung only buys once price sits a full step below your last buy and two green candles confirm the turn. Stops one crash filling the whole ladder." />
        </div>
      </NodeCard>
      <p className="text-[11px] text-muted-foreground">
        Take Profit and Stop Loss hang on this node.
      </p>
    </div>
  )
}

function WhaleWallFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "whaleWall" }>
  onChange: (node: AutomationNode) => void
}) {
  const fields = [
    {
      key: "minUsd" as const,
      label: "Minimum wall size ($)",
      value: node.minUsd,
      min: 1,
      max: 1_000_000_000_000,
      step: 50_000,
      info: "How big a resting order must be to count as a wall worth following.",
    },
    {
      key: "relativeSize" as const,
      label: "Relative nearby size (×)",
      value: node.relativeSize,
      min: 1,
      max: 1_000,
      step: 0.5,
      info: "The wall must be at least this many times bigger than the typical nearby order.",
    },
    {
      key: "maxDistancePct" as const,
      label: "Maximum distance (%)",
      value: node.maxDistancePct,
      min: 0.01,
      max: 10,
      step: 0.1,
      info: "How close to the current price the wall must sit to be followed, in percent.",
    },
    {
      key: "confirmationMs" as const,
      label: "Confirmation time (seconds)",
      value: node.confirmationMs / 1_000,
      min: 0.1,
      max: 60,
      step: 0.1,
      info: "How long the wall must hold steady before the bot places its order in front of it.",
    },
  ]

  return (
    <div className="grid gap-4">
      {fields.map((field) => (
        <div key={field.key} className="grid gap-1.5">
          <FieldLabel
            htmlFor={`whale-wall-${node.id}-${field.key}`}
            info={field.info}
          >
            {field.label}
          </FieldLabel>
          <NumberInput
            id={`whale-wall-${node.id}-${field.key}`}
            min={field.min}
            max={field.max}
            step={field.step}
            value={field.value}
            className="h-8 text-xs"
            onValueChange={(next) =>
              onChange({
                ...node,
                [field.key]:
                  field.key === "confirmationMs" ? next * 1_000 : next,
              })
            }
          />
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Uses the live order book. Bid Wall connects only to Long; Ask Wall
        connects only to Short. Historical backtesting is unavailable.
      </p>
    </div>
  )
}

function IndicatorFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "indicator" }>
  onChange: (node: AutomationNode) => void
}) {
  const module = INDICATORS[node.indicator.type]
  // Show what will actually run: settings saved before a param existed get
  // the schema default filled in (the same default evaluation uses).
  const parsed = module.paramsSchema.safeParse(node.indicator.params)
  const params = parsed.success
    ? (parsed.data as Record<string, IndicatorParamValue>)
    : node.indicator.params
  const setParam = (key: string, value: IndicatorParamValue) =>
    onChange({
      ...node,
      indicator: {
        ...node.indicator,
        params: { ...params, [key]: value },
      },
    })
  const field = (item: IndicatorParamField) => (
    <IndicatorField
      key={item.key}
      field={item}
      value={params[item.key]}
      inputId={`automation-${node.id}-${item.key}`}
      onChange={(value) => setParam(item.key, value)}
    />
  )
  // Drawing settings (which arrows to paint, how far apart) belong to the chart's
  // indicator card. A node on the canvas has no chart, so it never shows them.
  const editableFields = module.paramFields.filter((item) => !item.chartOnly)

  if (module.paramGroups?.length) {
    const groupedKeys = new Set(
      module.paramGroups.flatMap((group) => group.keys)
    )
    const groups = [
      ...module.paramGroups.map((group) => ({
        title: group.title,
        fields: group.keys.flatMap((key) => {
          const match = editableFields.find((item) => item.key === key)
          return match ? [match] : []
        }),
      })),
      {
        title: "Other settings",
        fields: editableFields.filter((item) => !groupedKeys.has(item.key)),
      },
    ].filter((group) => group.fields.length > 0)

    return (
      <div className="grid gap-4">
        {groups.map((group) => (
          <NodeCard key={group.title} title={group.title}>
            {group.fields.map(field)}
          </NodeCard>
        ))}
      </div>
    )
  }

  return <NodeCard title="Settings">{editableFields.map(field)}</NodeCard>
}

function IndicatorField({
  field,
  value,
  inputId,
  onChange,
}: {
  field: IndicatorParamField
  value: IndicatorParamValue | undefined
  inputId: string
  onChange: (value: IndicatorParamValue) => void
}) {
  if (field.kind === "boolean") {
    return (
      <div className="flex items-center gap-1">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          {field.label}
        </label>
        {field.info ? <InfoHint text={field.info} /> : null}
      </div>
    )
  }

  if (field.kind === "select" && field.options) {
    return (
      <div className="grid gap-1.5">
        <FieldLabel htmlFor={inputId} info={field.info}>
          {field.label}
        </FieldLabel>
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger id={inputId} className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option, index) => (
              <SelectItem key={option} value={option}>
                {field.optionLabels?.[index] ?? option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={inputId} info={field.info}>
        {field.label}
      </FieldLabel>
      <NumberInput
        id={inputId}
        step={field.step}
        value={typeof value === "number" ? value : Number(value ?? 0)}
        className="h-8 text-xs"
        onValueChange={onChange}
      />
    </div>
  )
}

function LookbackFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "lookback" }>
  onChange: (node: AutomationNode) => void
}) {
  return (
    <div className="grid gap-1.5">
      <FieldLabel
        htmlFor={`lookback-${node.id}`}
        info="How many candles the incoming signal stays valid after it fires, before it goes stale."
      >
        Valid for (candles)
      </FieldLabel>
      <NumberInput
        id={`lookback-${node.id}`}
        min={1}
        max={1400}
        step={1}
        value={node.bars}
        className="h-8 text-xs"
        onValueChange={(next) => onChange({ ...node, bars: next })}
      />
      <p className="text-[11px] text-muted-foreground">
        The incoming signal counts for this many candles after it fires, then
        goes stale and blocks everything downstream until a fresh signal.
      </p>
    </div>
  )
}

const ALL_INTERVALS: AutomationInterval[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
]

/**
 * Settings for the Timeframe node: which higher timeframe the indicators
 * feeding it evaluate on. Only strictly-higher clean multiples of the
 * automation's interval are offered; the compiler enforces the rest (one
 * higher timeframe per graph, no Look Back on the same wire).
 */
function TimeframeFields({
  node,
  interval,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "timeframe" }>
  interval?: AutomationInterval
  onChange: (node: AutomationNode) => void
}) {
  const higher = interval
    ? ALL_INTERVALS.filter(
        (candidate) => automationIntervalRatio(interval, candidate) !== null
      )
    : ALL_INTERVALS
  return (
    <div className="grid gap-1.5">
      <FieldLabel
        htmlFor={`timeframe-${node.id}`}
        info="The larger candles the indicators feeding this node evaluate on, instead of the bot's own timeframe."
      >
        Higher timeframe
      </FieldLabel>
      {higher.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No timeframe exists above the automation's {interval}. Lower the
          automation's timeframe in Settings to use this node.
        </p>
      ) : (
        <>
          <Select
            value={node.interval}
            onValueChange={(value) =>
              onChange({ ...node, interval: value as AutomationInterval })
            }
          >
            <SelectTrigger id={`timeframe-${node.id}`} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {higher.map((candidate) => (
                <SelectItem key={candidate} value={candidate}>
                  {candidate}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Every indicator feeding this node watches closed {node.interval}{" "}
            candles instead of the bot's timeframe. Its opinion updates one
            bot-timeframe candle after each {node.interval} candle closes —
            never before. Wire it between an indicator's Trend output and the
            entry indicator it should gate.
          </p>
        </>
      )}
    </div>
  )
}

function ProtectionNodeFields({
  node,
  feedsFromDca,
  feedsFromSession,
  feedsFromBase,
  graphHasDca,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "takeProfit" | "stopLoss" }>
  /** True for a Take Profit fed by a DCA node — unlocks the "previous rung" styles. */
  feedsFromDca?: boolean
  /** True for a Stop Loss fed by a Sessions node — unlocks the session-open level. */
  feedsFromSession?: boolean
  /** True for a Stop Loss fed by a Base node — unlocks the confirmed-base level. */
  feedsFromBase?: boolean
  graphHasDca?: boolean
  onChange: (node: AutomationNode) => void
}) {
  const isTp = node.kind === "takeProfit"
  const max = isTp ? 1000 : 100
  const trailing = node.kind === "stopLoss" && node.mode === "trailing"
  const atSessionOpen = node.kind === "stopLoss" && node.level === "sessionOpen"
  const atBase = node.kind === "stopLoss" && node.level === "confirmedBase"
  // Each extra level needs the node that supplies it: a Sessions node to say WHICH
  // session, a Base node to say which base. With neither wired in there is only one
  // real choice, so the dropdown is hidden entirely. It reappears for a stop already
  // SET to one of them — otherwise unwiring that node would strand it with no way
  // back to a percent.
  const showStopLevel =
    node.kind === "stopLoss" &&
    (Boolean(feedsFromSession) ||
      Boolean(feedsFromBase) ||
      atSessionOpen ||
      atBase)
  const rrRatio = node.kind === "takeProfit" ? node.rrRatio : undefined
  const tpMode =
    node.kind === "takeProfit" ? (node.mode ?? "average") : "average"
  const previousRung = tpMode !== "average"
  return (
    <div className="grid gap-3">
      {showStopLevel ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`stop-level-${node.id}`}
            info="A set percent from your entry, the session's opening price, or the confirmed base itself. The last two need the node that supplies the level wired in; the percent is the fallback when there is no level yet."
          >
            Stop sits at
          </FieldLabel>
          <Select
            value={node.level ?? "percent"}
            onValueChange={(level) =>
              onChange({
                ...node,
                level:
                  level === "sessionOpen"
                    ? "sessionOpen"
                    : level === "confirmedBase"
                      ? "confirmedBase"
                      : "percent",
                // Both are one fixed price; neither can also trail.
                ...(level === "percent" ? {} : { mode: "fixed" as const }),
              })
            }
          >
            <SelectTrigger id={`stop-level-${node.id}`} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">A percent from the entry</SelectItem>
              {feedsFromSession || atSessionOpen ? (
                <SelectItem value="sessionOpen">The session open</SelectItem>
              ) : null}
              {feedsFromBase || atBase ? (
                <SelectItem value="confirmedBase">
                  The confirmed base
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {atBase && node.kind === "stopLoss" ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`stop-base-reclaim-${node.id}`}
            info="Watches the base it cut you at. Every candle must close above it for this many days straight — one close below restarts the count at zero. Wicks don't count. Then the trade goes back on at market. 0 = never."
          >
            Buy back after (days above the base)
          </FieldLabel>
          <NumberInput
            id={`stop-base-reclaim-${node.id}`}
            min={0}
            max={3650}
            step={1}
            value={node.baseReclaimDays ?? 0}
            className="h-8 text-xs"
            onValueChange={(next) =>
              onChange({ ...node, baseReclaimDays: next })
            }
          />
          <p className="text-[11px] text-muted-foreground">
            {node.baseReclaimDays
              ? `Price must close above the base every candle for ${node.baseReclaimDays} days straight — one close below restarts the count. You buy back higher than you were stopped at.`
              : "Once stopped out, the ladder moves on to its next rung and never buys that level back."}
          </p>
        </div>
      ) : null}
      {node.kind === "stopLoss" && !atSessionOpen && !atBase ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`protection-mode-${node.id}`}
            info="Fixed keeps the stop at the entry distance; Trailing follows the best price and only moves in your favor."
          >
            Stop behavior
          </FieldLabel>
          <Select
            value={node.mode ?? "fixed"}
            onValueChange={(mode) =>
              onChange({
                ...node,
                mode: mode === "trailing" ? "trailing" : "fixed",
              })
            }
          >
            <SelectTrigger
              id={`protection-mode-${node.id}`}
              className="h-8 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed — stays at the entry</SelectItem>
              <SelectItem value="trailing">
                Trailing — follows the best price
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {node.kind === "stopLoss" && graphHasDca ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`stop-anchor-${node.id}`}
            info="Average buy: every extra buy drags the stop down with it, so your earliest buys can lose far more than the percent you set. First buy: the percent is the real worst case."
          >
            Measured from
          </FieldLabel>
          <Select
            value={node.anchor ?? "average"}
            onValueChange={(value) =>
              onChange({
                ...node,
                anchor: value === "first" ? "first" : "average",
              })
            }
          >
            <SelectTrigger
              id={`stop-anchor-${node.id}`}
              className="h-8 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="average">
                Average buy — slides down as you add
              </SelectItem>
              <SelectItem value="first">
                First buy — the percent is your real max loss
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {node.kind === "takeProfit" && feedsFromDca ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`tp-mode-${node.id}`}
            info="Average: sell the lot once it is this far above your average buy. Previous rung: peel one buy off at a time as price recovers. Nearest rung: sell everything at the first rung above your deepest buy."
          >
            Take profit style
          </FieldLabel>
          <Select
            value={tpMode}
            onValueChange={(value) =>
              onChange({
                ...node,
                mode: value as
                  "average" | "previousRungSellAll" | "nearestRungSellAll",
              })
            }
          >
            <SelectTrigger id={`tp-mode-${node.id}`} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="average">At the average price</SelectItem>
              <SelectItem value="previousRungSellAll">
                Sell at previous rung
              </SelectItem>
              <SelectItem value="nearestRungSellAll">
                Sell everything at nearest rung
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {node.kind === "takeProfit" && !previousRung ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`tp-basis-${node.id}`}
            info="A percent is a fixed distance from your entry. A ratio measures against the stop instead: at 2:1, a 2% stop takes profit at 4%. It follows whatever the stop does."
          >
            Take profit measured as
          </FieldLabel>
          <Select
            value={rrRatio === undefined ? "percent" : "riskReward"}
            onValueChange={(value) =>
              onChange({
                ...node,
                rrRatio: value === "riskReward" ? (rrRatio ?? 1) : undefined,
              })
            }
          >
            <SelectTrigger id={`tp-basis-${node.id}`} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">A percent from the entry</SelectItem>
              <SelectItem value="riskReward">
                R&amp;R ratio — a multiple of the stop
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {node.kind === "takeProfit" && rrRatio !== undefined && !previousRung ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`tp-rr-${node.id}`}
            info={`Reward per unit of risk. 1 means 1:1 — the profit target is the same distance as the stop. 2 means 2:1 — twice the stop's distance. Up to ${MAX_RR_RATIO}.`}
          >
            R&amp;R ratio (reward : risk)
          </FieldLabel>
          <NumberInput
            id={`tp-rr-${node.id}`}
            min={0.1}
            max={MAX_RR_RATIO}
            step={0.1}
            value={rrRatio}
            className="h-8 text-xs"
            onValueChange={(next) => onChange({ ...node, rrRatio: next })}
          />
          <p className="text-[11px] text-muted-foreground">
            {rrRatio}:1 — the target sits{" "}
            {rrRatio === 1 ? "the same distance" : `${rrRatio}x as far`} from
            your entry as the stop does. This entry needs a Stop Loss for it to
            measure against.
          </p>
        </div>
      ) : null}
      {isTp && (previousRung || rrRatio !== undefined) ? null : (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`protection-${node.id}`}
            info={
              isTp
                ? "How far above the entry to take profit."
                : atSessionOpen
                  ? "The fallback for a trade opened outside the session's hours, where there is no session-open price to sit at."
                  : atBase
                    ? "The fallback for a trade opened before any base has confirmed, where there is no base to sit on."
                    : trailing
                      ? "How far below the best price the trailing stop sits."
                      : "How far below the entry to cut the loss."
            }
          >
            {isTp
              ? "Take profit %"
              : atSessionOpen
                ? "Stop loss % (outside the session)"
                : atBase
                  ? "Stop loss % (no base yet)"
                  : trailing
                    ? "Trail distance %"
                    : "Stop loss %"}
          </FieldLabel>
          <NumberInput
            id={`protection-${node.id}`}
            min={0}
            max={max}
            step={0.1}
            value={node.pct}
            className="h-8 text-xs"
            onValueChange={(next) => onChange({ ...node, pct: next })}
          />
          <p className="text-[11px] text-muted-foreground">
            {isTp
              ? "Exits with profit this far from the entry. Attach it to a Long or Short entry — it only guards that side."
              : atSessionOpen
                ? "Used only when a trade opens outside the session, where there is no session-open price to sit at. There is always a stop."
                : atBase
                  ? "Used only when a trade opens with no confirmed base to sit on. There is always a stop."
                  : trailing
                    ? "The stop follows the best price since entry at this distance. It only ever moves in your favor — a pullback this big from the best price exits."
                    : "Exits at a loss this far from the entry. Attach it to a Long or Short entry — it only guards that side."}
          </p>
        </div>
      )}
      {trailing && !atSessionOpen && !atBase ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`protection-activation-${node.id}`}
            info="Wait until the trade is up this much before the trailing stop starts to follow."
          >
            Start trailing after +% (optional)
          </FieldLabel>
          <Input
            id={`protection-activation-${node.id}`}
            type="number"
            min={0}
            max={1000}
            step={0.1}
            value={node.activationPct ?? ""}
            placeholder="0 — trail right away"
            className="h-8 text-xs"
            onChange={(event) =>
              onChange({
                ...node,
                activationPct:
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
              })
            }
          />
          <p className="text-[11px] text-muted-foreground">
            Wait until the trade is up this much before the stop starts to
            follow. Until then it waits at the fixed distance below the entry.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function ActionFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "action" }>
  onChange: (node: AutomationNode) => void
}) {
  if (node.action === "close") {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Close Position is always reduce-only and closes the full market
        position.
      </div>
    )
  }

  return (
    <NodeCard title="Sizing">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`target-${node.id}`}
          info="The share of your account this entry aims to hold."
        >
          Target account equity %
        </FieldLabel>
        <NumberInput
          id={`target-${node.id}`}
          min={1}
          max={100}
          step={1}
          value={node.targetEquityPct ?? 10}
          className="h-8 text-xs"
          onValueChange={(next) => onChange({ ...node, targetEquityPct: next })}
        />
        <p className="text-[11px] text-muted-foreground">
          {node.action === "reverse"
            ? "When the position flips, the new opposite side targets this percentage of account equity. With no open position there is nothing to reverse."
            : "The engine adjusts toward this target instead of stacking another full order on every signal."}
        </p>
      </div>
    </NodeCard>
  )
}
