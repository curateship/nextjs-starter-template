import * as React from "react"
import {
  AlertCircleIcon,
  ChevronDown,
  Loader2Icon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
import { focusRingInset } from "@/lib/focus-ring"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"
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
  // The panel is showing a node picked in the palette that has not been put on
  // the canvas yet — the only state where "Add node" is on offer.
  const previewing = Boolean(onAddNode)

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card",
        className
      )}
    >
      {/* Same 44px header height and hairline as the palette's tab row and the
          activity log's title bar, so the line runs unbroken across all three
          panels. The node's description cannot live here or a wordy node would
          push this panel's heading out of step — it sits at the top of the body
          instead. */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-foreground/10 px-4">
        <h2 className="truncate text-sm font-semibold">
          {selectedNode ? automationNodeName(selectedNode) : "Automation"}
        </h2>
        {previewing ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            Not added yet
          </span>
        ) : null}
        {selectedNode && onToggleFavorite ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${favorite ? "Remove" : "Add"} ${automationNodeName(selectedNode)} ${favorite ? "from" : "to"} favorites`}
            aria-pressed={favorite}
            disabled={savingFavorite}
            onClick={onToggleFavorite}
            className={cn("-mr-1 ml-auto", favorite && "text-amber-500")}
          >
            {savingFavorite ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <StarIcon className={cn("size-4", favorite && "fill-current")} />
            )}
          </Button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          <p className="text-xs text-muted-foreground">
            {selectedNode
              ? automationNodeDescription(selectedNode)
              : "Select a node to view and edit its settings."}
          </p>

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
              {/* A previewed node is not on the canvas, so there is nothing to
                  destroy — backing out only drops the preview. Both call the
                  same thing; only the word and the colour change, because a red
                  "Delete node" beside "Add node" reads as a threat it cannot
                  carry out. */}
              <Button
                type="button"
                variant={previewing ? "outline" : "destructive"}
                size="sm"
                className={cn(!previewing && "col-span-2")}
                onClick={() => onDeleteNode(selectedNode.id)}
              >
                {previewing ? null : <Trash2Icon className="size-4" />}
                {previewing ? "Cancel" : "Delete node"}
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
 *
 * A titled card folds away: hovering it reveals an arrow in the heading,
 * clicking the heading opens and shuts the fields, and the choice is remembered
 * per card in this browser. Same behaviour, and the same arrow, as the cards in
 * Styling settings (`collapsible-settings-card.tsx`).
 */
export function InspectorCard({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    // Plain characters only — the script that keeps a shut card shut before the
    // first paint skips any key it does not recognise on sight.
    collapseStorageKey.settingsCard(
      `automation-node-${(title ?? "").toLowerCase().replace(/[^\w-]+/g, "-")}`
    )
  )

  const shell = "grid gap-3 rounded-xl border border-foreground/10 bg-muted/40 p-3"
  if (!title) return <section className={shell}>{children}</section>

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("group/card", shell)}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/trigger flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left select-none",
            focusRingInset
          )}
        >
          <h3 className="text-sm font-semibold">{title}</h3>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover/card:opacity-100 group-focus-visible/trigger:opacity-100 group-data-[state=closed]/trigger:-rotate-90" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent data-collapse-key={noFlashKey} className="grid gap-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
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
