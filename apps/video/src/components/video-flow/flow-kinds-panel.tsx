import { PanelLeftCloseIcon, PanelLeftDashedIcon, PlusIcon } from "lucide-react"

import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import { FLOW_KIND_INFO, FLOW_KINDS, type FlowKind } from "@/lib/video/flow/node-kinds"

/**
 * The builder's node kinds, beside the canvas as the automation editor's
 * step list sits beside its canvas (`automation-palette.tsx`): the collapse
 * button at the panel's outer edge, then the panel's name. Every node is an
 * AI node; what it asks you for is a box set inside it, never a node of its
 * own. A press on a card shows the node on the right without adding it (Tyler,
 * 14 Nov 2026: "clicking on a node should not add it"); the card's + adds
 * it in view, and dragging it drops it where it lands.
 */
export function FlowKindsPanel({
  onToggle,
  picked,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  onToggle: () => void
  /** The kind showing on the right, not on the canvas yet. */
  picked: FlowKind | null
  onSelect: (kind: FlowKind) => void
  onAdd: (kind: FlowKind) => void
  onDragStart: (kind: FlowKind) => void
  onDragEnd: () => void
}) {
  return (
    <div className="@container/palette flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardHeader className="gap-1">
        <KindsToggle shut={false} label="Hide the nodes" onClick={onToggle} className="-ml-[13px]" />
        <span className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>Nodes</span>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-1.5 p-3">
          {FLOW_KINDS.map((kind) => (
            <KindCard
              key={kind}
              kind={kind}
              picked={kind === picked}
              onSelect={onSelect}
              onAdd={onAdd}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

/** The nodes panel's collapse button, and the canvas header's button that brings it back. */
export function KindsToggle({
  shut,
  label,
  onClick,
  className,
}: {
  shut: boolean
  label: string
  onClick: () => void
  className?: string
}) {
  const Icon = shut ? PanelLeftDashedIcon : PanelLeftCloseIcon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} className={cn("shrink-0 rounded-lg", className)} onClick={onClick}>
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function KindCard({
  kind,
  picked,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  kind: FlowKind
  picked: boolean
  onSelect: (kind: FlowKind) => void
  onAdd: (kind: FlowKind) => void
  onDragStart: (kind: FlowKind) => void
  onDragEnd: () => void
}) {
  const info = FLOW_KIND_INFO[kind]
  const Icon = info.icon
  return (
    <div className="group relative">
      <button
        type="button"
        draggable
        aria-pressed={picked}
        onClick={() => onSelect(kind)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy"
          event.dataTransfer.setData("text/plain", info.name)
          onDragStart(kind)
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "flex w-full cursor-grab items-center gap-2 overflow-hidden rounded-lg border bg-card p-2 pr-10 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))]",
          picked && "border-primary/40 bg-muted/30",
          focusRingInset
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-xs font-medium">{info.name}</span>
          <span className="truncate text-[10px] leading-4 text-muted-foreground">{info.description}</span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Add ${info.name} node`}
        onClick={() => onAdd(kind)}
        className={cn(
          "absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[color,background-color,opacity] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground",
          focusRing
        )}
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  )
}
