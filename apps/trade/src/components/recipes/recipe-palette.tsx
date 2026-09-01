/**
 * Deliberate Trade-owned fork of the shell palette. Recipes have one fixed
 * Trading group and do not share automation favorites or template steps.
 */
import { PlusIcon, WorkflowIcon } from "lucide-react"

import { RecipeNodeIcon } from "@/components/recipes/recipe-node-icon"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import {
  RECIPE_PALETTE_GROUPS,
  RECIPE_PALETTE_ITEMS,
  type RecipePaletteItem,
} from "@/lib/recipes/registry"
import { cn } from "@/lib/utils"

export function RecipePalette({
  className,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  className?: string
  onSelect: (key: string) => void
  onAdd: (key: string) => void
  onDragStart: (key: string) => void
  onDragEnd: () => void
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card",
        className
      )}
    >
      <DashboardCardTitleHeader
        icon={<WorkflowIcon className="size-4" />}
        title="Steps"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {RECIPE_PALETTE_GROUPS.map((group) => (
            <section key={group} aria-labelledby={`recipe-palette-${group}`}>
              <h2
                id={`recipe-palette-${group}`}
                className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {group}
              </h2>
              <div className="grid gap-2">
                {RECIPE_PALETTE_ITEMS.filter(
                  (item) => item.group === group
                ).map((item) => (
                  <PaletteNodeCard
                    key={item.key}
                    item={item}
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

function PaletteNodeCard({
  item,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  item: RecipePaletteItem
  onSelect: (key: string) => void
  onAdd: (key: string) => void
  onDragStart: (key: string) => void
  onDragEnd: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        draggable
        onClick={() => onSelect(item.key)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy"
          event.dataTransfer.setData("text/plain", item.name)
          onDragStart(item.key)
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "flex w-full cursor-grab items-start gap-2 overflow-hidden rounded-lg border bg-card p-2 pr-10 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))]",
          focusRingInset
        )}
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <RecipeNodeIcon icon={item.icon} className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate text-xs font-medium">
            {item.name}
          </span>
          <span
            className="line-clamp-2 text-[10px] leading-4 text-muted-foreground"
            title={item.description}
          >
            {item.description}
          </span>
        </span>
      </button>
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
    </div>
  )
}
