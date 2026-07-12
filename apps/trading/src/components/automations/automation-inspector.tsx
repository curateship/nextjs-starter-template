import { AlertCircleIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
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
import type { IndicatorParamField } from "@/lib/indicators/contract"
import { INDICATORS, type IndicatorParamValue } from "@/lib/indicators/registry"
import { cn } from "@/lib/utils"

import { automationNodeDescription, automationNodeName } from "./node-labels"

export function AutomationInspector({
  className,
  selectedNode,
  errors,
  onNodeChange,
  onDeleteNode,
}: {
  className?: string
  selectedNode: AutomationNode | null
  errors: AutomationValidationError[]
  onNodeChange: (node: AutomationNode) => void
  onDeleteNode: (nodeId: string) => void
}) {
  const nodeErrors = selectedNode
    ? errors.filter((error) => error.nodeId === selectedNode.id)
    : errors

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col bg-background", className)}
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">
          {selectedNode
            ? automationNodeName(selectedNode)
            : "Automation"}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {selectedNode
            ? automationNodeDescription(selectedNode)
            : "Select a node to view and edit its settings."}
        </p>
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

          {!selectedNode ? null : selectedNode.kind === "indicator" ? (
            <IndicatorFields node={selectedNode} onChange={onNodeChange} />
          ) : selectedNode.kind === "action" ? (
            <ActionFields node={selectedNode} onChange={onNodeChange} />
          ) : selectedNode.kind === "lookback" ? (
            <LookbackFields node={selectedNode} onChange={onNodeChange} />
          ) : (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              {selectedNode.op.toUpperCase()} nodes are no longer supported.
              Delete this node and connect indicators directly — chain an
              indicator&apos;s Trend output into another indicator to filter
              it, and connect several signals into one action to fire on any
              of them.
            </div>
          )}

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

  return (
    <div className="grid gap-4">
      {module.paramFields.map((field) => (
        <IndicatorField
          key={field.key}
          field={field}
          value={params[field.key]}
          inputId={`automation-${node.id}-${field.key}`}
          onChange={(value) => setParam(field.key, value)}
        />
      ))}
    </div>
  )
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
        The engine adjusts toward this target instead of stacking another full
        order on every signal.
      </p>
    </div>
  )
}
