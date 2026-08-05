import * as React from "react"
import { LayoutGridIcon, PlusIcon, StarIcon } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AUTOMATION_PALETTE_GROUPS,
  automationPaletteItems,
  type AutomationPaletteItem,
} from "@/lib/automations/node-registry"
import { cn } from "@/lib/utils"
import { focusRingInset, focusRing } from "@/lib/focus-ring"

import { AutomationNodeIcon } from "./automation-node-icon"

// Read inside the call, never at the top of the file: the list includes any
// steps the app added, and those are not there yet while modules are loading.
function paletteGroupsFor(
  view: "fav" | "all",
  favoriteNodeKeys: readonly string[]
) {
  const items = automationPaletteItems()
  const favorites = new Set(favoriteNodeKeys)
  return AUTOMATION_PALETTE_GROUPS.map((label) => ({
    label,
    items: items.filter(
      (item) =>
        item.group === label && (view === "all" || favorites.has(item.key))
    ),
  })).filter((group) => group.items.length > 0)
}

export function AutomationPalette({
  className,
  favoriteNodeKeys,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  className?: string
  favoriteNodeKeys: string[]
  onSelect: (key: string) => void
  onAdd: (key: string) => void
  onDragStart: (key: string) => void
  onDragEnd: () => void
}) {
  // Opening on Fav with nothing starred means the first thing anyone ever sees
  // is the "no favourites yet" line instead of the nodes. Read once, on mount:
  // starring your first node then moves the tab out from under you mid-edit.
  const [tab, setTab] = React.useState<"fav" | "all">(
    favoriteNodeKeys.length > 0 ? "fav" : "all"
  )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "fav" | "all")}
      className={cn(
        "h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card",
        className
      )}
    >
      {/* Underline tabs (per the design mock), not the segmented pill style:
          transparent list on the header's border-b, active trigger drawing a
          2px underline that sits on that line. */}
      <div className="shrink-0 border-b border-foreground/10 px-3">
        <TabsList className="-mb-px h-11 w-full justify-start gap-5 rounded-none bg-transparent p-0">
          <TabsTrigger
            value="fav"
            className="h-full flex-none gap-1.5 rounded-none border-b-2 border-transparent px-0.5 text-muted-foreground data-[state=active]:border-foreground/75 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <StarIcon className="size-4 fill-current" />
            Fav
          </TabsTrigger>
          <TabsTrigger
            value="all"
            className="h-full flex-none gap-1.5 rounded-none border-b-2 border-transparent px-0.5 text-muted-foreground data-[state=active]:border-foreground/75 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <LayoutGridIcon className="size-4" />
            All nodes
          </TabsTrigger>
        </TabsList>
      </div>
      <PaletteTab
        value="fav"
        groups={paletteGroupsFor("fav", favoriteNodeKeys)}
        onSelect={onSelect}
        onAdd={onAdd}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <PaletteTab
        value="all"
        groups={paletteGroupsFor("all", favoriteNodeKeys)}
        onSelect={onSelect}
        onAdd={onAdd}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    </Tabs>
  )
}

function PaletteTab({
  value,
  groups,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  value: "fav" | "all"
  groups: Array<{ label: string; items: AutomationPaletteItem[] }>
  onSelect: (key: string) => void
  onAdd: (key: string) => void
  onDragStart: (key: string) => void
  onDragEnd: () => void
}) {
  return (
    <TabsContent value={value} className="min-h-0 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-4 p-3">
          {groups.map((group) => (
            <section
              key={group.label}
              aria-labelledby={`palette-${value}-${group.label}`}
            >
              <h2
                id={`palette-${value}-${group.label}`}
                className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {group.label}
              </h2>
              <div className="grid gap-2">
                {group.items.map((item) => (
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
          {groups.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {value === "fav"
                ? "No favorite nodes yet. Open All nodes, select a node, and use the star in its settings."
                : "No nodes are available."}
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </TabsContent>
  )
}

function PaletteNodeCard({
  item,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  item: AutomationPaletteItem
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
          "flex w-full cursor-grab items-start gap-2 overflow-hidden rounded-lg border border-foreground/5 bg-card p-2 pr-10 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))]",
          focusRingInset
        )}
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <AutomationNodeIcon icon={item.icon} className="size-3.5" />
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
        aria-label={`Add ${item.name} node`}
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
