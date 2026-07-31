import * as React from "react"
import { AlertCircleIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import type {
  AutomationNode,
  AutomationValidationError,
} from "@/lib/automations/graph"
import {
  automationNodeDescription,
  automationNodeName,
  isSupportedNode,
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
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card",
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

/**
 * One entry per node kind. A node task adds its fields component here alongside
 * its descriptor module — the registry drives naming/ports, this switch drives
 * the settings panel.
 */
function NodeFields({
  node,
  onChange,
}: {
  node: AutomationNode
  onChange: (node: AutomationNode) => void
}) {
  if (!isSupportedNode(node)) {
    return (
      <p className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
        This step isn't available in this app, so it has no settings here. You
        can delete it; the rest of the flow is unaffected.
      </p>
    )
  }
  if (node.kind === "placeholder") {
    return <PlaceholderFields node={node} onChange={onChange} />
  }
  return null
}

/**
 * A titled card wrapping one group of node settings — the inspector's version
 * of the modal "every section is its own card" rule. Node tasks compose their
 * field panels from one or more of these.
 */
export function InspectorCard({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-3 rounded-xl border border-foreground/10 bg-muted/40 p-3">
      {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
      {children}
    </section>
  )
}

function PlaceholderFields({
  node,
  onChange,
}: {
  node: AutomationNode
  onChange: (node: AutomationNode) => void
}) {
  const note = typeof node.settings.note === "string" ? node.settings.note : ""
  return (
    <InspectorCard title="Settings">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`placeholder-${node.id}-note`}
          className="text-xs"
          hint="Shown as the step's description on the canvas."
        >
          Note (optional)
        </FieldLabel>
        <Textarea
          id={`placeholder-${node.id}-note`}
          value={note}
          rows={1}
          maxLength={500}
          placeholder="What should this step become?"
          className="text-xs"
          onChange={(event) =>
            onChange({
              ...node,
              settings: { ...node.settings, note: event.target.value },
            })
          }
        />
      </div>
    </InspectorCard>
  )
}
