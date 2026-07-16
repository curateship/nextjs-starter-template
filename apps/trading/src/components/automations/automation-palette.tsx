import * as React from "react"
import { PlusIcon, SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AUTOMATION_PALETTE_GROUPS,
  AUTOMATION_PALETTE_ITEMS,
  type AutomationPaletteKey,
} from "@/lib/automations/node-registry"
import { cn } from "@/lib/utils"

import { AutomationNodeIcon } from "./automation-node-icon"

type PaletteItem = (typeof AUTOMATION_PALETTE_ITEMS)[number]

const paletteGroups = AUTOMATION_PALETTE_GROUPS.map((label) => ({
  label,
  items: AUTOMATION_PALETTE_ITEMS.filter((item) => item.group === label),
}))

function paletteGroupsFor(
  view: "fav" | "all",
  favoriteNodeKeys: readonly AutomationPaletteKey[],
  query: string
) {
  const favorites = new Set(favoriteNodeKeys)
  const normalizedQuery = query.trim().toLowerCase()
  return paletteGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (view === "all" || favorites.has(item.key)) &&
          (!normalizedQuery ||
            `${item.name} ${item.description}`
              .toLowerCase()
              .includes(normalizedQuery))
      ),
    }))
    .filter((group) => group.items.length > 0)
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
  favoriteNodeKeys: AutomationPaletteKey[]
  onSelect: (key: AutomationPaletteKey) => void
  onAdd: (key: AutomationPaletteKey) => void
  onDragStart: (key: AutomationPaletteKey) => void
  onDragEnd: () => void
}) {
  const [tab, setTab] = React.useState<"fav" | "all">("fav")
  const [search, setSearch] = React.useState("")
  const query = search.trim().toLowerCase()

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "fav" | "all")}
      className={cn(
        "h-full min-h-0 flex-1 gap-0 overflow-hidden bg-background",
        className
      )}
    >
      <div className="shrink-0 border-b p-3">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="fav" className="flex-none px-3">
            Fav
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-none px-3">
            All nodes
          </TabsTrigger>
        </TabsList>
      </div>
      <PaletteTab
        value="fav"
        groups={paletteGroupsFor("fav", favoriteNodeKeys, query)}
        hasSearch={Boolean(query)}
        onSelect={onSelect}
        onAdd={onAdd}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <PaletteTab
        value="all"
        groups={paletteGroupsFor("all", favoriteNodeKeys, query)}
        hasSearch={Boolean(query)}
        onSelect={onSelect}
        onAdd={onAdd}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <div className="shrink-0 border-t bg-background p-3">
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search nodes…"
            aria-label="Search automation nodes"
            className="h-8 pr-2 pl-8 text-xs"
          />
        </div>
        <p className="pt-2 text-[10px] text-muted-foreground">
          Select to preview · Drag or use + to add.
        </p>
      </div>
    </Tabs>
  )
}

function PaletteTab({
  value,
  groups,
  hasSearch,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  value: "fav" | "all"
  groups: Array<{ label: string; items: PaletteItem[] }>
  hasSearch: boolean
  onSelect: (key: AutomationPaletteKey) => void
  onAdd: (key: AutomationPaletteKey) => void
  onDragStart: (key: AutomationPaletteKey) => void
  onDragEnd: () => void
}) {
  return (
    <TabsContent value={value} className="min-h-0 overflow-hidden">
      <ScrollArea
        className="h-full"
        scrollBarClassName="right-1 data-vertical:w-2"
      >
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
              {hasSearch
                ? "No nodes match that search."
                : value === "fav"
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
  item: PaletteItem
  onSelect: (key: AutomationPaletteKey) => void
  onAdd: (key: AutomationPaletteKey) => void
  onDragStart: (key: AutomationPaletteKey) => void
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
        className="flex w-full cursor-grab items-start gap-2 overflow-hidden rounded-lg border border-foreground/5 bg-card p-2 pr-10 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))]"
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
        className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[color,background-color,opacity] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  )
}
