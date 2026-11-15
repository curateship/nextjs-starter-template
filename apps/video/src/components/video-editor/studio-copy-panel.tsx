import * as React from "react"
import { CopyIcon, Loader2Icon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { BreakdownPanel } from "@/components/video-editor/breakdown-panel"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import {
  getSavedVideoErrorMessage,
  loadVideoSourceDetail,
  retryVideo,
  type ProjectSourceDetail,
} from "@/lib/api/video/viral-videos"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  isSavedVideoWorking,
  savedVideoStatusLabels,
} from "@/lib/video/saved-video"

/** How often the panel asks again while the video is downloading or being read. */
const POLL_MS = 3_000

/**
 * The Copy panel at the foot of the editor rail: the viral video the open video
 * copies, playing at the top, and what Gemini made of it underneath, part by
 * part with the hook marked. Clicking a line jumps the player there. A
 * video made from scratch copies nothing, and the panel says how to start
 * from one through the Viral app (see `workspace/docs/project-first.md`).
 */
export function CopyPanel() {
  const { videoId } = useEditorRuntime()
  const [detail, setDetail] = React.useState<ProjectSourceDetail | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reads, setReads] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [atMs, setAtMs] = React.useState<number | undefined>(undefined)
  const playerRef = React.useRef<HTMLVideoElement>(null)
  const video = detail?.video ?? null
  const working = video !== null && isSavedVideoWorking(video.status)

  React.useEffect(() => {
    let active = true
    loadVideoSourceDetail(videoId)
      .then((loaded) => {
        if (!active) return
        setDetail(loaded)
        setLoadError(null)
      })
      .catch((error) => {
        if (!active) return
        setLoadError(getSavedVideoErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [videoId, reads])

  // While the video is downloading or being read, ask again.
  React.useEffect(() => {
    if (!working) return
    const timer = setTimeout(() => setReads((count) => count + 1), POLL_MS)
    return () => clearTimeout(timer)
  }, [working, detail])

  async function tryAgain() {
    if (!video) return
    setBusy(true)
    try {
      const retried = await retryVideo(video.id)
      setDetail((current) => (current ? { ...current, video: retried } : current))
    } catch (error) {
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function seek(ms: number) {
    const player = playerRef.current
    if (!player) return
    player.currentTime = ms / 1000
    void player.play().catch(() => undefined)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<CopyIcon className="size-4" />}
        title="Copy"
      />
      <ScrollArea className="min-h-0 flex-1">
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => setReads((count) => count + 1)}
          />
        ) : detail === null ? null : !video ? (
          <div className="grid justify-items-center gap-3 p-3 text-center text-sm text-muted-foreground">
            {detail?.deletedVideoTitle ? (
              // The saved video was deleted after this video copied it.
              // The title was written onto this video just before.
              <p>
                The original video, {detail.deletedVideoTitle}, was deleted.
                This video keeps everything it made, but the original and its
                breakdown are gone.
              </p>
            ) : (
              <p>
                This video copies no viral video. To start from one, open it in
                the Viral app and press Send to Video. The draft arrives with
                its script, and the original lands on the Media shelf.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)]">
            <div className="grid gap-2 border-b p-3">
              {video.title ? (
                <p className="line-clamp-2 text-sm font-medium">{video.title}</p>
              ) : null}
              {video.playbackUrl ? (
                <video
                  ref={playerRef}
                  src={video.playbackUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-[9/16] max-h-[50vh] w-full rounded-md bg-black object-contain"
                  onTimeUpdate={(event) =>
                    setAtMs(Math.round(event.currentTarget.currentTime * 1000))
                  }
                />
              ) : null}
              {working ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  {savedVideoStatusLabels[video.status]}…
                </p>
              ) : video.status === "failed" ? (
                <div className="grid gap-2">
                  <ErrorRow
                    message={video.error ?? "The video could not be saved."}
                  />
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void tryAgain()}
                  >
                    {busy ? <Loader2Icon className="animate-spin" /> : null}
                    Try again
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="ghost" size="sm">
                  <a href={video.sourceUrl} target="_blank" rel="noreferrer noopener">
                    Open the original
                  </a>
                </Button>
              </div>
            </div>
            {video.breakdown ? (
              <BreakdownPanel
                breakdown={video.breakdown}
                onSeek={video.playbackUrl ? seek : undefined}
                atMs={atMs}
              />
            ) : (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {working
                  ? "The breakdown shows here once the video has been read."
                  : "This video has no breakdown."}
              </p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
