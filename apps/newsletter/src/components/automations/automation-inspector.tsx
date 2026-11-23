import { AlertCircleIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import type {
  AutomationNode,
  AutomationValidationError,
  TagMode,
} from "@/lib/automations/automation"
import { TAG_MODES } from "@/lib/automations/automation"
import {
  BRANCH_FIELDS,
  BRANCH_OPS_BY_FIELD,
  DELAY_UNITS,
  type BranchField,
  type BranchOp,
  type DelayUnit,
} from "@/lib/automations/compiled-config"
import {
  automationNodeDescription,
  automationNodeInspector,
  automationNodeName,
} from "@/lib/automations/node-registry"
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
            <NodeFields node={selectedNode} onChange={onNodeChange} />
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
  onChange,
}: {
  node: AutomationNode
  onChange: (node: AutomationNode) => void
}) {
  const inspector = automationNodeInspector(node)
  if (inspector === "trigger" && node.kind === "trigger") {
    return <TriggerFields node={node} onChange={onChange} />
  }
  if (inspector === "sendEmail" && node.kind === "sendEmail") {
    return <SendEmailFields node={node} onChange={onChange} />
  }
  if (inspector === "delay" && node.kind === "delay") {
    return <DelayFields node={node} onChange={onChange} />
  }
  if (inspector === "branch" && node.kind === "branch") {
    return <BranchFields node={node} onChange={onChange} />
  }
  if (inspector === "tag" && node.kind === "tag") {
    return <TagFields node={node} onChange={onChange} />
  }
  if (inspector === "webhook" && node.kind === "webhook") {
    return <WebhookFields node={node} onChange={onChange} />
  }
  return null
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

function TextField({
  id,
  label,
  value,
  placeholder,
  maxLength,
  hint,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  maxLength?: number
  hint?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        className="h-8 text-xs"
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** Comma-separated Input ⇄ string[] used by the trigger and tag panels. */
function TagListField({
  id,
  label,
  tags,
  hint,
  onChange,
}: {
  id: string
  label: string
  tags: string[]
  hint?: string
  onChange: (tags: string[]) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {/* Uncontrolled (remounted per node via key) so a trailing comma can be
          typed without the parsed round-trip eating it. */}
      <Input
        key={id}
        id={id}
        defaultValue={tags.join(", ")}
        placeholder="tag-one, tag-two"
        className="h-8 text-xs"
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
              .slice(0, 50)
          )
        }
      />
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function TriggerFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "trigger" }>
  onChange: (node: AutomationNode) => void
}) {
  return (
    <div className="grid gap-4">
      <TextField
        id={`trigger-${node.id}-source`}
        label="Source app (optional)"
        value={node.source}
        placeholder="ai-trading"
        maxLength={100}
        hint="Only contacts pushed by this connection key enroll. Leave empty for any source."
        onChange={(source) => onChange({ ...node, source })}
      />
      <TagListField
        id={`trigger-${node.id}-tags`}
        label="Required tags (optional)"
        tags={node.tags}
        hint="Comma-separated. The contact must carry every tag listed here."
        onChange={(tags) => onChange({ ...node, tags })}
      />
    </div>
  )
}

function SendEmailFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "sendEmail" }>
  onChange: (node: AutomationNode) => void
}) {
  return (
    <div className="grid gap-4">
      <TextField
        id={`send-email-${node.id}-subject`}
        label="Subject"
        value={node.subject}
        placeholder="Welcome aboard!"
        maxLength={500}
        onChange={(subject) => onChange({ ...node, subject })}
      />
      <TextField
        id={`send-email-${node.id}-preheader`}
        label="Preheader (optional)"
        value={node.preheader}
        maxLength={500}
        hint="The preview line shown next to the subject in most inboxes."
        onChange={(preheader) => onChange({ ...node, preheader })}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={`send-email-${node.id}-body`} className="text-xs">
          Body
        </Label>
        <Textarea
          id={`send-email-${node.id}-body`}
          value={node.body}
          rows={10}
          placeholder="Hi {{firstName}}, …"
          className="text-xs"
          onChange={(event) => onChange({ ...node, body: event.target.value })}
        />
        <p className="text-[11px] text-muted-foreground">
          {"Supports {{email}}, {{firstName}}, and {{lastName}} tokens."}
        </p>
      </div>
    </div>
  )
}

function DelayFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "delay" }>
  onChange: (node: AutomationNode) => void
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          id={`delay-${node.id}-amount`}
          label="Wait for"
          field="amount"
          value={node.amount}
          min={1}
          max={10_000}
          step={1}
          onChange={(_field, value) => onChange({ ...node, amount: value })}
        />
        <div className="grid gap-1">
          <Label htmlFor={`delay-${node.id}-unit`} className="text-xs">
            Unit
          </Label>
          <Select
            value={node.unit}
            onValueChange={(unit) =>
              onChange({ ...node, unit: unit as DelayUnit })
            }
          >
            <SelectTrigger id={`delay-${node.id}-unit`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELAY_UNITS.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The run pauses here and wakes up when the delay elapses. Maximum 180
        days.
      </p>
    </div>
  )
}

const BRANCH_FIELD_LABELS: Record<BranchField, string> = {
  tag: "Tag",
  source: "Source",
  email: "Email",
}

const BRANCH_OP_LABELS: Record<BranchOp, string> = {
  has: "has",
  is: "is",
  contains: "contains",
}

function BranchFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "branch" }>
  onChange: (node: AutomationNode) => void
}) {
  const opsForField = BRANCH_OPS_BY_FIELD[node.field]
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`branch-${node.id}-field`} className="text-xs">
            Field
          </Label>
          <Select
            value={node.field}
            onValueChange={(value) => {
              const field = value as BranchField
              const ops = BRANCH_OPS_BY_FIELD[field]
              onChange({
                ...node,
                field,
                // Reset the condition when the new field does not support it.
                op: ops.includes(node.op) ? node.op : ops[0],
              })
            }}
          >
            <SelectTrigger id={`branch-${node.id}-field`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRANCH_FIELDS.map((field) => (
                <SelectItem key={field} value={field}>
                  {BRANCH_FIELD_LABELS[field]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`branch-${node.id}-op`} className="text-xs">
            Condition
          </Label>
          <Select
            value={node.op}
            onValueChange={(op) => onChange({ ...node, op: op as BranchOp })}
          >
            <SelectTrigger id={`branch-${node.id}-op`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opsForField.map((op) => (
                <SelectItem key={op} value={op}>
                  {BRANCH_OP_LABELS[op]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <TextField
        id={`branch-${node.id}-value`}
        label="Value"
        value={node.value}
        maxLength={255}
        hint="Contacts matching the condition follow the Yes path; everyone else follows No."
        onChange={(value) => onChange({ ...node, value })}
      />
    </div>
  )
}

function TagFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "tag" }>
  onChange: (node: AutomationNode) => void
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label htmlFor={`tag-${node.id}-mode`} className="text-xs">
          Mode
        </Label>
        <Select
          value={node.mode}
          onValueChange={(mode) => onChange({ ...node, mode: mode as TagMode })}
        >
          <SelectTrigger id={`tag-${node.id}-mode`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAG_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {mode === "add" ? "Add tags" : "Remove tags"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TagListField
        id={`tag-${node.id}-tags`}
        label="Tags"
        tags={node.tags}
        hint="Comma-separated."
        onChange={(tags) => onChange({ ...node, tags })}
      />
    </div>
  )
}

function WebhookFields({
  node,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "webhook" }>
  onChange: (node: AutomationNode) => void
}) {
  return (
    <div className="grid gap-4">
      <TextField
        id={`webhook-${node.id}-url`}
        label="URL"
        value={node.url}
        placeholder="https://example.com/hooks/contact"
        maxLength={2000}
        hint="The contact is POSTed as JSON. Private and internal addresses are blocked."
        onChange={(url) => onChange({ ...node, url })}
      />
      <TextField
        id={`webhook-${node.id}-note`}
        label="Note (optional)"
        value={node.note}
        maxLength={500}
        onChange={(note) => onChange({ ...node, note })}
      />
    </div>
  )
}
