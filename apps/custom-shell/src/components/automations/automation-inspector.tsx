import * as React from "react"
import {
  AlertCircleIcon,
  Loader2Icon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"

import { InspectorNote } from "@/components/automations/inspector-card"
import { AutomationNodeIcon } from "@/components/automations/automation-node-icon"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type {
  AutomationGraph,
  AutomationNode,
  AutomationValidationError,
} from "@/lib/automations/graph"
import {
  automationNodeDescription,
  automationNodeFields,
  automationNodeIcon,
  automationNodeName,
  isSupportedNode,
} from "@/lib/automations/node-registry"
import { cn } from "@/lib/utils"

export function AutomationInspector({
  className,
  selectedNode,
  graph,
  errors,
  favorite,
  savingFavorite,
  onNodeChange,
  onOpenNodeEditor,
  onToggleFavorite,
  onAddNode,
  onDeleteNode,
}: {
  className?: string
  selectedNode: AutomationNode | null
  graph: AutomationGraph
  errors: AutomationValidationError[]
  favorite?: boolean
  savingFavorite?: boolean
  onNodeChange: (node: AutomationNode) => void
  onOpenNodeEditor?: (nodeId: string) => void
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
  const { scrollRef, fades } = useScrollFades()

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card",
        className
      )}
    >
      <WorkspacePanelHeader
        icon={
          selectedNode ? (
            <AutomationNodeIcon
              icon={automationNodeIcon(selectedNode)}
              className="size-4"
            />
          ) : (
            <WorkflowIcon className="size-4" />
          )
        }
        title={selectedNode ? automationNodeName(selectedNode) : "Automation"}
        meta={previewing ? "Not added yet" : undefined}
        action={
          selectedNode && onToggleFavorite ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${favorite ? "Remove" : "Add"} ${automationNodeName(selectedNode)} ${favorite ? "from" : "to"} favorites`}
              aria-pressed={favorite}
              disabled={savingFavorite}
              onClick={onToggleFavorite}
              className={cn(favorite && "text-amber-500 dark:text-amber-400")}
            >
              {savingFavorite ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <StarIcon
                  className={cn("size-4", favorite && "fill-current")}
                />
              )}
            </Button>
          ) : undefined
        }
      />
      <div ref={scrollRef} className="relative min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="grid gap-4 p-4 sm:p-5">
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
                  {selectedNode
                    ? "Fix this node"
                    : "Automation needs attention"}
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
                graph={graph}
                onChange={onNodeChange}
                onOpenEditor={
                  onOpenNodeEditor
                    ? () => onOpenNodeEditor(selectedNode.id)
                    : undefined
                }
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
        {/* The panel is taller than most nodes' settings, so the fades only
            appear on the edge that actually has more content past it —
            a permanent fade over the first line reads as a rendering fault. */}
        <ScrollFade edge="top" show={fades.top} />
        <ScrollFade edge="bottom" show={fades.bottom} />
      </div>
    </div>
  )
}

/** One edge's fade, painted over the scrolling content in the panel's colour. */
function ScrollFade({ edge, show }: { edge: "top" | "bottom"; show: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 h-8 transition-opacity duration-200",
        edge === "top"
          ? "top-0 bg-linear-to-b from-card to-transparent"
          : "bottom-0 bg-linear-to-t from-card to-transparent",
        show ? "opacity-100" : "opacity-0"
      )}
    />
  )
}

/**
 * Which edges of the panel have content hidden past them. The scrolling element
 * is Radix's viewport inside `ScrollArea`, which takes no ref of its own, so it
 * is found by its slot under the wrapper this returns a ref for.
 */
function useScrollFades() {
  const ref = React.useRef<HTMLDivElement>(null)
  const [fades, setFades] = React.useState({ top: false, bottom: false })

  React.useEffect(() => {
    const viewport = ref.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
    if (!viewport) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      setFades({
        top: scrollTop > 1,
        // A rounded-off pixel of overflow is not worth a fade.
        bottom: scrollTop + clientHeight < scrollHeight - 1,
      })
    }
    update()

    viewport.addEventListener("scroll", update, { passive: true })
    // The content grows and shrinks without a scroll — a card folding away, a
    // different node picked, the panel resized — so watch both boxes.
    const resize = new ResizeObserver(update)
    resize.observe(viewport)
    if (viewport.firstElementChild) resize.observe(viewport.firstElementChild)

    return () => {
      viewport.removeEventListener("scroll", update)
      resize.disconnect()
    }
  }, [])

  return { scrollRef: ref, fades }
}

/**
 * A node's settings panel comes from the node itself.
 *
 * Every node points at its own panel file — the shell's four and any an app
 * adds alike. There is no list here to keep in step, which is the point: this
 * is a shell file, and an app could never have added itself to such a list.
 */
function NodeFields({
  node,
  graph,
  onChange,
  onOpenEditor,
}: {
  node: AutomationNode
  graph: AutomationGraph
  onChange: (node: AutomationNode) => void
  onOpenEditor?: () => void
}) {
  if (!isSupportedNode(node)) {
    return (
      <InspectorNote>
        This step isn't available in this app, so it has no settings here. You
        can delete it; the rest of the flow is unaffected.
      </InspectorNote>
    )
  }
  const fields = automationNodeFields(node)
  if (!fields) return null
  // The panel is in its own file and arrives a moment later, so it needs
  // somewhere to wait. Nothing is drawn meanwhile: it is a local file on an
  // already-loaded page, so a spinner would flash and go rather than tell
  // anyone anything.
  //
  // `createElement` rather than `<Fields …>` because the registry hands the
  // component back rather than building it here, and the lint rule that catches
  // components made during a render cannot tell those two apart.
  return (
    <React.Suspense fallback={null}>
      {React.createElement(fields, {
        key: node.id,
        node,
        graph,
        onChange,
        onOpenEditor,
      })}
    </React.Suspense>
  )
}
