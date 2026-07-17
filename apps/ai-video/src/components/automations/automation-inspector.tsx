import { PlusIcon, Trash2Icon } from "lucide-react"

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
import type { AutomationCreatorOption } from "@/lib/api/automations"
import {
  MAX_VIDEOS_PER_NODE,
  type AutomationNode,
  type AutomationScheduleUnit,
  type AutomationValidationError,
} from "@/lib/automations/automation"
import {
  automationNodeDescription,
  automationNodeIcon,
  automationNodeName,
} from "@/lib/automations/node-registry"

import { AutomationNodeIcon } from "./automation-node-icon"

// Right-hand settings panel for the selected node. Preview nodes (picked in
// the palette but not on the canvas yet) get an Add button instead of Delete.
export function AutomationInspector({
  selectedNode,
  isPreview,
  errors,
  creators,
  onNodeChange,
  onAddNode,
  onDeleteNode,
}: {
  selectedNode: AutomationNode | null
  isPreview: boolean
  errors: AutomationValidationError[]
  creators: AutomationCreatorOption[]
  onNodeChange: (node: AutomationNode) => void
  onAddNode: (node: AutomationNode) => void
  onDeleteNode: (nodeId: string) => void
}) {
  if (!selectedNode) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex min-h-10 shrink-0 items-center border-b p-4">
          <h2 className="text-xs font-semibold tracking-wide uppercase">
            Inspector
          </h2>
        </div>
        <p className="p-4 text-xs text-muted-foreground">
          Select a node on the canvas to edit its settings, or pick one from
          the palette to preview it.
        </p>
      </div>
    )
  }

  const nodeErrors = errors.filter(
    (error) => error.nodeId === selectedNode.id
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b p-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <AutomationNodeIcon
            icon={automationNodeIcon(selectedNode)}
            className="size-3.5"
          />
        </span>
        <h2 className="min-w-0 truncate text-sm font-semibold">
          {automationNodeName(selectedNode)}
        </h2>
        {!isPreview ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${automationNodeName(selectedNode)} node`}
            onClick={() => onDeleteNode(selectedNode.id)}
          >
            <Trash2Icon className="size-4" />
          </Button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-xs text-muted-foreground">
            {automationNodeDescription(selectedNode)}
          </p>

          {nodeErrors.length > 0 ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {nodeErrors.map((error, index) => (
                <p key={index}>{error.message}</p>
              ))}
            </div>
          ) : null}

          <NodeFields
            node={selectedNode}
            creators={creators}
            onNodeChange={onNodeChange}
          />
        </div>
      </ScrollArea>

      {isPreview ? (
        <div className="shrink-0 border-t p-3">
          <Button
            type="button"
            size="sm"
            className="h-8 w-full"
            onClick={() => onAddNode(selectedNode)}
          >
            <PlusIcon className="size-3.5" />
            Add node
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function NodeFields({
  node,
  creators,
  onNodeChange,
}: {
  node: AutomationNode
  creators: AutomationCreatorOption[]
  onNodeChange: (node: AutomationNode) => void
}) {
  switch (node.kind) {
    case "manualTrigger":
      return (
        <p className="text-xs text-muted-foreground">
          No settings — press Run in the toolbar to start this automation.
        </p>
      )
    case "scheduleTrigger":
      return (
        <div className="grid gap-2">
          <div className="grid gap-1">
            <Label htmlFor="automation-schedule-every">Run every</Label>
            <div className="flex gap-2">
              <Input
                id="automation-schedule-every"
                type="number"
                min={1}
                max={10000}
                value={node.every}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10)
                  onNodeChange({
                    ...node,
                    every: Number.isFinite(parsed) ? Math.max(1, parsed) : 1,
                  })
                }}
                className="h-8 w-24"
              />
              <Select
                value={node.unit}
                onValueChange={(unit) =>
                  onNodeChange({
                    ...node,
                    unit: unit as AutomationScheduleUnit,
                  })
                }
              >
                <SelectTrigger
                  className="flex-1"
                  aria-label="Schedule interval unit"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scheduled runs only fire while the automation is enabled.
            </p>
          </div>
        </div>
      )
    case "creatorPostedTrigger":
      return (
        <div className="grid gap-1">
          <Label htmlFor="automation-creator-posted">Creator</Label>
          <CreatorSelect
            id="automation-creator-posted"
            value={node.creatorId}
            creators={creators}
            anyLabel="Any watched creator"
            onChange={(creatorId) => onNodeChange({ ...node, creatorId })}
          />
          <p className="text-[11px] text-muted-foreground">
            Fires when the creator watcher ingests a new video. The creator
            must be watched on the Creators page.
          </p>
        </div>
      )
    case "findNewVideos":
      return (
        <div className="grid gap-2">
          <div className="grid gap-1">
            <Label htmlFor="automation-find-creator">Creator</Label>
            <CreatorSelect
              id="automation-find-creator"
              value={node.creatorId}
              creators={creators}
              onChange={(creatorId) => onNodeChange({ ...node, creatorId })}
            />
          </div>
          <MaxVideosField
            id="automation-find-max"
            label="Max new videos per run"
            value={node.maxVideos}
            onChange={(maxVideos) => onNodeChange({ ...node, maxVideos })}
          />
        </div>
      )
    case "ingestVideos":
      return (
        <MaxVideosField
          id="automation-ingest-max"
          label="Max downloads per run"
          value={node.maxVideos}
          onChange={(maxVideos) => onNodeChange({ ...node, maxVideos })}
          help="Each download costs a video analysis, so keep this small."
        />
      )
    case "createTemplate":
      return (
        <NamePrefixField
          id="automation-template-name"
          label="Template name"
          placeholder="Video title when empty"
          value={node.namePrefix}
          onChange={(namePrefix) => onNodeChange({ ...node, namePrefix })}
        />
      )
    case "createProject":
      return (
        <NamePrefixField
          id="automation-project-name"
          label="Project name"
          placeholder="Template name when empty"
          value={node.namePrefix}
          onChange={(namePrefix) => onNodeChange({ ...node, namePrefix })}
        />
      )
  }
}

function CreatorSelect({
  id,
  value,
  creators,
  anyLabel,
  onChange,
}: {
  id: string
  value: string
  creators: AutomationCreatorOption[]
  anyLabel?: string
  onChange: (creatorId: string) => void
}) {
  const ANY = "__any__"
  if (creators.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No creators yet — add one on the Creators page first.
      </p>
    )
  }
  return (
    <Select
      value={value || (anyLabel ? ANY : "")}
      onValueChange={(next) => onChange(next === ANY ? "" : next)}
    >
      <SelectTrigger id={id} aria-label="Creator">
        <SelectValue placeholder="Pick a creator…" />
      </SelectTrigger>
      <SelectContent position="popper">
        {anyLabel ? <SelectItem value={ANY}>{anyLabel}</SelectItem> : null}
        {creators.map((creator) => (
          <SelectItem key={creator.id} value={creator.id}>
            {creator.label}
            {creator.watch ? " · watched" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function MaxVideosField({
  id,
  label,
  value,
  help,
  onChange,
}: {
  id: string
  label: string
  value: number
  help?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        max={MAX_VIDEOS_PER_NODE}
        value={value}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10)
          onChange(
            Number.isFinite(parsed)
              ? Math.min(MAX_VIDEOS_PER_NODE, Math.max(1, parsed))
              : 1
          )
        }}
        className="h-8 w-24"
      />
      {help ? (
        <p className="text-[11px] text-muted-foreground">{help}</p>
      ) : null}
    </div>
  )
}

function NamePrefixField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        maxLength={120}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-8"
      />
    </div>
  )
}
