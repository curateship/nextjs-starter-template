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
import { qflAllocationPcts } from "@/lib/automations/qfl"
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

function NodeFields({
  node,
  interval,
  onChange,
}: {
  node: AutomationNode
  interval?: AutomationInterval
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
  if (inspector === "qfl" && node.kind === "qfl") {
    return <QflFields node={node} onChange={onChange} />
  }
  if (inspector === "dca" && node.kind === "dca") {
    return <DcaFields node={node} onChange={onChange} />
  }
  if (
    inspector === "protection" &&
    (node.kind === "takeProfit" || node.kind === "stopLoss")
  ) {
    return <ProtectionNodeFields node={node} onChange={onChange} />
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
        decides whether a chosen market is eligible for QFL.
      </p>
    </div>
  )
}

function DcaFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "dca" }>
  onChange: (node: AutomationNode) => void
}) {
  const setRung = (
    index: number,
    field: "deviation" | "size",
    value: number
  ) => {
    onChange({
      ...node,
      rungs: node.rungs.map((rung, i) =>
        i === index ? { ...rung, [field]: value } : rung
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
        {
          deviation: last ? Math.min(99, last.deviation + 3) : 5,
          size: last?.size ?? 100,
        },
      ],
    })
  }
  return (
    <div className="grid gap-3">
      <NumberField
        id={`dca-${node.id}-maxPositionPct`}
        label="Max position size (% of account)"
        field="maxPositionPct"
        value={node.maxPositionPct}
        min={1}
        max={100}
        step={1}
        info="The most of your account the whole ladder can ever hold. Rungs split this amount by their Size weight."
        onChange={(field, value) => onChange({ ...node, [field]: value })}
      />
      <div className="grid grid-cols-[1.25rem_1fr_1fr_1.75rem] items-center gap-2 text-[11px] text-muted-foreground">
        <span>#</span>
        <span className="flex items-center gap-1">
          Deviation %
          <InfoHint text="How far below the base this rung's buy rests, in percent." />
        </span>
        <span className="flex items-center gap-1">
          Size %
          <InfoHint text="This rung's weight when splitting the max position. 100% is one unit; raise deeper rungs to buy bigger." />
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
              setRung(index, "deviation", Number(event.target.value))
            }
          />
          <Input
            type="number"
            aria-label={`Rung ${index + 1} size percent`}
            value={rung.size}
            min={1}
            max={10_000}
            step={1}
            onChange={(event) =>
              setRung(index, "size", Number(event.target.value))
            }
          />
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
      <p className="text-[11px] text-muted-foreground">
        Each rung rests a buy that percent below the base it&apos;s fed. Sizes
        are relative weights that split the max position between rungs — raise
        the deeper ones to buy bigger as price falls. Take Profit and Stop Loss
        hang on this node.
      </p>
    </div>
  )
}

function QflFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "qfl" }>
  onChange: (node: AutomationNode) => void
}) {
  type NumberKey = {
    [K in keyof typeof node]: (typeof node)[K] extends number ? K : never
  }[keyof typeof node] &
    string
  const setNumber = (field: NumberKey, value: number) =>
    onChange({ ...node, [field]: value })
  const number = (
    field: NumberKey,
    label: string,
    options: {
      min?: number
      max?: number
      step?: number
      disabled?: boolean
      info?: string
    } = {}
  ) => (
    <NumberField
      id={`qfl-${node.id}-${field}`}
      label={label}
      field={field}
      value={node[field] as number}
      onChange={setNumber}
      {...options}
    />
  )
  const toggle = (
    field: "stopEnabled" | "timeExitEnabled" | "respectFilterEnabled",
    label: string,
    info?: string
  ) => (
    <div className="flex items-center gap-1">
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox
          checked={node[field]}
          onCheckedChange={(checked) =>
            onChange({ ...node, [field]: checked === true })
          }
        />
        {label}
      </label>
      {info ? <InfoHint text={info} /> : null}
    </div>
  )
  const allocations = qflAllocationPcts(node)

  return (
    <div className="grid gap-4">
      <Card size="sm" className="bg-muted/40">
        <CardHeader>
          <CardTitle className="text-xs">Panic setup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {number("basePeriods", "Base search", {
              min: 4,
              step: 1,
              info: "How many candles back to search for the lowest low that forms a base.",
            })}
            {number("pumpPeriods", "Base confirmation", {
              min: 1,
              step: 1,
              info: "How many candles the new low must hold before the base counts as confirmed.",
            })}
            {number("crackPct", "Crack below base (%)", {
              min: 0.01,
              step: 0.1,
              info: "How far below the base a candle must close to count as a crack.",
            })}
            {number("maxCrackBars", "Maximum fall (candles)", {
              min: 1,
              step: 1,
              info: "The drop must be quick: price was still up at the base within this many candles before the crack, so a slow slide underneath it is ignored.",
            })}
            {number("volumeMultiplier", "Volume multiple", {
              min: 0,
              step: 0.1,
              info: "The crack candle's volume must be at least this many times the recent average. 0 turns the check off.",
            })}
            {number("volumeLookback", "Volume lookback", {
              min: 2,
              step: 1,
              info: "How many candles to average when judging whether the crack's volume is high.",
            })}
          </div>
        </CardContent>
      </Card>
      <Card size="sm" className="bg-muted/40">
        <CardHeader>
          <CardTitle className="text-xs">Ladder</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            {number("totalOrders", "Total buys", {
              min: 1,
              max: 20,
              step: 1,
              info: "How many buy orders the ladder places below the base.",
            })}
            {number("priceStepPct", "Level spacing (%)", {
              min: 0.01,
              step: 0.1,
              info: "How far apart the ladder's buy levels sit, in percent.",
            })}
            {number("stepMultiplier", "Spacing growth (×)", {
              min: 0.1,
              step: 0.1,
              info: "Widens each gap as you go deeper. 1 keeps even spacing; above 1 spreads the deeper buys further apart.",
            })}
            {number("sizeMultiplier", "Size growth (×)", {
              min: 0.1,
              step: 0.1,
              info: "Grows each buy as you go deeper. 1 keeps them equal; above 1 makes the deeper buys bigger.",
            })}
            {number("takeProfitPct", "Profit per buy (%)", {
              min: 0.01,
              step: 0.1,
              info: "How far above each buy's average price to take profit.",
            })}
            {number("ceilingPct", "Ceiling below base (%)", {
              min: 0,
              step: 0.1,
              info: "Caps the profit target this far below the base, so it never tries to sell above the broken base.",
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Equity by level:{" "}
            {allocations.map((value) => `${value.toFixed(1)}%`).join(" · ")}
          </p>
        </CardContent>
      </Card>
      <Card size="sm" className="bg-muted/40">
        <CardHeader>
          <CardTitle className="text-xs">Exposure and exits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            {number("maxMarketExposurePct", "Maximum per market (%)", {
              min: 0.1,
              max: 100,
              step: 1,
              info: "The most of your account one market's ladder can ever hold.",
            })}
            {number("maxPortfolioExposurePct", "Maximum across QFL (%)", {
              min: 0.1,
              max: 100,
              step: 1,
              info: "The most of your account all QFL ladders combined can hold at once.",
            })}
          </div>
          {toggle(
            "stopEnabled",
            "Use stop loss",
            "Sell everything if price falls below the ladder's deepest buy by the amount set here."
          )}
          {number("stopBelowFinalPct", "Stop below final buy (%)", {
            min: 0.01,
            step: 0.1,
            disabled: !node.stopEnabled,
            info: "How far below the deepest buy the stop sits.",
          })}
          {toggle(
            "timeExitEnabled",
            "Use time exit",
            "Close the trade if it hasn't finished within the hold time below."
          )}
          {number("maxHoldHours", "Maximum hold (hours)", {
            min: 1,
            step: 1,
            disabled: !node.timeExitEnabled,
            info: "How long to hold before giving up and closing the trade.",
          })}
        </CardContent>
      </Card>
      <Card size="sm" className="bg-muted/40">
        <CardHeader>
          <CardTitle className="text-xs">Past base quality</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {toggle(
            "respectFilterEnabled",
            "Require bases to have recovered before",
            "Only trade markets whose past cracks tended to bounce back."
          )}
          <div className="grid grid-cols-2 gap-2">
            {number("respectLookbackMonths", "History (months)", {
              min: 1,
              max: 60,
              step: 1,
              disabled: !node.respectFilterEnabled,
              info: "How many months of history to judge the market's past base quality over.",
            })}
            {number("minRespectPct", "Minimum respected (%)", {
              min: 0,
              max: 100,
              step: 1,
              disabled: !node.respectFilterEnabled,
              info: "The smallest share of past cracks that must have recovered before a trade is allowed.",
            })}
            {number("recoveryTargetPct", "Recovery vs first base (%)", {
              min: -50,
              max: 50,
              step: 0.1,
              disabled: !node.respectFilterEnabled,
              info: "How far above the base counts as a recovery (negative means below the base).",
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Negative recovery values stop below the first broken base. Zero
            requires a full reclaim; positive values require price to pass it.
          </p>
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground">
        A connected Trend must be bullish to start a new ladder. Once a ladder
        starts, it continues even if that Trend later changes.
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
          <Card key={group.title} size="sm" className="bg-muted/40">
            <CardHeader>
              <CardTitle className="text-xs">{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {group.fields.map(field)}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return <div className="grid gap-4">{module.paramFields.map(field)}</div>
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
            <SelectContent position="popper">
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
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "takeProfit" | "stopLoss" }>
  onChange: (node: AutomationNode) => void
}) {
  const isTp = node.kind === "takeProfit"
  const max = isTp ? 1000 : 100
  const trailing = node.kind === "stopLoss" && node.mode === "trailing"
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
            <SelectContent position="popper">
              <SelectItem value="fixed">Fixed — stays at the entry</SelectItem>
              <SelectItem value="trailing">
                Trailing — follows the best price
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
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
    <Card size="sm" className="bg-muted/40">
      <CardContent className="grid gap-1.5">
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
      </CardContent>
    </Card>
  )
}
