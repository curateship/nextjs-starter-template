"use client";

import { useState, type ComponentType } from "react";
import Bot from "lucide-react/dist/esm/icons/bot.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import FileText from "lucide-react/dist/esm/icons/file-text.js"
import GitBranch from "lucide-react/dist/esm/icons/git-branch.js"
import Globe2 from "lucide-react/dist/esm/icons/earth.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Search from "lucide-react/dist/esm/icons/search.js"

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AUTOMATION_NODE_CATALOG } from "@/features/automations/domain/catalog";
import type { AutomationNodeKind } from "@/features/automations/domain/types";
import { cn } from "@/lib/utils/tailwind";

const GROUPS = ["Triggers", "Sources", "AI", "Actions"] as const;

const ICONS: Record<
  AutomationNodeKind,
  ComponentType<{ className?: string }>
> = {
  time: Clock3,
  scraper: Globe2,
  router: GitBranch,
  agent: Bot,
  post: FileText,
};

type PaletteItem = (typeof AUTOMATION_NODE_CATALOG)[number];

export function AutomationPalette({
  className,
  hasTime,
  favoriteNodeKinds,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  className?: string;
  hasTime: boolean;
  favoriteNodeKinds: AutomationNodeKind[];
  onSelect: (kind: AutomationNodeKind) => void;
  onAdd: (kind: AutomationNodeKind) => void;
  onDragStart: (kind: AutomationNodeKind) => void;
  onDragEnd: () => void;
}) {
  const [tab, setTab] = useState<"fav" | "all">("fav");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "fav" | "all")}
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden bg-background",
        className,
      )}
    >
      <div className="shrink-0 border-b p-3">
        <TabsList className="h-8 w-full justify-start rounded-lg p-[3px]">
          <TabsTrigger
            value="fav"
            className="h-[calc(100%-1px)] flex-none rounded-md px-3 py-0.5"
          >
            Fav
          </TabsTrigger>
          <TabsTrigger
            value="all"
            className="h-[calc(100%-1px)] flex-none rounded-md px-3 py-0.5"
          >
            All nodes
          </TabsTrigger>
        </TabsList>
      </div>
      <PaletteTab
        value="fav"
        groups={paletteGroupsFor("fav", favoriteNodeKinds, query)}
        hasSearch={Boolean(query)}
        hasTime={hasTime}
        onSelect={onSelect}
        onAdd={onAdd}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <PaletteTab
        value="all"
        groups={paletteGroupsFor("all", favoriteNodeKinds, query)}
        hasSearch={Boolean(query)}
        hasTime={hasTime}
        onSelect={onSelect}
        onAdd={onAdd}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <div className="shrink-0 border-t bg-background p-3">
        <div className="relative">
          <Search
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
  );
}

function paletteGroupsFor(
  view: "fav" | "all",
  favoriteNodeKinds: readonly AutomationNodeKind[],
  query: string,
) {
  const favorites = new Set(favoriteNodeKinds);
  return GROUPS.map((group) => ({
    label: group,
    items: AUTOMATION_NODE_CATALOG.filter(
      (item) =>
        item.group === group &&
        (view === "all" || favorites.has(item.kind)) &&
        (!query ||
          `${item.name} ${item.description}`.toLowerCase().includes(query)),
    ),
  })).filter((group) => group.items.length > 0);
}

function PaletteTab({
  value,
  groups,
  hasSearch,
  hasTime,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  value: "fav" | "all";
  groups: Array<{ label: string; items: PaletteItem[] }>;
  hasSearch: boolean;
  hasTime: boolean;
  onSelect: (kind: AutomationNodeKind) => void;
  onAdd: (kind: AutomationNodeKind) => void;
  onDragStart: (kind: AutomationNodeKind) => void;
  onDragEnd: () => void;
}) {
  return (
    <TabsContent value={value} className="mt-0 min-h-0 flex-1 overflow-hidden">
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
                    key={item.kind}
                    item={item}
                    disabled={item.kind === "time" && hasTime}
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
  );
}

function PaletteNodeCard({
  item,
  disabled,
  onSelect,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  item: PaletteItem;
  disabled: boolean;
  onSelect: (kind: AutomationNodeKind) => void;
  onAdd: (kind: AutomationNodeKind) => void;
  onDragStart: (kind: AutomationNodeKind) => void;
  onDragEnd: () => void;
}) {
  const Icon = ICONS[item.kind];
  return (
    <div className="group relative">
      <button
        type="button"
        draggable={!disabled}
        disabled={disabled}
        onClick={() => onSelect(item.kind)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("text/plain", item.name);
          onDragStart(item.kind);
        }}
        onDragEnd={onDragEnd}
        className="flex w-full cursor-grab items-start gap-2 overflow-hidden rounded-lg border border-foreground/5 bg-card p-2 pr-10 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate text-xs font-medium">
            {item.name}
          </span>
          <span
            className="line-clamp-2 text-[10px] leading-4 text-muted-foreground"
            title={item.description}
          >
            {disabled ? "Already added." : item.description}
          </span>
        </span>
      </button>
      {!disabled ? (
        <button
          type="button"
          aria-label={`Add ${item.name} node`}
          onClick={() => onAdd(item.kind)}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[color,background-color,opacity] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Plus className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
