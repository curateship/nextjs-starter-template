import { ClapperboardIcon, GridIcon, ListIcon } from "lucide-react"

import {
  DashboardToolbarButton,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
} from "@/components/shared/dashboard-toolbar"
import { formatRelativeTime } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"
import { formatClock } from "@/lib/video/timeline-utils"

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
export type DraftVideo = { id: string; name: string; durationMs: number; updatedAt: string; thumbnailUrl: string | null }

/**
 * What a draft's card and row say it is: always Draft (Tyler, 27 Nov 2026,
 * "Always "Draft""). Content's Status calls every video still in the editor a
 * draft, so the editor's own Ready or Posted tag stays in the editor.
 */
export const DRAFT_STATUS_WORD = "Draft"

/**
 * A draft's card in a grid: its picture and length, its name on up to two
 * lines, and its last edit. It opens the editor on the whole screen, as a row
 * of Drafts does. The picture is the video's main thumbnail, else its first
 * clip's frame (`project-thumbnails.md`); a video with no clip yet shows the
 * clapperboard.
 */
export function DraftCard({ video, onOpen }: { video: DraftVideo; onOpen: () => void }) {
  return (
    <div className="group relative grid gap-1.5 rounded-lg p-1.5 hover:bg-accent/60">
      <button type="button" className={cn("grid gap-1.5 rounded-md text-left", focusRing)} onClick={onOpen}>
        <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
          {video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <ClapperboardIcon className="size-6 text-muted-foreground" />
          )}
          <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[11px]">
            <ClapperboardIcon className="size-3" />
            {formatClock(video.durationMs)}
          </span>
        </span>
        <span className={CARD_NAME}>{video.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {DRAFT_STATUS_WORD} · Edited {formatRelativeTime(video.updatedAt).toLowerCase()}
        </span>
      </button>
    </div>
  )
}

/**
 * A card's name: up to two lines before "…", so names that start alike can be
 * told apart. Two lines of room are kept on every card, so a row of cards
 * stays lined up when only one name wraps.
 */
export const CARD_NAME = "line-clamp-2 min-h-[2lh] text-sm font-medium break-words"

/** The cards' grid, the Archive's own sizes. */
export const CARD_GRID = "grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3"
