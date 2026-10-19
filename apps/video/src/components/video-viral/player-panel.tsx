import * as React from "react"
import {
  DownloadIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  LinkIcon,
  Loader2Icon,
  PlayIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { InspectorCard } from "@/components/shared/inspector-card"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { BreakdownPanel } from "@/components/video-viral/breakdown-panel"
import { CopyThisButton } from "@/components/video-viral/copy-this-button"
import { DeleteSavedVideosDialog } from "@/components/video-viral/delete-saved-videos-dialog"
import { StarMenu, type Favourites } from "@/components/video-viral/star-menu"
import { ViralScoreParts } from "@/components/video-viral/viral-score-parts"
import {
  getSavedVideoErrorMessage,
  loadSavedVideoDetail,
  retryVideo,
  saveVideos,
  type SavedVideoDetail,
} from "@/lib/api/video/viral-videos"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  creatorPlatformLabels,
  formatCount,
  isSavedVideoWorking,
  savedVideoStatusLabels,
} from "@/lib/video/creators"
import type { ViralVideo } from "@/lib/video/viral"

/**
 * The right panel: watch the video, see why it scores what it scores, then
 * star it, copy it or have it broken down.
 *
 * **Picking a video spends nothing.** A YouTube video plays in YouTube's own
 * embed, which is free. TikTok and Instagram show their cover and a way out,
 * because their embeds need third-party scripts. Download spends storage only;
 * AI analyse is the one button that spends AI money, and the note above the
 * two buttons says so.
 */

/** How often the panel asks again while a breakdown is moving. */
const POLL_MS = 3_000

export function PlayerPanel({
  video,
  emptyText = "Pick a video in the middle to watch it here.",
  ...rest
}: Omit<PlayerBodyProps, "video"> & {
  video: ViralVideo | null
  emptyText?: string
}) {
  if (!video) {
    return (
      <>
        <DashboardCardTitleHeader icon={<PlayIcon />} title="Video" />
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      </>
    )
  }
  // Keyed on the video, so picking another starts from nothing: no breakdown
  // of the last video can show beside this one's title.
  return <PlayerBody key={video.key} video={video} {...rest} />
}

type PlayerBodyProps = {
  video: ViralVideo
  /** The Viral project on screen. Null in a favourites collection. */
  projectId: string | null
  favourites: Favourites
  onFavouritesChanged: () => Promise<void>
  /** Hides the video's channel from the project. Absent outside a project. */
  onHideChannel?: (video: ViralVideo) => void
  /** Back to the creator card the video was picked under. */
  onBack?: () => void
  /**
   * Tells the grid where saving this video has got to, so its card agrees,
   * with the status it had before so a finish can be noticed.
   */
  onSavedChange?: (
    key: string,
    saved: { id: string; status: string },
    before: string | null
  ) => void
  /** The saved copy was deleted. Without it, the panel offers no Delete. */
  onDeleted?: (video: ViralVideo) => void | Promise<void>
}

function PlayerBody({
  video,
  projectId,
  favourites,
  onFavouritesChanged,
  onHideChannel,
  onBack,
  onSavedChange,
  onDeleted,
}: PlayerBodyProps) {
  const [saved, setSavedHere] = React.useState<SavedVideoDetail | null>(null)
  const [busy, setBusy] = React.useState<"download" | "analyse" | "retry" | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [atMs, setAtMs] = React.useState<number | undefined>(undefined)
  const playerRef = React.useRef<HTMLVideoElement>(null)

  // Every answer about the saved copy lands here and on the video's card.
  const tellCard = React.useRef(onSavedChange)
  React.useEffect(() => {
    tellCard.current = onSavedChange
  })
  const key = video.key
  const lastStatus = React.useRef<string | null>(video.savedStatus)
  const setSaved = React.useCallback(
    (detail: SavedVideoDetail) => {
      setSavedHere(detail)
      tellCard.current?.(key, { id: detail.id, status: detail.status }, lastStatus.current)
      lastStatus.current = detail.status
    },
    [key]
  )

  const read = React.useCallback(
    async (savedVideoId: string) => {
      try {
        setSaved(await loadSavedVideoDetail(savedVideoId))
      } catch (error) {
        showErrorToast(getSavedVideoErrorMessage(error))
      }
    },
    [setSaved]
  )

  // The saved copy, when there is one, is read once the panel opens.
  const savedVideoId = video.savedVideoId
  React.useEffect(() => {
    if (!savedVideoId) return
    let live = true
    loadSavedVideoDetail(savedVideoId)
      .then((detail) => {
        if (live) setSaved(detail)
      })
      .catch((error) => {
        if (live) showErrorToast(getSavedVideoErrorMessage(error))
      })
    return () => {
      live = false
    }
  }, [savedVideoId, setSaved])

  // While the breakdown is moving, ask again; stop once it is ready or failed.
  React.useEffect(() => {
    if (!saved || !isSavedVideoWorking(saved.status)) return
    const timer = setInterval(() => void read(saved.id), POLL_MS)
    return () => clearInterval(timer)
  }, [read, saved])

  /** Download (no AI) or AI analyse (downloading first when needed). */
  async function onSave(analyse: boolean) {
    if (busy) return
    setBusy(analyse ? "analyse" : "download")
    try {
      const [detail] = await saveVideos([video.url], projectId, analyse)
      setSaved(detail)
    } catch (error) {
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function onTryAgain() {
    if (!saved || busy) return
    setBusy("retry")
    try {
      setSaved(await retryVideo(saved.id))
    } catch (error) {
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(video.url)
      toast.success("Link copied.")
    } catch {
      showErrorToast("The link could not be copied. Select it from the address bar of the video instead.")
    }
  }

  function seek(ms: number) {
    const player = playerRef.current
    if (!player) return
    player.currentTime = ms / 1000
    void player.play().catch(() => undefined)
  }

  const working = saved !== null && isSavedVideoWorking(saved.status)
  const platform = creatorPlatformLabels[video.platform]

  return (
    <>
      <DashboardCardTitleHeader
        icon={<PlayIcon />}
        back={onBack ? { label: "Back to the creator", onClick: onBack } : undefined}
        title={video.title}
        meta={video.channelName ? `${platform} · ${video.channelName}` : platform}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)]">
          <Player
            video={video}
            saved={saved}
            playerRef={playerRef}
            onTime={setAtMs}
          />

          <dl className="grid grid-cols-3 gap-2 border-b px-3 py-2 text-center">
            <Figure label="Views" value={formatCount(video.views)} />
            <Figure label="Likes" value={formatCount(video.likes)} />
            <Figure label="Comments" value={formatCount(video.comments)} />
          </dl>

          <div className="grid gap-3 p-3">
            <div className="flex flex-wrap items-center gap-1">
              {video.sample ? null : (
                <StarMenu
                  videos={[video]}
                  favourites={favourites}
                  sourceProjectId={projectId}
                  onChanged={onFavouritesChanged}
                />
              )}
              {video.sample ? null : (
                <IconAction label={`Open on ${platform}`}>
                  <a href={video.url} target="_blank" rel="noreferrer noopener">
                    <ExternalLinkIcon />
                  </a>
                </IconAction>
              )}
              {video.sample ? null : (
                <IconAction label="Copy link" onClick={() => void copyLink()}>
                  <LinkIcon />
                </IconAction>
              )}
              {saved && onDeleted ? (
                <IconAction
                  label="Delete the saved video"
                  onClick={() => setDeleting(true)}
                >
                  <Trash2Icon />
                </IconAction>
              ) : null}
              {onHideChannel ? (
                <IconAction
                  label={`Hide ${video.channelName || "this channel"} from this project`}
                  onClick={() => onHideChannel(video)}
                >
                  <EyeOffIcon />
                </IconAction>
              ) : null}
              <span className="ml-auto flex flex-wrap items-center gap-1">
                {video.isNew ? <Badge>New</Badge> : null}
                {video.topicMatch !== null ? (
                  <Badge variant="secondary">Fits {video.topicMatch}</Badge>
                ) : null}
              </span>
            </div>

            {video.sample ? (
              <p className="text-sm text-muted-foreground">
                This is a made-up sample video. Make your own project to see
                real ones.
              </p>
            ) : (
              <>
                <CopyThisButton
                  url={video.url}
                  title={video.title}
                  viralProjectId={projectId}
                  className="w-full"
                />
                {saved === null ? (
                  <div className="grid gap-2">
                    <SpendNote />
                    <SaveButtons busy={busy} onSave={(analyse) => void onSave(analyse)} />
                  </div>
                ) : working ? (
                  <div className="grid gap-2">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2Icon className="size-4 animate-spin" />
                      {savedVideoStatusLabels[saved.status]}…
                    </p>
                    {saved.wantsAnalysis ? null : (
                      <AnalyseButton busy={busy} onPress={() => void onSave(true)} />
                    )}
                  </div>
                ) : saved.status === "downloaded" ? (
                  <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">
                      Downloaded into your media library. No AI has watched it
                      yet. AI analyse spends from your monthly AI allowance.
                    </p>
                    <AnalyseButton busy={busy} onPress={() => void onSave(true)} />
                  </div>
                ) : saved.status === "failed" ? (
                  <div className="grid gap-2">
                    <ErrorRow
                      message={saved.error ?? "The video could not be saved."}
                    />
                    <Button
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void onTryAgain()}
                    >
                      {busy === "retry" ? <Loader2Icon className="animate-spin" /> : null}
                      Try again
                    </Button>
                  </div>
                ) : null}
              </>
            )}

            <InspectorCard
              storageId="viral-player-score"
              title={`Why it scores ${video.score.score}`}
              description={`Out of 100, sure: ${video.score.confidence}.`}
            >
              <div className="grid gap-1.5 text-sm">
                <ViralScoreParts score={video.score} />
              </div>
            </InspectorCard>

            {video.keywords.length ? (
              <p className="text-xs text-muted-foreground">
                Found by {video.keywords.map((keyword) => `“${keyword}”`).join(", ")}
              </p>
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
      {onDeleted ? (
        <DeleteSavedVideosDialog
          videos={deleting && saved ? [{ savedVideoId: saved.id, title: video.title }] : []}
          onOpenChange={setDeleting}
          onDeleted={async (result) => {
            setDeleting(false)
            if (!result.deleted.length) return
            setSavedHere(null)
            lastStatus.current = null
            await onDeleted(video)
            toast.success(
              result.filesKept
                ? "The saved video is deleted. Its file stays in your media library, because a project still uses it."
                : "The saved video is deleted, with its file."
            )
          }}
        />
      ) : null}
    </>
  )
}

/** The one sentence on what the two buttons spend. */
function SpendNote() {
  return (
    <p className="text-xs text-muted-foreground">
      Only AI analyse spends AI money, from your monthly AI allowance. Download
      keeps the video in your media library and spends storage only, up to
      100MB.
    </p>
  )
}

/** Download and AI analyse, side by side. */
function SaveButtons({
  busy,
  onSave,
}: {
  busy: "download" | "analyse" | "retry" | null
  onSave: (analyse: boolean) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        disabled={busy !== null}
        onClick={() => onSave(false)}
      >
        {busy === "download" ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <DownloadIcon />
        )}
        Download
      </Button>
      <AnalyseButton busy={busy} onPress={() => onSave(true)} />
    </div>
  )
}

function AnalyseButton({
  busy,
  onPress,
}: {
  busy: "download" | "analyse" | "retry" | null
  onPress: () => void
}) {
  return (
    <Button disabled={busy !== null} onClick={onPress}>
      {busy === "analyse" ? (
        <Loader2Icon className="animate-spin" />
      ) : (
        <SparklesIcon />
      )}
      AI analyse
    </Button>
  )
}

/**
 * The player. Once the file has been downloaded it plays from the bucket,
 * which is the copy the breakdown's timings belong to. Before that, YouTube's
 * embed stands in; TikTok and Instagram get their cover and a way out.
 */
function Player({
  video,
  saved,
  playerRef,
  onTime,
}: {
  video: ViralVideo
  saved: SavedVideoDetail | null
  playerRef: React.RefObject<HTMLVideoElement | null>
  onTime: (ms: number) => void
}) {
  if (video.sample) {
    return (
      <div className="grid aspect-[9/16] max-h-[40vh] w-full place-items-center border-b bg-muted p-6 text-center text-sm text-muted-foreground">
        A sample has nothing to play.
      </div>
    )
  }
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
  if (video.platform === "youtube") {
    return (
      <iframe
        // nocookie, because watching research is not asking YouTube for
        // anything and should not be tracked.
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.platformVideoId)}`}
        title={video.title}
        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        className="aspect-[9/16] max-h-[60vh] w-full border-0 bg-black"
      />
    )
  }
  const platform = creatorPlatformLabels[video.platform]
  return (
    <div className="flex flex-col items-center gap-3 border-b p-3">
      {video.thumbnailUrl ? (
        <img
          src={video.thumbnailUrl}
          alt=""
          className="max-h-[40vh] rounded-md object-contain"
        />
      ) : null}
      <p className="text-center text-xs text-muted-foreground">
        {platform} videos only play on their own site until you save one.
      </p>
      <Button variant="outline" asChild>
        <a href={video.url} target="_blank" rel="noreferrer noopener">
          <ExternalLinkIcon />
          Open on {platform}
        </a>
      </Button>
    </div>
  )
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          asChild={!onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
