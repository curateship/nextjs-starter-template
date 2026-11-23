/**
 * An open recipe's step list, left of its canvas, drawn as the shell's
 * automation step list is (Tyler, 10 Nov 2026: "In recipes, I want to put that
 * back into the left panel, look at how automation dashboard does it and copy
 * its design pattern"). The shell's list reads the automation registry, so the
 * recipe's five steps get this copy of its look: group headings, then a card
 * per step with its name and one line of description. A recipe has no
 * favourites and no templates, so there are no tabs.
 */
import { PlusIcon } from "lucide-react"

import { RecipeNodeIcon } from "@/components/recipes/recipe-node-icon"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import {
  RECIPE_PALETTE_GROUPS,
  RECIPE_PALETTE_ITEMS,
  type RecipePaletteItem,
} from "@/lib/recipes/registry"
import { cn } from "@/lib/utils"

export function RecipePalette({
  headerStart,
  onCanvas,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  /** At the header's start: the button that hides the step list. */
  headerStart: React.ReactNode
  /** The steps already on the canvas, by palette key. A recipe takes each once. */
  onCanvas: ReadonlySet<string>
  onSelect: (key: string) => void
  onAdd: (key: string) => void
  onDragStart: (key: string) => void
  onDragEnd: () => void
}) {
  const groups = RECIPE_PALETTE_GROUPS.map((label) => ({
    label,
    items: RECIPE_PALETTE_ITEMS.filter((item) => item.group === label),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardHeader className="gap-1">{headerStart}</DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        {/* 6px in, so each card's icon tile starts 16px from the panel's edge,
            under the collapse button, as on the automation step list. */}
        <div className="flex flex-col gap-4 px-1.5 py-3">
          {groups.map((group) => (
            <section key={group.label} aria-labelledby={`recipe-palette-${group.label}`}>
              <h2
                id={`recipe-palette-${group.label}`}
                className="mb-2 px-[9px] text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {group.label}
              </h2>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {group.items.map((item) => (
                  <StepCard
                    key={item.key}
                    item={item}
                    placed={onCanvas.has(item.key)}
                    onSelect={onSelect}
                    onAdd={onAdd}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * One step. A press shows it on the right before it is added; the + and a drag
 * onto the canvas add it at once. A step already on the canvas says so, and a
 * press picks that one instead of offering a second copy the recipe would mark
 * red (it takes one Wallet, one Markets and one strategy).
 */
function StepCard({
  item,
  placed,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  item: RecipePaletteItem
  placed: boolean
  onSelect: (key: string) => void
  onAdd: (key: string) => void
  onDragStart: (key: string) => void
  onDragEnd: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        draggable={!placed}
        onClick={() => onSelect(item.key)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy"
          event.dataTransfer.setData("text/plain", item.name)
          onDragStart(item.key)
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "flex w-full items-center gap-2 overflow-hidden rounded-lg border bg-card p-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/30",
          placed ? "cursor-pointer" : "cursor-grab pr-10 active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))]",
          focusRingInset
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <RecipeNodeIcon icon={item.icon} className="size-3.5" />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-xs font-medium">{item.name}</span>
          <span className="truncate text-[10px] leading-4 text-muted-foreground">
            {placed ? "On the canvas" : item.description}
          </span>
        </span>
      </button>
      {placed ? null : (
        <button
          type="button"
          aria-label={`Add ${item.name} step`}
          onClick={() => onAdd(item.key)}
          className={cn(
            "absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[color,background-color,opacity] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground",
            focusRing
          )}
        >
          <PlusIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
