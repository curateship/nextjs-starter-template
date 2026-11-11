import * as React from "react"
import { LayoutGridIcon, LayoutTemplateIcon, PlusIcon, StarIcon, type LucideIcon } from "lucide-react"

import { EmptyRow } from "@/components/shared/feed-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
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
  headerStart,
}: {
  className?: string
  /** At the header's start: the step list's collapse button on the Automations dashboard. */
  headerStart?: React.ReactNode
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
    <div
      className={cn(
        "@container/palette flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card",
        className
      )}
    >
      {/* Words only, no icons, drawn as Settings → Styling says, pills or
          underlined, like every dashboard's tabs (Tyler, 9 Nov 2026: "remove
          icons and wire the tabs styling to the setting"). On the step
          list's header they sit at the right, after the collapse button. */}
      <DashboardCardHeader className="gap-1">
        {headerStart}
        <DashboardTabs
          className={cn("min-w-0", headerStart ? "ml-auto flex-initial" : "")}
          value={tab}
          onValueChange={(value) => setTab(value as PaletteView)}
          tabs={[
            { value: "fav", label: <PaletteTabLabel icon={StarIcon}>Fav</PaletteTabLabel> },
            { value: "all", label: <PaletteTabLabel icon={LayoutGridIcon}>All nodes</PaletteTabLabel> },
            ...(templates
              ? [{ value: "templates", label: <PaletteTabLabel icon={LayoutTemplateIcon}>Templates</PaletteTabLabel> }]
              : []),
          ]}
        />
      </DashboardCardHeader>
      {tab === "fav" || tab === "all" ? (
        <PaletteTab
          key={tab}
          value={tab}
          groups={paletteGroupsFor(tab, favoriteNodeKeys)}
          onSelect={onSelect}
          onAdd={onAdd}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : templates ? (
        <div role="tabpanel" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              <AutomationTemplateCards
                templates={templates.items}
                openTemplateKey={templates.openKey}
                hooks={templates.hooks}
              />
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A tab's word, or its icon when the panel has no room for the words (Tyler,
 * 9 Nov 2026: "remove icons", then "return back the icons for when theres no
 * room for the tabs text"). The three words and the collapse button need
 * 17rem (272px); narrower, each tab is its icon, the word kept for screen readers.
 */
function PaletteTabLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <>
      <Icon aria-hidden className="size-4 @[17rem]/palette:hidden" />
      <span className="sr-only @[17rem]/palette:not-sr-only">{children}</span>
    </>
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
    <div role="tabpanel" className="min-h-0 flex-1 overflow-hidden">
      <ScrollArea className="h-full">
        {/* 6px in, so each card's icon tile (its 1px edge, 1px of frame and 8px padding
            further) starts 16px from the panel's edge, under the step list's
            collapse button (Tyler, 9 Nov 2026: "the items has to align with
            the collapse toggle"). The headings take the same 9px. */}
        <div className="flex flex-col gap-4 px-1.5 py-3">
          {groups.map((group) => (
            <section
              key={group.label}
              aria-labelledby={`palette-${value}-${group.label}`}
            >
              <h2
                id={`palette-${value}-${group.label}`}
                className="mb-2 px-[9px] text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
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
          "flex w-full cursor-grab items-center gap-2 overflow-hidden rounded-lg border bg-card p-2 pr-10 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))]",
          focusRingInset
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <AutomationNodeIcon icon={item.icon} className="size-3.5" />
        </span>
        {/* The name, then the description on one line, cut short with "…"
            (Tyler, 9 Nov 2026: "Remove subheader", then "return the
            subheader but make it shorter"). */}
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-xs font-medium">{item.name}</span>
          <span className="truncate text-[10px] leading-4 text-muted-foreground">{item.description}</span>
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
