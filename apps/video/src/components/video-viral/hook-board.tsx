import { CopyIcon, FilmIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ViralScoreCell } from "@/components/video-viral/viral-score-cell"
import { focusRing } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { creatorPlatformLabels, formatCount } from "@/lib/video/creators"
import type { ViralVideo } from "@/lib/video/viral"
import { formatTimecode } from "@/lib/video/viral-breakdown"
import { CoverImage } from "@/components/video-viral/cover-image"

/**
 * The Hooks tab (viral task 16): the opening words of every broken-down video
 * on the screen, one row each, in the order the screen sorts them (by score
 * unless Filter says otherwise). Each row has the cover, the hook, the views
 * and the score, and a button that copies the words. Clicking a row plays the
 * video on the right from the hook's first moment.
 *
 * The words come with the screen's own read (`ViralVideo.hook`, worked out by
 * `hookLine` on the server), so opening the tab asks the server nothing.
 */
export function HookBoard({
  videos,
  selectedKey,
  onOpen,
}: {
  /** Only videos with a hook are drawn; the screen passes them in its order. */
  videos: ViralVideo[]
  selectedKey: string | null
  onOpen: (video: ViralVideo, startMs: number) => void
}) {
  return (
    <ul aria-label="Hooks" className="grid grid-cols-[minmax(0,1fr)]">
      {videos.map((video) =>
        video.hook ? (
          <HookRow
            key={video.key}
            video={video}
            hook={video.hook}
            selected={video.key === selectedKey}
            onOpen={onOpen}
          />
        ) : null
      )}
    </ul>
  )
}

function HookRow({
  video,
  hook,
  selected,
  onOpen,
}: {
  video: ViralVideo
  hook: NonNullable<ViralVideo["hook"]>
  selected: boolean
  onOpen: (video: ViralVideo, startMs: number) => void
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(hook.text)
      toast.success("Hook copied.")
    } catch {
      showErrorToast("The hook could not be copied. Select the words and copy them instead.")
    }
  }

  return (
    <li className={cn("flex items-start gap-1 border-b pr-2", selected ? "bg-muted" : "hover:bg-muted/50")}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onOpen(video, hook.startMs)}
        className={cn("flex min-w-0 flex-1 items-start gap-3 py-3 pl-3 text-left", focusRing)}
      >
        <span className="aspect-[9/16] w-10 shrink-0 overflow-hidden rounded-md bg-muted">
          <CoverImage
            src={video.thumbnailUrl}
            className="size-full object-cover"
            fallback={
              <span className="grid size-full place-items-center">
                <FilmIcon className="size-4 text-muted-foreground" />
              </span>
            }
          />
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="text-sm font-medium leading-snug">“{hook.text}”</span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {[
              video.channelName || creatorPlatformLabels[video.platform],
              `${formatCount(video.views)} views`,
              `${formatTimecode(hook.startMs)} to ${formatTimecode(hook.endMs)}`,
            ].join(" · ")}
          </span>
        </span>
      </button>
      {/* Beside the row's button rather than in it: a button cannot hold another. */}
      <span className="flex shrink-0 items-center gap-1 pt-3">
        <ViralScoreCell score={video.score} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Copy the hook of ${video.title}`}
              onClick={() => void copy()}
            >
              <CopyIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy the hook</TooltipContent>
        </Tooltip>
      </span>
    </li>
  )
}
