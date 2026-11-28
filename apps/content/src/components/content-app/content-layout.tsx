import { ClapperboardIcon, GridIcon, ListIcon } from "lucide-react"

import {
  DashboardToolbarButton,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
} from "@/components/shared/dashboard-toolbar"
import { formatRelativeTime } from "@/lib/format/format-time"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"
import { formatClock } from "@/lib/video/timeline-utils"
import { VIDEO_STATUS_LABELS, type VideoStatus } from "@/lib/video/project-videos"

/**
 * How Content shows its lists, as a grid of cards or as a table (Tyler,
 * 27 Nov 2026: "Shouldnt there be 2 icon for list and grid ?"). One choice
 * for All content, its kinds and Drafts, so moving between them, or back from
 * the editor, keeps the same look. This browser remembers it, as the Media
 * page's own is; a grid to begin with.
 */
export const CONTENT_LAYOUTS = ["grid", "list"] as const
export type ContentLayout = (typeof CONTENT_LAYOUTS)[number]

const CONTENT_LAYOUT_KEY = "content-layout"

export function useContentLayout(): [ContentLayout, (next: ContentLayout) => void] {
  const [layout, setLayout] = useRememberedChoice<ContentLayout>(CONTENT_LAYOUT_KEY, "grid", CONTENT_LAYOUTS)
  return [layout, setLayout]
}

/**
 * The two icons, Grid and List, after Filter in a list's header, drawn as the
 * Media page's switch is. A header narrower than 32rem, as on a phone, leaves
 * them out, so its dropdowns and buttons keep their line; the look last picked
 * still holds there.
 */
export function ContentLayoutSwitch({ layout, onChange }: { layout: ContentLayout; onChange: (next: ContentLayout) => void }) {
  return (
    <div className={cn(dashboardToolbarButtonGroupClassName, "shrink-0 border-zinc-200/60 bg-background @max-lg:hidden dark:border-zinc-700/60")}>
      {CONTENT_LAYOUTS.map((each) => (
        <DashboardToolbarButton
          key={each}
          type="button"
          variant={layout === each ? "default" : "ghost"}
          className={cn(dashboardToolbarButtonGroupItemClassName, layout === each && dashboardToolbarButtonActiveClassName)}
          onClick={() => onChange(each)}
          aria-label={each === "grid" ? "Show as a grid" : "Show as a list"}
          aria-pressed={layout === each}
        >
          {each === "grid" ? <GridIcon className="size-4" /> : <ListIcon className="size-4" />}
        </DashboardToolbarButton>
      ))}
    </div>
  )
}

/** One of the project's editor videos, as Drafts and All content show them. */
export type DraftVideo = { id: string; name: string; status: VideoStatus; durationMs: number; updatedAt: string }

/**
 * A draft's card in a grid: its length, name, and where it stands with its
 * last edit. It opens the editor on the whole screen, as a row of Drafts does.
 */
export function DraftCard({ video, onOpen }: { video: DraftVideo; onOpen: () => void }) {
  return (
    <div className="group relative grid gap-1.5 rounded-lg p-1.5 hover:bg-accent/60">
      <button type="button" className="grid gap-1.5 text-left focus-visible:outline-none" onClick={onOpen}>
        <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
          <ClapperboardIcon className="size-6 text-muted-foreground" />
          <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[11px]">
            <ClapperboardIcon className="size-3" />
            {formatClock(video.durationMs)}
          </span>
        </span>
        <span className="truncate text-sm font-medium">{video.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {VIDEO_STATUS_LABELS[video.status]} · Edited {formatRelativeTime(video.updatedAt).toLowerCase()}
        </span>
      </button>
    </div>
  )
}

/** The cards' grid, the Archive's own sizes. */
export const CARD_GRID = "grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3"
