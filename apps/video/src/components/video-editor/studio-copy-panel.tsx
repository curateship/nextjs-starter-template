import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ChartNoAxesCombinedIcon, CopyIcon, Loader2Icon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { BreakdownPanel } from "@/components/video-creators/breakdown-panel"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import {
  getSavedVideoErrorMessage,
  loadProjectSourceDetail,
  retryVideo,
  type ProjectSourceDetail,
} from "@/lib/api/video/viral-videos"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  isSavedVideoWorking,
  savedVideoStatusLabels,
} from "@/lib/video/creators"

/** How often the panel asks again while the video is downloading or being read. */
const POLL_MS = 3_000

/**
 * The Copy panel at the foot of the editor rail: the viral video this project
 * copies, playing at the top, and what Gemini made of it underneath, part by
 * part with the hook marked. Clicking a line jumps the player there. A
 * project made from scratch copies nothing, and the panel says where to find
 * a video (see `workspace/docs/project-first.md`).
 */
export function CopyPanel() {
  const { projectId } = useEditorRuntime()
  const [detail, setDetail] = React.useState<ProjectSourceDetail | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [reads, setReads] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [atMs, setAtMs] = React.useState<number | undefined>(undefined)
  const playerRef = React.useRef<HTMLVideoElement>(null)
  const video = detail?.video ?? null
  const working = video !== null && isSavedVideoWorking(video.status)

  React.useEffect(() => {
    let active = true
    loadProjectSourceDetail(projectId)
      .then((loaded) => {
        if (!active) return
        setDetail(loaded)
        setLoadFailed(false)
      })
      .catch((error) => {
        if (!active) return
        setLoadFailed(true)
        showErrorToast(getSavedVideoErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [projectId, reads])

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
        {detail === null && !loadFailed ? (
          <div className="p-4">
            <LoadingRow label="Loading the video this project copies" />
          </div>
        ) : loadFailed ? (
          <div className="grid justify-items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            The video this project copies could not be loaded.
            <Button
              type="button"
              variant="outline"
              onClick={() => setReads((count) => count + 1)}
            >
              Try again
            </Button>
          </div>
        ) : !video ? (
          <div className="grid justify-items-center gap-3 p-4 text-center text-sm text-muted-foreground">
            <p>
              This project copies no video. Find one that went viral on the
              Viral page or the Creators dashboard and press Copy this. It
              opens as a new project with the video here.
            </p>
            <Button asChild variant="outline">
              <Link to="/admin/video-viral">
                <ChartNoAxesCombinedIcon />
                Open Viral
              </Link>
            </Button>
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
              <Button asChild variant="ghost" size="sm" className="justify-self-start">
                <a href={video.sourceUrl} target="_blank" rel="noreferrer noopener">
                  Open the original
                </a>
              </Button>
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
