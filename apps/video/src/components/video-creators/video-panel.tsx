import * as React from "react"
import {
  ExternalLinkIcon,
  Loader2Icon,
  PlayIcon,
  SparklesIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { showErrorToast } from "@/lib/toast/error-toast"
import { BreakdownPanel } from "@/components/video-creators/breakdown-panel"
import {
  getSavedVideoErrorMessage,
  loadSavedVideoDetail,
  retryVideo,
  saveVideo,
  type SavedVideoDetail,
} from "@/lib/api/video/viral-videos"
import {
  creatorPlatformLabels,
  formatCount,
  isSavedVideoWorking,
  savedVideoStatusLabels,
  type CreatorPost,
  type SavedVideoStatus,
} from "@/lib/video/creators"

/**
 * The right panel: watch the video, then read how it works.
 *
 * **Clicking a video in the feed spends nothing.** A YouTube video plays in
 * YouTube's own embed, which is free and instant. TikTok and Instagram show
 * their cover and a way out to the app, because their embeds need third-party
 * scripts that are not worth loading to watch one clip.
 *
 * Only "Save & break down" costs anything, and it says so above the button. It
 * writes a row and the background worker takes it from there, so the panel
 * watches the row rather than holding the work open.
 */

/** How often the panel asks again while a job is moving. */
const POLL_MS = 3_000

export function VideoPanel({
  post,
  onSavedChange,
}: {
  post: CreatorPost | null
  /** Tells the feed the chip moved, so the row and the panel agree. */
  onSavedChange: (
    postId: string,
    saved: { id: string; status: SavedVideoStatus } | null
  ) => void
}) {
  const [saved, setSaved] = React.useState<SavedVideoDetail | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [atMs, setAtMs] = React.useState<number | undefined>(undefined)
  const playerRef = React.useRef<HTMLVideoElement>(null)

  // Which video the panel is showing. Every answer checks it before landing,
  // so a slow read about the last video never paints over the new one.
  const showing = post?.id ?? null
  const showingRef = React.useRef(showing)
  showingRef.current = showing

  const read = React.useCallback(
    async (savedVideoId: string, postId: string) => {
      try {
        const detail = await loadSavedVideoDetail(savedVideoId)
        if (showingRef.current !== postId) return null
        setSaved(detail)
        onSavedChange(postId, { id: detail.id, status: detail.status })
        return detail
      } catch (error) {
        if (showingRef.current !== postId) return null
        showErrorToast(getSavedVideoErrorMessage(error))
        return null
      }
    },
    [onSavedChange]
  )

  // A different video clears what was on screen before anything is asked, so
  // the panel never shows the last video's breakdown beside this one's title.
  //
  // It depends on the two ids and nothing else on purpose. The whole post is a
  // fresh object every time its chip moves, so depending on it would clear and
  // re-read on each answer — and each answer moves the chip, which is a loop.
  const postId = post?.id ?? null
  const savedVideoId = post?.savedVideoId ?? null
  React.useEffect(() => {
    setSaved(null)
    setAtMs(undefined)
    if (savedVideoId && postId) void read(savedVideoId, postId)
  }, [postId, savedVideoId, read])

  // While the job is moving, ask again. It stops the moment it is ready or
  // failed, so a finished video is not polled forever.
  React.useEffect(() => {
    if (!post || !saved || !isSavedVideoWorking(saved.status)) return
    const timer = setInterval(() => void read(saved.id, post.id), POLL_MS)
    return () => clearInterval(timer)
  }, [post, read, saved])

  if (!post) {
    return (
      <>
        <DashboardCardTitleHeader icon={<PlayIcon />} title="Video" />
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Pick a video in the middle to watch it here.
        </p>
      </>
    )
  }

  async function onSave() {
    if (!post || busy) return
    setBusy(true)
    try {
      const detail = await saveVideo(post.url)
      if (showingRef.current !== post.id) return
      setSaved(detail)
      onSavedChange(post.id, { id: detail.id, status: detail.status })
    } catch (error) {
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function onTryAgain() {
    if (!post || !saved || busy) return
    setBusy(true)
    try {
      const detail = await retryVideo(saved.id)
      if (showingRef.current !== post.id) return
      setSaved(detail)
      onSavedChange(post.id, { id: detail.id, status: detail.status })
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

  const working = saved !== null && isSavedVideoWorking(saved.status)

  return (
    <>
      <DashboardCardTitleHeader
        icon={<PlayIcon />}
        title={post.title ?? "Untitled"}
        meta={`${creatorPlatformLabels[post.platform]} · @${post.creatorHandle}`}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          <Player
            post={post}
            saved={saved}
            playerRef={playerRef}
            onTime={setAtMs}
          />

          <dl className="grid grid-cols-3 gap-2 border-b px-3 py-2 text-center">
            <Figure label="Views" value={formatCount(post.views)} />
            <Figure label="Likes" value={formatCount(post.likes)} />
            <Figure label="Comments" value={formatCount(post.comments)} />
          </dl>

          <div className="border-b p-3">
            {saved === null ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  Downloading it and having AI watch it spends from your monthly
                  AI allowance and up to 100MB of storage.
                </p>
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() => void onSave()}
                >
                  {busy ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <SparklesIcon />
                  )}
                  Save &amp; break down
                </Button>
              </>
            ) : working ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {savedVideoStatusLabels[saved.status]}…
              </p>
            ) : saved.status === "failed" ? (
              <div className="grid gap-2">
                <ErrorRow
                  message={saved.error ?? "The video could not be saved."}
                />
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onTryAgain()}
                >
                  {busy ? <Loader2Icon className="animate-spin" /> : null}
                  Try again
                </Button>
              </div>
            ) : null}
          </div>

          {saved?.breakdown ? (
            <BreakdownPanel
              breakdown={saved.breakdown}
              onSeek={saved.playbackUrl ? seek : undefined}
              atMs={atMs}
            />
          ) : null}
        </div>
      </ScrollArea>
    </>
  )
}

/**
 * The player. Once the file has been downloaded it is played from the bucket,
 * which is the copy the breakdown's timings belong to. Before that, YouTube's
 * embed stands in; TikTok and Instagram get their cover and a way out.
 */
function Player({
  post,
  saved,
  playerRef,
  onTime,
}: {
  post: CreatorPost
  saved: SavedVideoDetail | null
  playerRef: React.RefObject<HTMLVideoElement | null>
  onTime: (ms: number) => void
}) {
  if (saved?.playbackUrl) {
    return (
      <video
        ref={playerRef}
        src={saved.playbackUrl}
        controls
        playsInline
        preload="metadata"
        className="aspect-[9/16] max-h-[60vh] w-full bg-black object-contain"
        onTimeUpdate={(event) =>
          onTime(Math.round(event.currentTarget.currentTime * 1000))
        }
      />
    )
  }

  if (post.platform === "youtube") {
    return (
      <iframe
        // nocookie, because the person watching has not asked YouTube for
        // anything and should not be tracked for looking at research.
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(post.platformVideoId)}`}
        title={post.title ?? "Video"}
        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        className="aspect-[9/16] max-h-[60vh] w-full border-0 bg-black"
      />
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 border-b p-3">
      {post.thumbnailUrl ? (
        <img
          src={post.thumbnailUrl}
          alt=""
          className="max-h-[40vh] rounded-md object-contain"
        />
      ) : null}
      <p className="text-center text-xs text-muted-foreground">
        {creatorPlatformLabels[post.platform]} videos only play on their own
        site until you save one.
      </p>
      <Button variant="outline" asChild>
        <a href={post.url} target="_blank" rel="noreferrer noopener">
          <ExternalLinkIcon />
          Open on {creatorPlatformLabels[post.platform]}
        </a>
      </Button>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums">{value}</dd>
    </div>
  )
}
