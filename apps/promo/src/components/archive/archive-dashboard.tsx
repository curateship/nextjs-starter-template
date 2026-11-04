import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { ArchiveIcon } from "lucide-react"

import { ArchiveItemPanel } from "@/components/archive/archive-item-panel"
import { ArchiveItemsPanel, type ArchiveItemsHandle } from "@/components/archive/archive-items-panel"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ThreePanels } from "@/components/shared/three-panels"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ArchiveProjectRow } from "@/lib/api/archive/items"
import type { SavedView } from "@/lib/api/saved-views"
import { storageLine } from "@/lib/archive/items"
import { ARCHIVE_PANEL_LAYOUT_KEY, ARCHIVE_PLACE_KEY } from "@/lib/archive/panel-keys"
import type { ArchiveSearch } from "@/lib/archive/search"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"

/**
 * The Archive dashboard (`workspace/docs/archive.md`), under Projects in the
 * left menu. Travel's trip page drawn for an archive (Tyler, 4 Nov 2026:
 * "Travel's trip page", "List of projects"): every Promo project with how
 * much room its files take on the left, the picked project's videos,
 * carousels and pictures in the middle, and the open item on the right.
 */
export function ArchiveDashboard({
  projects,
  views,
  search,
}: {
  projects: ArchiveProjectRow[]
  views: SavedView[]
  search: ArchiveSearch
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const list = React.useRef<ArchiveItemsHandle>(null)
  const project = projects.find((row) => row.id === search.project) ?? projects[0] ?? null
  const [shown, setShown] = React.useState<{ projectId: string; ids: string[] } | null>(null)

  const onSearch = React.useCallback(
    (patch: Partial<ArchiveSearch>) =>
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )
  const onShown = React.useCallback((ids: string[]) => setShown({ projectId: project?.id ?? "", ids }), [project?.id])
  const ids = shown && shown.projectId === project?.id ? shown.ids : []
  const openId = search.open

  const refresh = React.useCallback(() => {
    list.current?.reload()
    void router.invalidate()
  }, [router])

  return (
    <ThreePanels
      layoutKey={ARCHIVE_PANEL_LAYOUT_KEY}
      place={{ key: ARCHIVE_PLACE_KEY, search, ids, ready: Boolean(shown && shown.projectId === project?.id) }}
      showMiddleFor={project?.id}
      showRightFor={openId}
      left={{
        label: "Projects",
        showLabel: "Show the projects",
        content: (
          <>
            <DashboardCardTitleHeader icon={<ArchiveIcon className="size-4" />} title="Archive" />
            <ScrollArea className="min-h-0 flex-1">
              {projects.length ? (
                <div className="grid gap-1 p-3">
                  {projects.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      aria-pressed={row.id === project?.id}
                      className={cn(
                        "grid gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-accent",
                        row.id === project?.id && "bg-accent"
                      )}
                      onClick={() => onSearch({ project: row.id, open: undefined, bin: undefined })}
                    >
                      <span className="truncate text-sm font-medium">{row.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.items} {plural(row.items, "item", "items")} · {storageLine(row.bytes)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">There are no projects yet. Make one on the Projects dashboard, then send things to it from Video.</p>
              )}
            </ScrollArea>
          </>
        ),
      }}
      middle={{
        label: "Items",
        content: project ? (
          <ArchiveItemsPanel
            key={project.id}
            ref={list}
            projectId={project.id}
            projectName={project.name}
            search={search}
            onSearch={onSearch}
            openId={openId}
            onOpen={(itemId) => onSearch({ open: itemId })}
            onShown={onShown}
            canManage
            views={views}
          />
        ) : (
          <>
            <DashboardCardTitleHeader icon={<ArchiveIcon className="size-4" />} title="Items" />
            <p className="p-4 text-sm text-muted-foreground">The archive keeps each project's videos, carousels and pictures once there is a project.</p>
          </>
        ),
      }}
      right={{
        label: "Item",
        showLabel: "Show the item",
        content: (
          <ArchiveItemPanel
            key={openId ?? "none"}
            itemId={openId}
            canManage
            projects={projects.map((row) => ({ id: row.id, name: row.name }))}
            onChanged={refresh}
            onOpen={(itemId) => onSearch({ open: itemId })}
          />
        ),
      }}
    />
  )
}
