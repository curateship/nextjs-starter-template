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
  graphHasDca,
  referenceEquity,
  onChange,
}: {
  node: AutomationNode
  interval?: AutomationInterval
  feedsFromDca?: boolean
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
      <Input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(field, Number(event.target.value))}
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
    field: "crackPct" | "maxCrackBars" | "respectLookbackMonths" | "minRespectPct" | "recoveryTargetPct" | "maxPositionPct" | "sizeMultiplier" | "sellBelowBasePct" | "trendMaBars" | "maxCycleBars",
    label: string,
    opts: { min?: number; max?: number; step?: number; info?: string; disabled?: boolean }
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
  const money = (value: number) =>
    value >= 100
      ? `$${Math.round(value).toLocaleString()}`
      : `$${value.toFixed(2)}`

  return (
    <div className="grid gap-4">
      <NodeCard title="Base break">
          <p className="text-[11px] text-muted-foreground">
            What starts the ladder. The Base indicator wired into this node says
            where the base is; these two say what breaking it means.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {number("crackPct", "Crack below base (%)", {
              min: 0.01,
              max: 50,
              step: 0.1,
              info: "How far below the base a candle must close to count as a crack. That crack is the first buy.",
            })}
            {number("maxCrackBars", "Maximum fall (candles)", {
              min: 1,
              step: 1,
              info: "The drop must be quick: price was still up at the base within this many candles, so a slow slide underneath it is ignored.",
            })}
          </div>
      </NodeCard>
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
            <InfoHint text="This ladder only ever buys, so in a falling market it keeps averaging down into the fall. With this on, a new ladder only starts while the latest close is above the average of the last N candles — so it sits out downtrends instead of bleeding through them." />
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
            <InfoHint text="Off, the filter only stops NEW ladders starting — one that is already open rides the whole way down when the trend turns. On, price closing back below the average closes the position too. This is the ladder's only way to give up on a losing cycle apart from the stop." />
          </div>
      </NodeCard>
      <NodeCard title="Past base quality">
          <div className="flex items-center gap-1">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={node.respectFilterEnabled}
                onCheckedChange={(checked) =>
                  onChange({ ...node, respectFilterEnabled: checked === true })
                }
              />
              Only trade markets whose cracks recovered
            </label>
            <InfoHint text="Scores the market's past cracks over the history below and skips this one unless enough of them bounced back. Off means every crack qualifies." />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {number("respectLookbackMonths", "History (months)", {
              min: 1,
              max: 60,
              step: 1,
              disabled: !node.respectFilterEnabled,
              info: "How many months of history to judge the market's past cracks over.",
            })}
            {number("minRespectPct", "Minimum respected (%)", {
              min: 0,
              max: 100,
              step: 1,
              disabled: !node.respectFilterEnabled,
              info: "The smallest share of past cracks that must have recovered before a trade is allowed.",
            })}
            {number("recoveryTargetPct", "Recovery vs base (%)", {
              min: -50,
              max: 50,
              step: 0.1,
              disabled: !node.respectFilterEnabled,
              info: "How far above the base price counts as a recovery. Negative means below the base.",
            })}
          </div>
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
              <InfoHint text="How far below the PREVIOUS buy this rung rests, in percent. The first rung is measured from the base; each rung after it drops a further this-much below the one above." />
            </span>
            <span className="flex items-center gap-1">
              Buy size
              <InfoHint text="How much this buy spends — set automatically by the Size ramp, bigger the deeper it drops. Shown for the account size above; it scales with the real account." />
            </span>
            <span />
          </div>
          {node.rungs.map((rung, index) => (
            <div
              key={index}
              className="grid grid-cols-[1.25rem_1fr_1fr_1.75rem] items-center gap-2"
            >
              <span className="text-xs text-muted-foreground">{index + 1}</span>
              <Input
                type="number"
                aria-label={`Rung ${index + 1} deviation percent`}
                value={rung.deviation}
                min={0.1}
                max={99}
                step={0.1}
                onChange={(event) =>
                  setDeviation(index, Number(event.target.value))
                }
              />
              <div
                className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-xs tabular-nums text-muted-foreground"
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
          </div>
          <div className="grid gap-1.5">
            <FieldLabel
              htmlFor={`dca-${node.id}-compound`}
              info="Compound: each buy is sized off your CURRENT balance, so profits grow your bets and losses shrink them. Fixed: each buy is the same dollar size based on your starting balance, no matter how the account grows."
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
                <SelectItem value="fixed">
                  Fixed — same bet every time
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <FieldLabel
              htmlFor={`dca-${node.id}-rungEntry`}
              info="Market: the buy fires the moment price reaches a rung, so the fill lands a little past the exact price (that's slippage), and a violent crash makes it wait for the first green candle then take just one rung at the bounce. Limit: sets a single limit order at the rung's exact price, so you fill at exactly that level with no slippage. Neither ties up money until a buy actually fills."
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
            <InfoHint text="Buy one rung at a time, stepping down. A rung only fires once price sits at least a full rung-step below your last buy (the base for the first rung), two green candles in a row confirm the turn, AND the buy candle itself is still below that step level (it doesn't chase a bounce that already recovered). So every rung is genuinely at least a step lower, one red crash can't fill the whole ladder, and if the position gets sold on a bounce the cycle just ends. It keeps stepping down like that until the stop closes it." />
          </div>
      </NodeCard>
      <NodeCard title="Ladder exits">
          <p className="text-[11px] text-muted-foreground">
            Only used when the Take Profit hanging off this node is set to{" "}
            <span className="font-medium">
              Money back at nearest rung, then ride free
            </span>
            . Every other style ignores it.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {number("sellBelowBasePct", "Sell below base (%)", {
              // Matches the saved range. The UI used to clamp at 0 while the
              // schema allowed negatives, so a ladder set to ride its free coins
              // ABOVE the base could not be edited here without silently
              // clamping the value to 0.
              min: -500,
              max: 50,
              step: 0.1,
              info: "Where the free coins wait. Once the ladder has taken its money back, whatever coins are left cost nothing — they rest this far under the base and their sale is the whole trade's profit. A little under the base usually fills, because price that fell through a level tends to stall just short of reclaiming it. NEGATIVE rests them ABOVE the base instead, to ride a recovery rather than sell into it.",
            })}
            {number("maxCycleBars", "Give up after (candles)", {
              min: 0,
              max: 5000,
              step: 1,
              info: "A time stop. If a ladder has been open this many candles without resolving, it closes out and takes the loss. 0 means never give up — which is how a ladder ends up holding a bag forever, so the backtest shows a high win rate while the real losses sit in open positions.",
            })}
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
          <FieldLabel htmlFor={`whale-wall-${node.id}-${field.key}`} info={field.info}>
            {field.label}
          </FieldLabel>
          <Input
            id={`whale-wall-${node.id}-${field.key}`}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={field.value}
            className="h-8 text-xs"
            onChange={(event) => {
              const value = Number(event.target.value)
              onChange({
                ...node,
                [field.key]:
                  field.key === "confirmationMs" ? value * 1_000 : value,
              })
            }}
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

  if (module.paramGroups?.length) {
    const groupedKeys = new Set(
      module.paramGroups.flatMap((group) => group.keys)
    )
    const groups = [
      ...module.paramGroups.map((group) => ({
        title: group.title,
        fields: group.keys.flatMap((key) => {
          const match = module.paramFields.find((item) => item.key === key)
          return match ? [match] : []
        }),
      })),
      {
        title: "Other settings",
        fields: module.paramFields.filter((item) => !groupedKeys.has(item.key)),
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

  return <NodeCard title="Settings">{module.paramFields.map(field)}</NodeCard>
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
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
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
      <Input
        id={inputId}
        type="number"
        step={field.step}
        value={typeof value === "number" ? value : Number(value ?? 0)}
        className="h-8 text-xs"
        onChange={(event) => onChange(Number(event.target.value))}
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
      <Input
        id={`lookback-${node.id}`}
        type="number"
        min={1}
        max={1400}
        step={1}
        value={node.bars}
        className="h-8 text-xs"
        onChange={(event) =>
          onChange({ ...node, bars: Number(event.target.value) })
        }
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
  graphHasDca,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "takeProfit" | "stopLoss" }>
  /** True for a Take Profit fed by a DCA node — unlocks the "previous rung" styles. */
  feedsFromDca?: boolean
  graphHasDca?: boolean
  onChange: (node: AutomationNode) => void
}) {
  const isTp = node.kind === "takeProfit"
  const max = isTp ? 1000 : 100
  const trailing = node.kind === "stopLoss" && node.mode === "trailing"
  const tpMode =
    node.kind === "takeProfit" ? (node.mode ?? "average") : "average"
  const previousRung = tpMode !== "average"
  return (
    <div className="grid gap-3">
      {node.kind === "stopLoss" ? (
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
            info="Average buy: the stop sits this far below your blended average, so every extra buy drags the stop down with it — your earliest buys can end up losing far more than the percent you set. First buy: the stop stays this far below your very first entry, so the percent is the real worst case for the whole position."
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
            info="Average: close the whole position once it's this far above your average buy. Sell at previous rung: as price recovers, peel the ladder off — sell each averaged-in buy at the price of the buy above it, one at a time (the first at the base). Sell everything at nearest rung: put the whole position up for sale at the nearest rung above your deepest buy, so a bounce back to that one level closes it all at once. Money back, then ride free: at that same nearest rung sell only enough to hand back every dollar the ladder spent — the bleeding stops on the first decent bounce instead of waiting for a full recovery. The coins that sale leaves behind cost you nothing, so they wait just under the base (set by Sell below base % on the DCA node) and their sale is the trade's profit."
          >
            Take profit style
          </FieldLabel>
          <Select
            value={tpMode}
            onValueChange={(value) =>
              onChange({
                ...node,
                mode: value as
                  | "average"
                  | "previousRungSellAll"
                  | "nearestRungSellAll"
                  | "moneyBackThenBase",
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
              <SelectItem value="moneyBackThenBase">
                Money back at nearest rung, then ride free
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {isTp && previousRung ? null : (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`protection-${node.id}`}
            info={
              isTp
                ? "How far above the entry to take profit."
                : trailing
                  ? "How far below the best price the trailing stop sits."
                  : "How far below the entry to cut the loss."
            }
          >
            {isTp ? "Take profit %" : trailing ? "Trail distance %" : "Stop loss %"}
          </FieldLabel>
          <Input
            id={`protection-${node.id}`}
            type="number"
            min={0}
            max={max}
            step={0.1}
            value={node.pct}
            className="h-8 text-xs"
            onChange={(event) =>
              onChange({ ...node, pct: Number(event.target.value) })
            }
          />
          <p className="text-[11px] text-muted-foreground">
            {isTp
              ? "Exits with profit this far from the entry. Attach it to a Long or Short entry — it only guards that side."
              : trailing
                ? "The stop follows the best price since entry at this distance. It only ever moves in your favor — a pullback this big from the best price exits."
                : "Exits at a loss this far from the entry. Attach it to a Long or Short entry — it only guards that side."}
          </p>
        </div>
      )}
      {trailing ? (
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
        <Input
          id={`target-${node.id}`}
          type="number"
          min={1}
          max={100}
          step={1}
          value={node.targetEquityPct ?? 10}
          className="h-8 text-xs"
          onChange={(event) =>
            onChange({ ...node, targetEquityPct: Number(event.target.value) })
          }
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
