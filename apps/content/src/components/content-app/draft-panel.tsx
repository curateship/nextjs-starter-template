import { ClapperboardIcon, PencilLineIcon } from "lucide-react"

import { DRAFT_STATUS_WORD, type DraftVideo } from "@/components/content-app/content-layout"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatRelativeTime } from "@/lib/format/format-time"
import { formatClock } from "@/lib/video/timeline-utils"

/**
 * Content's right panel while no Archive item is open and the project has a
 * draft: the first draft listed, so the right panel is never empty (Tyler's
 * rule, 23 Oct 2026). It only shows the draft. Pressing a draft's card still
 * opens the editor on the whole screen, as Open in the editor here does
 * (Tyler, 26 Nov 2026: "Option 1: whole screen").
 */
export function DraftPanel({ video, onOpen }: { video: DraftVideo; onOpen: () => void }) {
  return (
    <>
      <DashboardCardTitleHeader icon={<ClapperboardIcon className="size-4" />} title={video.name} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          <span className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
            {video.thumbnailUrl ? (
              <img src={video.thumbnailUrl} alt="" className="size-full object-contain" />
            ) : (
              <ClapperboardIcon className="size-6 text-muted-foreground" />
            )}
          </span>
          <p className="text-sm text-muted-foreground">
            {DRAFT_STATUS_WORD} · {formatClock(video.durationMs)} · Edited {formatRelativeTime(video.updatedAt).toLowerCase()}
          </p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onOpen}>
              <PencilLineIcon className="size-4" />
              Open in the editor
            </Button>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
