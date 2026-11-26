import * as React from "react"
import { closestCenter, DndContext } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import {
  ArrowRightLeftIcon,
  GripVerticalIcon,
  InboxIcon,
  ListOrderedIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"

import { RecordFrame } from "@/components/crm/record-frame"
import { DRAG_HANDLE_CLASS, reorderByDrag, useNavSensors, useSortableRow } from "@/components/settings/nav-editor-shared"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AutomationGraph, AutomationNode, AutomationValidationError } from "@/lib/automations/graph"
import type { FlowDetail } from "@/lib/api/video/flow"
import { cn } from "@/lib/utils"
import { formatAiEstimate } from "@/lib/video/ai-estimates"
import {
  createFlowBox,
  FLOW_BOX_INFO,
  FLOW_BOX_KINDS,
  FLOW_BOXES_MAX,
  FLOW_GUIDE_LINE_MAX,
  FLOW_GUIDE_TEXT_MAX,
  FLOW_KIND_INFO,
  FLOW_PROMPT_MAX,
  FLOW_TITLE_MAX,
  flowKindOf,
  PRICE_FIRST_KINDS,
  flowNodeName,
  readFlowNodeSettings,
  storedFlowSettings,
  type FlowBox,
  type FlowKind,
  type FlowNodeSettings,
} from "@/lib/video/flow/node-kinds"

import { FlowMakingCard } from "./flow-making-card"
import { FlowDetailsFields } from "./flow-panel"

const HIDE_LABEL = "Hide the node"

/**
 * The builder's right panel with a node picked.
 *
 * - **Node:** its title, prompt, "Wait for my OK" and about what it costs.
 * - **What it makes:** for an AI clip, music or sound node, how it is made,
 *   and its price a run (`flow-making-card.tsx`).
 * - **Asks you for:** the boxes the node asks for on its step of a run, such
 *   as a Transcript or a Raw video, each named here. They are part of the
 *   node, as an automation's Send email holds its own email (Tyler,
 *   14 Nov 2026: "even the other canvas dashboard does not have nodes for a
 *   single use like you did here"). The card's + adds one; each row's grip
 *   drags it into a new order.
 * - **Guide:** the step's words in a run's stepped guide.
 * - **Lines:** what it reads from and hands on to.
 *
 * Every change is saved with the canvas.
 */
export function FlowNodePanel({
  node,
  graph,
  errors,
  prices,
  onChange,
  onAdd,
  onDelete,
}: {
  node: AutomationNode
  graph: AutomationGraph
  errors: AutomationValidationError[]
  prices: Record<FlowKind, number> | null
  onChange: (node: AutomationNode) => void
  /** Set while the node is only shown, pressed in the nodes panel: Add node puts it on the canvas. */
  onAdd?: () => void
  onDelete: () => void
}) {
  const kind = flowKindOf(node.kind)
  const settings = readFlowNodeSettings(node.settings)
  const Icon = kind ? FLOW_KIND_INFO[kind].icon : WorkflowIcon
  const set = (change: Partial<FlowNodeSettings>) => onChange({ ...node, settings: storedFlowSettings({ ...settings, ...change }) })
  const names = new Map(graph.nodes.map((one) => [one.id, flowNodeName(one)]))
  const from = graph.edges.filter((edge) => edge.to === node.id).map((edge) => names.get(edge.from) ?? "Removed node")
  const to = graph.edges.filter((edge) => edge.from === node.id).map((edge) => names.get(edge.to) ?? "Removed node")
  const problems = errors.filter((error) => error.nodeId === node.id)
  const [addOpen, setAddOpen] = React.useState(false)
  const sensors = useNavSensors()

  return (
    <RecordFrame
      avatar={<Icon aria-hidden />}
      title={flowNodeName(node)}
      line={onAdd ? "Not on the canvas yet" : kind ? FLOW_KIND_INFO[kind].name : "Unknown node"}
      hideLabel={HIDE_LABEL}
      body={
        <>
          <PanelCard storageId="video-flow-node" icon={<SettingsIcon />} title="Node">
            <div className="grid gap-4">
              {problems.map((problem) => (
                <p key={problem.message} className="text-sm text-destructive">
                  {problem.message}
                </p>
              ))}
              <div className="grid gap-2">
                <FieldLabel htmlFor={`flow-node-title-${node.id}`} hint="The name on the canvas and on the run's step.">
                  Title
                </FieldLabel>
                <Input
                  id={`flow-node-title-${node.id}`}
                  value={settings.title}
                  maxLength={FLOW_TITLE_MAX}
                  placeholder={kind ? FLOW_KIND_INFO[kind].name : ""}
                  onChange={(event) => set({ title: event.target.value })}
                />
              </div>
              {kind ? (
                <>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor={`flow-node-prompt-${node.id}`}
                      hint="How every video of this flow is built at this step, never what is in one video. Each run adds that video's own prompt, then what its boxes hold and what each line into it made."
                    >
                      Prompt
                    </FieldLabel>
                    <Textarea
                      id={`flow-node-prompt-${node.id}`}
                      rows={4}
                      value={settings.prompt}
                      maxLength={FLOW_PROMPT_MAX}
                      aria-invalid={!settings.prompt.trim() || undefined}
                      placeholder="Say how every video is built at this step."
                      onChange={(event) => set({ prompt: event.target.value })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel
                      htmlFor={`flow-node-ok-${node.id}`}
                      hint="On, the run stops after this node so you can read what it made, change it, or make it again."
                    >
                      Wait for my OK
                    </FieldLabel>
                    <Switch
                      id={`flow-node-ok-${node.id}`}
                      checked={settings.waitForOk}
                      onCheckedChange={(checked) => set({ waitForOk: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel
                      htmlFor={`flow-node-idea-${node.id}`}
                      hint="On, each run opens this step with an idea from the AI for that video's prompt, different from the flow's earlier videos. You can edit it or ask for a new one."
                    >
                      AI suggests each video's prompt
                    </FieldLabel>
                    <Switch
                      id={`flow-node-idea-${node.id}`}
                      checked={settings.suggestPrompt}
                      onCheckedChange={(checked) => set({ suggestPrompt: checked })}
                    />
                  </div>
                  {prices && !PRICE_FIRST_KINDS.has(kind) ? (
                    <p className="text-xs text-muted-foreground">
                      From {formatAiEstimate(prices[kind])} a run. The run works it out again once it knows what it reads.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </PanelCard>
          {kind === "ai-clip" || kind === "ai-music" || kind === "ai-sound" ? (
            <FlowMakingCard nodeId={node.id} kind={kind} settings={settings} set={set} />
          ) : null}
          {kind ? (
            <PanelCard
              storageId="video-flow-node-asks"
              icon={<InboxIcon />}
              title="Asks you for"
              meta={settings.asks.length ? String(settings.asks.length) : undefined}
              actionOpen={addOpen}
              action={
                settings.asks.length < FLOW_BOXES_MAX ? (
                  <FoldingMenu
                    label="Add a box"
                    fit
                    align="end"
                    open={addOpen}
                    onOpenChange={setAddOpen}
                    trigger={
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Add a box">
                        <PlusIcon className="size-4" />
                      </Button>
                    }
                  >
                    {FLOW_BOX_KINDS.map((boxKind) => {
                      const BoxIcon = FLOW_BOX_INFO[boxKind].icon
                      return (
                        <MenuAction
                          key={boxKind}
                          icon={<BoxIcon className="size-4" />}
                          onClick={() => {
                            setAddOpen(false)
                            set({ asks: [...settings.asks, createFlowBox(boxKind, crypto.randomUUID())] })
                          }}
                        >
                          {FLOW_BOX_INFO[boxKind].name}
                        </MenuAction>
                      )
                    })}
                  </FoldingMenu>
                ) : undefined
              }
            >
              {settings.asks.length ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => {
                    const moved = reorderByDrag(
                      settings.asks,
                      settings.asks.map((box) => box.id),
                      event
                    )
                    if (moved) set({ asks: moved })
                  }}
                >
                  <SortableContext items={settings.asks.map((box) => box.id)} strategy={verticalListSortingStrategy}>
                    <div className="grid gap-3">
                      {settings.asks.map((box) => (
                        <BoxRow
                          key={box.id}
                          box={box}
                          onRename={(label) =>
                            set({ asks: settings.asks.map((one) => (one.id === box.id ? { ...one, label } : one)) })
                          }
                          onOptional={(optional) =>
                            set({
                              asks: settings.asks.map((one) =>
                                one.id === box.id ? { ...one, optional: optional || undefined } : one
                              ),
                            })
                          }
                          onRemove={() => set({ asks: settings.asks.filter((one) => one.id !== box.id) })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing. The + adds a box this step asks you for, such as a transcript to paste or a video to upload.
                </p>
              )}
            </PanelCard>
          ) : null}
          {kind ? (
            <PanelCard storageId="video-flow-node-guide" icon={<ListOrderedIcon />} title="Guide">
              <div className="grid gap-4">
                <p className="text-xs text-muted-foreground">What this step shows in a run's stepped guide. An empty one doesn't show.</p>
                <GuideField
                  id={`flow-node-heading-${node.id}`}
                  label="Heading"
                  hint="The big words over the step. Empty uses the title."
                  value={settings.heading}
                  max={FLOW_TITLE_MAX}
                  placeholder={flowNodeName(node)}
                  onChange={(heading) => set({ heading })}
                />
                <GuideField
                  id={`flow-node-line-${node.id}`}
                  label="Short line"
                  hint="Under the heading, in grey."
                  value={settings.line}
                  max={FLOW_GUIDE_LINE_MAX}
                  onChange={(line) => set({ line })}
                />
                <GuideField
                  id={`flow-node-explanation-${node.id}`}
                  label="Explanation"
                  hint="Under the step's card: what to do and why."
                  value={settings.explanation}
                  max={FLOW_GUIDE_TEXT_MAX}
                  long
                  onChange={(explanation) => set({ explanation })}
                />
                <GuideField
                  id={`flow-node-tip-${node.id}`}
                  label="Tip"
                  hint="In a grey box on the right, under the step's boxes."
                  value={settings.tip}
                  max={FLOW_GUIDE_TEXT_MAX}
                  long
                  onChange={(tip) => set({ tip })}
                />
                <GuideField
                  id={`flow-node-button-${node.id}`}
                  label="Button"
                  hint="The button that has the AI make this step."
                  value={settings.button}
                  max={FLOW_TITLE_MAX}
                  placeholder={FLOW_KIND_INFO[kind].button}
                  onChange={(button) => set({ button })}
                />
              </div>
            </PanelCard>
          ) : null}
          <PanelCard storageId="video-flow-node-lines" icon={<ArrowRightLeftIcon />} title="Lines">
            <div className="grid gap-3 text-sm">
              <div className="grid gap-0.5">
                <span className="text-xs text-muted-foreground">Reads from</span>
                <span>{from.length ? from.join(", ") : "Nothing. It can start as soon as the run does."}</span>
              </div>
              <div className="grid gap-0.5">
                <span className="text-xs text-muted-foreground">Hands on to</span>
                <span>
                  {onAdd ? "Not on the canvas yet. Add node puts it there." : to.length ? to.join(", ") : "Nothing yet. Drag from its dot to another node."}
                </span>
              </div>
            </div>
          </PanelCard>
        </>
      }
      footer={
        onAdd ? (
          <Button type="button" className="w-full" onClick={onAdd}>
            <PlusIcon />
            Add node
          </Button>
        ) : (
          <Button type="button" variant="outline" className="w-full" onClick={onDelete}>
            <Trash2Icon />
            Delete node
          </Button>
        )
      }
    />
  )
}

/** The builder's right panel with no node picked: the flow's own name and description, and what stops it running. */
export function FlowSettingsPanel({ flow, errors }: { flow: FlowDetail; errors: AutomationValidationError[] }) {
  return (
    <RecordFrame
      avatar={<WorkflowIcon aria-hidden />}
      title={flow.name}
      line="Pick a node to change it"
      hideLabel="Hide the flow"
      body={
        <>
          <PanelCard storageId="video-flow-builder-details" icon={<WorkflowIcon />} title="The flow">
            <FlowDetailsFields flow={flow} />
          </PanelCard>
          <PanelCard storageId="video-flow-builder-problems" icon={<SettingsIcon />} title="Before it can run">
            {errors.length ? (
              <ul className="grid gap-2 text-sm text-destructive">
                {errors.map((error) => (
                  <li key={`${error.code}:${error.nodeId ?? error.edgeId ?? ""}`}>{error.message}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to fix. Run starts it, and its last step saves it into a project.</p>
            )}
          </PanelCard>
        </>
      }
    />
  )
}

/**
 * One box the node asks for, in a light grey card of its own (Tyler, 14 Nov
 * 2026: "put each of them in a light gray bg card"): its kind over it, then a
 * grip, its name, on white so it still reads as a field, and a bin. The grip drags it up or down the list (Tyler, 14 Nov 2026: "i want to
 * drag and drop this"), and the order is the order the step shows them in.
 * Only the grip picks the row up, so typing in the name never starts a drag.
 */
function BoxRow({
  box,
  onRename,
  onOptional,
  onRemove,
}: {
  box: FlowBox
  onRename: (label: string) => void
  onOptional: (optional: boolean) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } = useSortableRow(box.id, true)
  const BoxIcon = FLOW_BOX_INFO[box.kind].icon
  const name = box.label || FLOW_BOX_INFO[box.kind].label
  return (
    <div ref={setNodeRef} style={style} className={cn("relative grid gap-2 rounded-xl bg-muted/60 p-3", isDragging && "z-10 shadow-md")}>
      <FieldLabel htmlFor={`flow-node-box-${box.id}`} hint={FLOW_BOX_INFO[box.kind].description}>
        <span className="flex items-center gap-1.5">
          <BoxIcon aria-hidden className="size-3.5 text-muted-foreground" />
          {FLOW_BOX_INFO[box.kind].name}
        </span>
      </FieldLabel>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(DRAG_HANDLE_CLASS, "-ml-1.5 shrink-0")}
          aria-label={`Move the ${name} box`}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <Input
          id={`flow-node-box-${box.id}`}
          className="bg-background"
          value={box.label}
          maxLength={FLOW_TITLE_MAX}
          placeholder={FLOW_BOX_INFO[box.kind].label}
          onChange={(event) => onRename(event.target.value)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove the ${name} box`} onClick={onRemove}>
              <Trash2Icon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove the box</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel
          htmlFor={`flow-node-box-optional-${box.id}`}
          hint="The step's button works with this box empty, and the node gets nothing from it."
        >
          Can be left empty
        </FieldLabel>
        <Switch
          id={`flow-node-box-optional-${box.id}`}
          checked={!!box.optional}
          onCheckedChange={onOptional}
        />
      </div>
    </div>
  )
}

/** One of the guide's words, saved with the canvas. */
function GuideField({
  id,
  label,
  hint,
  value,
  max,
  placeholder,
  long = false,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  max: number
  placeholder?: string
  long?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      {long ? (
        <Textarea id={id} rows={2} value={value} maxLength={max} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input id={id} value={value} maxLength={max} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  )
}
