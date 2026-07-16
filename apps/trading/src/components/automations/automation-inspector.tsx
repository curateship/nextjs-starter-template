import { AlertCircleIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  AutomationNode,
  AutomationValidationError,
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
      <div
        className={cn(
          "relative border-b px-4 py-3",
          onToggleFavorite && "pr-12"
        )}
      >
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
            <NodeFields node={selectedNode} onChange={onNodeChange} />
          ) : null}

          {selectedNode && onAddNode ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onAddNode(selectedNode)}
            >
              <PlusIcon className="size-4" />
              Add node
            </Button>
          ) : null}

          {selectedNode ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => onDeleteNode(selectedNode.id)}
            >
              <Trash2Icon className="size-4" />
              Delete node
            </Button>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function NodeFields({
  node,
  onChange,
}: {
  node: AutomationNode
  onChange: (node: AutomationNode) => void
}) {
  const inspector = automationNodeInspector(node)
  if (inspector === "indicator" && node.kind === "indicator") {
    return <IndicatorFields node={node} onChange={onChange} />
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

function NumberField<K extends string>({
  id,
  label,
  value,
  field,
  min,
  max,
  step,
  disabled,
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
  onChange: (field: K, value: number) => void
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
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
        onChange={(field, value) => onChange({ ...node, [field]: value })}
      />
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox
          checked={node.historyFilterEnabled}
          onCheckedChange={(checked) =>
            onChange({ ...node, historyFilterEnabled: checked === true })
          }
        />
        Require minimum market history
      </label>
      <NumberField
        id={`market-scanner-${node.id}-minHistoryMonths`}
        label="Minimum history (months)"
        field="minHistoryMonths"
        value={node.minHistoryMonths}
        min={1}
        max={60}
        step={1}
        disabled={!node.historyFilterEnabled}
        onChange={(field, value) => onChange({ ...node, [field]: value })}
      />
      <p className="text-[11px] text-muted-foreground">
        Markets are chosen when creating the bot or Backtest. This node only
        decides whether a chosen market is eligible for QFL.
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
    label: string
  ) => (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <Checkbox
        checked={node[field]}
        onCheckedChange={(checked) =>
          onChange({ ...node, [field]: checked === true })
        }
      />
      {label}
    </label>
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
            {number("basePeriods", "Base search", { min: 4, step: 1 })}
            {number("pumpPeriods", "Base confirmation", { min: 1, step: 1 })}
            {number("crackPct", "Crack below base (%)", {
              min: 0.01,
              step: 0.1,
            })}
            {number("maxCrackBars", "Maximum fall (candles)", {
              min: 1,
              step: 1,
            })}
            {number("volumeMultiplier", "Volume multiple", {
              min: 0,
              step: 0.1,
            })}
            {number("volumeLookback", "Volume lookback", { min: 2, step: 1 })}
          </div>
        </CardContent>
      </Card>
      <Card size="sm" className="bg-muted/40">
        <CardHeader>
          <CardTitle className="text-xs">Ladder</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            {number("totalOrders", "Total buys", { min: 1, max: 20, step: 1 })}
            {number("priceStepPct", "Level spacing (%)", {
              min: 0.01,
              step: 0.1,
            })}
            {number("stepMultiplier", "Spacing growth (×)", {
              min: 0.1,
              step: 0.1,
            })}
            {number("sizeMultiplier", "Size growth (×)", {
              min: 0.1,
              step: 0.1,
            })}
            {number("takeProfitPct", "Profit per buy (%)", {
              min: 0.01,
              step: 0.1,
            })}
            {number("ceilingPct", "Ceiling below base (%)", {
              min: 0,
              step: 0.1,
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
            })}
            {number("maxPortfolioExposurePct", "Maximum across QFL (%)", {
              min: 0.1,
              max: 100,
              step: 1,
            })}
          </div>
          {toggle("stopEnabled", "Use stop loss")}
          {number("stopBelowFinalPct", "Stop below final buy (%)", {
            min: 0.01,
            step: 0.1,
            disabled: !node.stopEnabled,
          })}
          {toggle("timeExitEnabled", "Use time exit")}
          {number("maxHoldHours", "Maximum hold (hours)", {
            min: 1,
            step: 1,
            disabled: !node.timeExitEnabled,
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
            "Require bases to have recovered before"
          )}
          <div className="grid grid-cols-2 gap-2">
            {number("respectLookbackMonths", "History (months)", {
              min: 1,
              max: 60,
              step: 1,
              disabled: !node.respectFilterEnabled,
            })}
            {number("minRespectPct", "Minimum respected (%)", {
              min: 0,
              max: 100,
              step: 1,
              disabled: !node.respectFilterEnabled,
            })}
            {number("recoveryTargetPct", "Recovery vs first base (%)", {
              min: -50,
              max: 50,
              step: 0.1,
              disabled: !node.respectFilterEnabled,
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
    },
    {
      key: "relativeSize" as const,
      label: "Relative nearby size (×)",
      value: node.relativeSize,
      min: 1,
      max: 1_000,
      step: 0.5,
    },
    {
      key: "maxDistancePct" as const,
      label: "Maximum distance (%)",
      value: node.maxDistancePct,
      min: 0.01,
      max: 10,
      step: 0.1,
    },
    {
      key: "confirmationMs" as const,
      label: "Confirmation time (seconds)",
      value: node.confirmationMs / 1_000,
      min: 0.1,
      max: 60,
      step: 0.1,
    },
  ]

  return (
    <div className="grid gap-4">
      {fields.map((field) => (
        <div key={field.key} className="grid gap-1.5">
          <Label
            htmlFor={`whale-wall-${node.id}-${field.key}`}
            className="text-xs"
          >
            {field.label}
          </Label>
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
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        {field.label}
      </label>
    )
  }

  if (field.kind === "select" && field.options) {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={inputId} className="text-xs">
          {field.label}
        </Label>
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
      <Label htmlFor={inputId} className="text-xs">
        {field.label}
      </Label>
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
      <Label htmlFor={`lookback-${node.id}`} className="text-xs">
        Valid for (candles)
      </Label>
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

function ProtectionNodeFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "takeProfit" | "stopLoss" }>
  onChange: (node: AutomationNode) => void
}) {
  const isTp = node.kind === "takeProfit"
  const max = isTp ? 1000 : 100
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`protection-${node.id}`} className="text-xs">
        {isTp ? "Take profit %" : "Stop loss %"}
      </Label>
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
          : "Exits at a loss this far from the entry. Attach it to a Long or Short entry — it only guards that side."}
      </p>
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
    <div className="grid gap-1.5">
      <Label htmlFor={`target-${node.id}`} className="text-xs">
        Target account equity %
      </Label>
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
  )
}
