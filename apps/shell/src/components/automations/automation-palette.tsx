import * as React from "react"
import {
  LayoutGridIcon,
  LayoutTemplateIcon,
  PlusIcon,
  StarIcon,
} from "lucide-react"

import { EmptyRow } from "@/components/shared/feed-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DashboardCardTab,
  DashboardCardTabsHeader,
} from "@/components/shared/dashboard-card-header"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  automationPaletteGroups,
  automationPaletteItems,
  type AutomationPaletteItem,
} from "@/lib/automations/node-registry"
import { cn } from "@/lib/utils"
import { focusRingInset, focusRing } from "@/lib/layout/focus-ring"

import type { AutomationTemplateListItem } from "@/lib/api/automations/automation-templates"

import { AutomationNodeIcon } from "./automation-node-icon"
import {
  AutomationTemplateCards,
  type AutomationTemplateChangeHooks,
} from "./automation-template-cards"

type PaletteView = "fav" | "all" | "templates"

// Read inside the call, never at the top of the file: both lists include what
// the app added, and that is not there yet while modules are loading.
function paletteGroupsFor(
  view: "fav" | "all",
  favoriteNodeKeys: readonly string[]
) {
  const items = automationPaletteItems()
  const favorites = new Set(favoriteNodeKeys)
  return automationPaletteGroups().map((label) => ({
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
  templates,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  className?: string
  favoriteNodeKeys: string[]
  /**
   * The Templates tab: the cards, the template on the canvas when the editor
   * is editing one, and what the editor is told when one changes. Left out,
   * the tab is not drawn.
   */
  templates?: {
    items: AutomationTemplateListItem[]
    openKey?: string
    hooks: AutomationTemplateChangeHooks
  }
  onSelect: (key: string) => void
  onAdd: (key: string) => void
  onDragStart: (key: string) => void
  onDragEnd: () => void
}) {
  // Opening on Fav with nothing starred means the first thing anyone ever sees
  // is the "no favourites yet" line instead of the nodes. Read once, on mount:
  // starring your first node then moves the tab out from under you mid-edit.
  // A template opens on Templates: picking one from that tab reloads the
  // editor, and the list should still be where it was clicked.
  const [tab, setTab] = React.useState<PaletteView>(
    templates?.openKey
      ? "templates"
      : favoriteNodeKeys.length > 0
        ? "fav"
        : "all"
  )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as PaletteView)}
      className={cn(
        "@container/palette h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card",
        className
      )}
    >
      <DashboardCardTabsHeader>
        <DashboardCardTab
          value="fav"
          icon={<StarIcon className="size-4 fill-current" />}
          label={<PaletteTabLabel>Fav</PaletteTabLabel>}
        />
        <DashboardCardTab
          value="all"
          icon={<LayoutGridIcon className="size-4" />}
          label={<PaletteTabLabel>All nodes</PaletteTabLabel>}
        />
        {templates ? (
          <DashboardCardTab
            value="templates"
            icon={<LayoutTemplateIcon className="size-4" />}
            label={<PaletteTabLabel>Templates</PaletteTabLabel>}
          />
        ) : null}
      </DashboardCardTabsHeader>
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
      {templates ? (
        <TabsContent value="templates" className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              <AutomationTemplateCards
                templates={templates.items}
                openTemplateKey={templates.openKey}
                hooks={templates.hooks}
              />
            </div>
          </ScrollArea>
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

/**
 * A tab's name, shown only while the panel has room for all three.
 *
 * Fav, All nodes and Templates need 281px side by side, and the left panel
 * opens at its narrowest, about 170px. Squeezed, the row scrolled sideways
 * and pushed the cards past the panel's edge, so below 308px (the row plus
 * the header's 12px each side) the tabs are their icons, with the name kept
 * for screen readers.
 */
function PaletteTabLabel({ children }: { children: React.ReactNode }) {
  return <span className="sr-only @[19.25rem]/palette:not-sr-only">{children}</span>
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
              {/* A column the panel's own width: an "auto" one grew to the
                  longest name, and at the panel's narrowest the cards ran past
                  its edge. */}
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
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
            <EmptyRow>
              {value === "fav"
                ? "No favorite nodes yet. Open All nodes, select a node, and use the star in its settings."
                : "No nodes are available."}
            </EmptyRow>
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
          "flex w-full cursor-grab items-start gap-2 overflow-hidden rounded-lg border bg-card p-2 pr-10 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))]",
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
