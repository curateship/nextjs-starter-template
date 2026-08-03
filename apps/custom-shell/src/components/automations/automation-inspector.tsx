import * as React from "react"
import { Link } from "@tanstack/react-router"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  AI_MODEL_OPTIONS,
  AI_PROVIDER_NAMES,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  isAiProvider,
} from "@/lib/ai-models"
import { loadAiKeyStatuses, type AiKeyStatus } from "@/lib/api/ai"
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
  const { scrollRef, fades } = useScrollFades()

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
      <div ref={scrollRef} className="relative min-h-0 flex-1">
        <ScrollArea className="h-full">
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
function ScrollFade({
  edge,
  show,
}: {
  edge: "top" | "bottom"
  show: boolean
}) {
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
      <InspectorNote>
        This step isn't available in this app, so it has no settings here. You
        can delete it; the rest of the flow is unaffected.
      </InspectorNote>
    )
  }
  if (node.kind === "placeholder") {
    return <PlaceholderFields node={node} onChange={onChange} />
  }
  if (node.kind === "aiStep") {
    return <AiStepFields node={node} onChange={onChange} />
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

  // The card is grey so the fields sitting on it can be white and read as the
  // parts you type into. Setting that here, once, means a node task writing new
  // fields gets it for free and cannot forget.
  const shell = cn(
    "grid gap-3 rounded-xl border border-foreground/5 bg-muted/60 p-3",
    "[&_[data-slot=input]]:bg-background [&_[data-slot=select-trigger]]:bg-background [&_[data-slot=textarea]]:bg-background"
  )
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

/**
 * A box of information inside a card — something the panel is telling you
 * rather than something you fill in. White on the card's grey, like the fields,
 * so it stands off the card instead of dissolving into it.
 */
export function InspectorNote({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-foreground/10 bg-background p-3 text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}

function AiStepFields({
  node,
  onChange,
}: {
  node: AutomationNode
  onChange: (node: AutomationNode) => void
}) {
  const provider = isAiProvider(node.settings.provider)
    ? node.settings.provider
    : "anthropic"
  const model =
    typeof node.settings.model === "string" ? node.settings.model : ""
  const instructions =
    typeof node.settings.instructions === "string"
      ? node.settings.instructions
      : ""
  const models = AI_MODEL_OPTIONS[provider]
  const modelKnown = models.some((option) => option.id === model)

  // Which providers have a key, so a step whose provider has none can say so
  // here instead of the flow failing quietly at run time. Advisory only — a
  // failed load just hides the note rather than blocking the panel.
  const [keyStatuses, setKeyStatuses] = React.useState<AiKeyStatus[] | null>(
    null
  )
  React.useEffect(() => {
    let cancelled = false
    loadAiKeyStatuses()
      .then((statuses) => {
        if (!cancelled) setKeyStatuses(statuses)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  const keyStatus = keyStatuses?.find((status) => status.provider === provider)
  const keyMissing = keyStatuses !== null && !keyStatus?.configured

  const setSettings = (settings: Record<string, unknown>) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`ai-step-${node.id}-provider`}
          className="text-xs"
          hint="Whose AI answers this step. It runs with the key saved for that provider in Settings → AI."
        >
          Provider
        </FieldLabel>
        <Select
          value={provider}
          onValueChange={(value) => {
            if (!isAiProvider(value)) return
            // A model belongs to its provider, so switching provider moves
            // the step onto that provider's default model.
            setSettings({ provider: value, model: DEFAULT_AI_MODEL[value] })
          }}
        >
          <SelectTrigger
            id={`ai-step-${node.id}-provider`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS.map((id) => (
              <SelectItem key={id} value={id}>
                {AI_PROVIDER_NAMES[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {keyMissing ? (
          <InspectorNote className="mt-1">
            No {AI_PROVIDER_NAMES[provider]} key is saved yet. Add one in{" "}
            <Link
              to="/admin/settings/$tab"
              params={{ tab: "ai" }}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Settings → AI
            </Link>{" "}
            before this flow runs.
          </InspectorNote>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`ai-step-${node.id}-model`}
          className="text-xs"
          hint="Which of the provider's models to use. Bigger models write better and cost more per run."
        >
          Model
        </FieldLabel>
        <Select
          value={model || undefined}
          onValueChange={(value) => setSettings({ model: value })}
        >
          <SelectTrigger
            id={`ai-step-${node.id}-model`}
            className="w-full sm:w-fit"
          >
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
            {/* A saved flow can hold a model this app no longer offers; keep
                it selectable so the flow still compiles until it is changed. */}
            {model && !modelKnown ? (
              <SelectItem value={model}>{model}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`ai-step-${node.id}-instructions`}
          className="text-xs"
          hint="What the AI is asked to do when the flow reaches this step. Plain words work best."
        >
          Instructions
        </FieldLabel>
        <Textarea
          id={`ai-step-${node.id}-instructions`}
          value={instructions}
          rows={1}
          maxLength={12_000}
          placeholder="e.g. Summarise this feedback in two sentences."
          className="text-xs"
          onChange={(event) => setSettings({ instructions: event.target.value })}
        />
      </div>
    </InspectorCard>
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
