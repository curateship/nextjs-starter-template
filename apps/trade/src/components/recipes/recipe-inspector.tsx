/**
 * Deliberate Trade-owned fork of the shell inspector. The recipe registry is
 * the only source of steps and settings panels used here.
 */
import * as React from "react"
import {
  AlertCircleIcon,
  PlusIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"

import { InspectorNote } from "@/components/automations/inspector-card"
import { RecipeNodeIcon } from "@/components/recipes/recipe-node-icon"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { InlineError } from "@/components/ui/inline-error"
import { ScrollArea } from "@/components/ui/scroll-area"
import type {
  AutomationGraph,
  AutomationNode,
  AutomationValidationError,
} from "@/lib/automations/graph"
import {
  recipeNodeDescription,
  recipeNodeFields,
  recipeNodeIcon,
  recipeNodeName,
  recipeNodeIsSupported,
} from "@/lib/recipes/registry"
import { cn } from "@/lib/utils"

export function RecipeInspector({
  className,
  selectedNode,
  graph,
  errors,
  onNodeChange,
  onOpenNodeEditor,
  headerEnd,
  onAddNode,
  onDeleteNode,
}: {
  className?: string
  selectedNode: AutomationNode | null
  graph: AutomationGraph
  errors: AutomationValidationError[]
  onNodeChange: (node: AutomationNode) => void
  onOpenNodeEditor?: (nodeId: string) => void
  /** The end of the header: the collapse button at the panel's edge. */
  headerEnd?: React.ReactNode
  /** Given while the step shown was pressed in the step list and is not on the canvas yet. */
  onAddNode?: (node: AutomationNode) => void
  onDeleteNode: (nodeId: string) => void
}) {
  const nodeErrors = selectedNode
    ? errors.filter((error) => error.nodeId === selectedNode.id)
    : errors
  const previewing = Boolean(onAddNode)
  const { scrollRef, fades } = useScrollFades()

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card",
        className
      )}
    >
      <DashboardCardTitleHeader
        icon={
          selectedNode ? (
            <RecipeNodeIcon
              icon={recipeNodeIcon(selectedNode)}
              className="size-4"
            />
          ) : (
            <WorkflowIcon className="size-4" />
          )
        }
        title={selectedNode ? recipeNodeName(selectedNode) : "Recipe"}
        meta={previewing ? "Not added yet" : undefined}
        action={headerEnd}
      />
      <div ref={scrollRef} className="relative min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="grid gap-4 p-4 sm:p-5">
            <p className="text-xs text-muted-foreground">
              {selectedNode
                ? recipeNodeDescription(selectedNode)
                : "Select a node to view and edit its settings."}
            </p>

            {nodeErrors.length > 0 ? (
              <InlineError className="grid gap-1">
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <AlertCircleIcon className="size-3.5" />
                  {selectedNode ? "Fix this node" : "Recipe needs attention"}
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
              </InlineError>
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

            {selectedNode && onAddNode ? (
              // Not on the canvas yet, so backing out only lets go of it:
              // Cancel, never a red Delete beside Add step.
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" onClick={() => onAddNode(selectedNode)}>
                  <PlusIcon className="size-4" />
                  Add step
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onDeleteNode(selectedNode.id)}>
                  Cancel
                </Button>
              </div>
            ) : selectedNode ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDeleteNode(selectedNode.id)}
              >
                <Trash2Icon className="size-4" />
                Delete step
              </Button>
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
 * Every recipe step points at its own panel file. The private recipe registry
 * keeps this component free of a second list that could drift out of date.
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
  if (!recipeNodeIsSupported(node)) {
    return (
      <InspectorNote>
        This step isn't available in Recipes, so it has no settings here. You
        can delete it; the rest of the recipe is unaffected.
      </InspectorNote>
    )
  }
  const fields = recipeNodeFields(node)
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
