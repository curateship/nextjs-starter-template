import * as React from "react"
import {
  ArrowLeftIcon,
  CopyPlusIcon,
  DownloadIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  HardDriveDownloadIcon,
  LinkIcon,
  Loader2Icon,
  PlayIcon,
  RotateCwIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"
import { EmptyRecord } from "@/components/crm/record-frame"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { RightPanelCover, useRightCover } from "@/components/shared/notes/page-cover"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CopyToProjectDialog, type CopyTarget } from "@/components/viral/copy-to-project-dialog"
import { BreakdownPanel } from "@/components/viral/breakdown-panel"
import { CommentsCard } from "@/components/viral/comments-card"
import { AnalyseSection } from "@/components/viral/analyse-section"
import { DeleteSavedVideosDialog } from "@/components/viral/delete-saved-videos-dialog"
import { OutlierBadge } from "@/components/viral/outlier-badge"
import { RisingBadge } from "@/components/viral/rising-badge"
import { RecordMenu, type MenuAction } from "@/components/viral/dashboard/section-parts"
import { SocialIcon } from "@/components/viral/social-icon"
import { ViralScoreBlock } from "@/components/viral/viral-score-parts"
import {
  getSavedVideoErrorMessage,
  loadSavedVideoDetail,
  retryVideo,
  saveVideos,
  type SavedVideoDetail,
} from "@/lib/api/viral/viral-videos"
import { PANEL_FOOTER_PADDING, PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  creatorPlatformLabels,
  formatCount,
  formatDuration,
  isSavedVideoWorking,
  savedVideoStatusLabels,
} from "@/lib/viral/creators"
import { downloadToComputer } from "@/lib/viral/download"
import { soundLabel, type ViralVideo } from "@/lib/viral/viral"
import { engagementPer100, viewsPerFollower } from "@/lib/viral/viral-view"
import { CoverImage } from "@/components/viral/cover-image"

/** How often the panel asks again while a breakdown is moving. */
const POLL_MS = 3_000

/**
 * The right panel, the open video, drawn as Travel's open activity (Tyler,
 * 4 Nov 2026): the social's mark, the title and the ⋮ of the video's actions
 * in the header; then the player, a strip of figures, the score with a bar
 * per part, the details, Analyse with AI with Save to vault and Send to
 * Video, and the breakdown once the AI has watched it.
 *
 * **Picking a video spends nothing.** A YouTube video plays in YouTube's own
 * embed, which is free, and an Instagram one in Instagram's. TikTok shows its
 * cover and a way out until it is downloaded. Download (in the ⋮) spends
 * storage only; Analyse with AI is the one button that spends AI money, and
 * it shows the price.
 */
export function PlayerPanel({
  video,
  emptyText = "Pick a video in the middle to watch it here.",
  ...rest
}: Omit<PlayerBodyProps, "video"> & {
  video: ViralVideo | null
  emptyText?: string
}) {
  if (!video) {
    return <EmptyRecord title="Video" icon={<PlayIcon aria-hidden />} line={emptyText} hideLabel="Hide the video" />
  }
  // Keyed on the video, so picking another starts from nothing: no breakdown
  // of the last video can show beside this one's title.
  return <PlayerBody key={video.key} video={video} {...rest} />
}

type PlayerBodyProps = {
  video: ViralVideo
  /** The project on screen. */
  projectId: string
  /** The project's "What do you make, and for whom?", which the Analyse box starts from. */
  projectTopic: string
  /** The video went into the vault, or its vault item changed: the screen reads itself again. */
  onVaultChanged: () => void | Promise<void>
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
  /** Where the video starts, in milliseconds: its hook, opened from Hooks. */
  startAtMs?: number
  /** Opens the video's channel as a creator page in the middle. Absent where it has none. */
  onOpenChannel?: (video: ViralVideo) => void
  /** "Same idea, other creators" in the ⋮. Absent outside a project. */
  onSameIdea?: (video: ViralVideo) => void
}

function PlayerBody({
  video,
  projectId,
  projectTopic,
  onVaultChanged,
  onHideChannel,
  onBack,
  onSavedChange,
  onDeleted,
  startAtMs,
  onOpenChannel,
  onSameIdea,
}: PlayerBodyProps) {
  const [saved, setSavedHere] = React.useState<SavedVideoDetail | null>(null)
  const [busy, setBusy] = React.useState<"download" | "analyse" | "retry" | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const cover = useRightCover()
  const [copying, setCopying] = React.useState<CopyTarget | null>(null)
  // The sticky footer the Analyse section draws its vault buttons into.
  const [footer, setFooter] = React.useState<HTMLDivElement | null>(null)
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

  /** Download, with no AI: the ⋮'s Download. Analyse with AI saves through its own box. */
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
    } catch {
      showErrorToast("The link could not be copied. Select it from the address bar of the video instead.")
    }
  }

  // Another hook of the same video picked while it is open: the player is
  // already loaded, so it moves now. A player still loading starts there by
  // itself (Player's onLoadedMetadata).
  React.useEffect(() => {
    const player = playerRef.current
    if (startAtMs === undefined || !player || player.readyState < 1) return
    player.currentTime = startAtMs / 1000
  }, [startAtMs])

  // Where a YouTube embed was sent by a click on What is said. An embed can't be moved
  // in place, so it reloads starting there and plays.
  const [jumpMs, setJumpMs] = React.useState<number | undefined>(undefined)
  // Another hook picked from Hooks wins over the last line clicked.
  const [jumpFor, setJumpFor] = React.useState(startAtMs)
  if (jumpFor !== startAtMs) {
    setJumpFor(startAtMs)
    setJumpMs(undefined)
  }

  function seek(ms: number) {
    const player = playerRef.current
    if (player) {
      player.currentTime = ms / 1000
      void player.play().catch(() => undefined)
      return
    }
    if (video.platform === "youtube") setJumpMs(ms)
  }
  // Clicking a line jumps the player: the kept copy itself, or YouTube's embed. Instagram's and
  // TikTok's embeds can't start part way through.
  const canSeek = Boolean(saved?.playbackUrl) || (video.platform === "youtube" && !video.sample)

  const working = saved !== null && isSavedVideoWorking(saved.status)
  const platform = creatorPlatformLabels[video.platform]

  const perFollower = viewsPerFollower(video)
  const engagement = engagementPer100(video)

  const actions: MenuAction[] = [
    ...(video.sample
      ? []
      : [
          { label: `Open on ${platform}`, icon: <ExternalLinkIcon className="size-4" />, onSelect: () => window.open(video.url, "_blank", "noopener,noreferrer") },
          { label: "Copy link", icon: <LinkIcon className="size-4" />, onSelect: () => void copyLink() },
          {
            label: "Copy to another project",
            icon: <CopyPlusIcon className="size-4" />,
            onSelect: () => setCopying({ kind: "video", url: video.url, title: video.title }),
          },
        ]),
    ...(video.sample || saved
      ? []
      : [{ label: "Download, no AI", icon: <DownloadIcon className="size-4" />, disabled: busy !== null, onSelect: () => void onSave(false) }]),
    // Shown only while Viral keeps a copy (Tyler, 6 Nov 2026: "Both ⋮ menus").
    ...(saved?.playbackUrl
      ? [{ label: "Download to computer", icon: <HardDriveDownloadIcon className="size-4" />, onSelect: () => downloadToComputer("video", saved.id) }]
      : []),
    ...(saved?.status === "failed"
      ? [{ label: "Try the download again", icon: <RotateCwIcon className="size-4" />, disabled: busy !== null, onSelect: () => void onTryAgain() }]
      : []),
    ...(onSameIdea ? [{ label: "Same idea, other creators", icon: <UsersIcon className="size-4" />, onSelect: () => onSameIdea(video) }] : []),
    ...(onHideChannel
      ? [{ label: `Hide ${video.channelName || "this channel"}`, icon: <EyeOffIcon className="size-4" />, onSelect: () => onHideChannel(video) }]
      : []),
    ...(saved && onDeleted
      ? [{ label: "Delete the saved video", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleting(true) }]
      : []),
  ]

  return (
    // The left page's cover carries on behind this header (the Admin 3 panel design: "always connect right panel to the left panel bg").
    <div className="relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <RightPanelCover />
      <div>
        <DashboardCardHeader className={cn("gap-2", cover && "border-b-transparent")}>
          {onBack ? (
            <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-lg" aria-label="Back to the creator" onClick={onBack}>
              <ArrowLeftIcon className="size-4" />
            </Button>
          ) : (
            <span className="ml-1 flex size-6 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
              <SocialIcon social={video.platform} />
            </span>
          )}
          <span className="grid min-w-0 flex-1 leading-tight">
            <h2 className="font-heading truncate text-[0.891rem] font-medium">{video.title}</h2>
            {video.channelName && onOpenChannel ? (
              <span className="truncate text-xs text-muted-foreground">
                <button type="button" className="hover:text-foreground hover:underline" onClick={() => onOpenChannel(video)}>
                  {video.channelName}
                </button>
              </span>
            ) : (
              <span className="truncate text-xs text-muted-foreground">{video.channelName || platform}</span>
            )}
          </span>
          <RecordMenu label="Video menu" actions={actions} />
          <SidePanelCollapseButton side="right" label="Hide the video" />
        </DashboardCardHeader>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)]">
          <Player
            video={video}
            saved={saved}
            playerRef={playerRef}
            onTime={setAtMs}
            startAtMs={jumpMs ?? startAtMs}
            autoplay={jumpMs !== undefined}
          />

          {/* Everything under the player is a card, like the AI's (Tyler, 4 Nov 2026: "all these should be in cards"). */}
          <div data-side-panel-body="" className={cn("grid grid-cols-[minmax(0,1fr)] gap-3.75 pt-3.75", PANEL_GUTTER)}>
          {/* What is said comes first, right under the video, and a click on a line plays from it (Tyler, 4 Nov
              2026: "the what is said card should be under video and clicking on the text takes me to that part of
              the video"). */}
          {saved?.breakdown ? (
            <BreakdownPanel only="words" breakdown={saved.breakdown} onSeek={canSeek ? seek : undefined} atMs={atMs} />
          ) : null}
          <PanelCard storageId="viral-video-numbers" title="Numbers">
          {/* Label and number on one row, like Details: three across did not fit a narrow panel. */}
          <dl className="grid gap-2 text-sm">
            <Detail label="Views" value={formatCount(video.views)} />
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Since yesterday</dt>
              <dd className="min-w-0 text-right font-medium">
                <RisingBadge growth={video.growth} />
              </dd>
            </div>
            <Detail label="Likes" value={formatCount(video.likes)} />
            <Detail label="Comments" value={formatCount(video.comments)} />
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Outlier</dt>
              <dd className="min-w-0 text-right font-medium">
                <OutlierBadge outlier={video.outlier} />
              </dd>
            </div>
            <Detail label="Engagement" value={engagement === null ? "-" : `${engagement.toFixed(1)} per 100`} />
            <Detail label="Per follower" value={perFollower === null ? "-" : `${perFollower >= 10 ? Math.round(perFollower) : perFollower.toFixed(1)}x`} />
          </dl>

          <ViralScoreBlock score={video.score} postedAt={video.postedAt} />
          </PanelCard>

          <PanelCard storageId="viral-video-details" title="Details">
            <dl className="grid gap-2 text-sm">
              <Detail label="Length" value={formatDuration(video.durationSeconds) || "-"} />
              <Detail label="Views a day" value={formatCount(video.score.viewsPerDay)} />
              <Detail label="Fits the topic" value={video.topicMatch === null ? "-" : `${video.topicMatch} of 100`} />
              {video.keywords.length ? (
                <Detail label="Found by" value={video.keywords.map((keyword) => `“${keyword}”`).join(", ")} />
              ) : null}
              {video.sound ? <Detail label="Sound" value={soundLabel(video.sound)} /> : null}
            </dl>
          </PanelCard>

          <CommentsCard video={video} projectId={projectId} />

          {working ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {savedVideoStatusLabels[saved.status]}…
            </p>
          ) : saved?.status === "failed" ? (
            <ErrorRow message={saved.error ?? "The video could not be saved."} onRetry={() => void onTryAgain()} />
          ) : null}

          <AnalyseSection
            video={video}
            saved={saved}
            onSaved={setSaved}
            projectId={projectId}
            projectTopic={projectTopic}
            onVaultChanged={onVaultChanged}
            footer={footer}
          />

          {saved?.breakdown ? (
            <BreakdownPanel
              only="structure"
              breakdown={saved.breakdown}
              onSeek={canSeek ? seek : undefined}
              atMs={atMs}
            />
          ) : null}
          </div>
        </div>
      </ScrollArea>
      {/* The sticky footer, as Project's task panel has one: Save to vault and Send to Video, drawn by the
          Analyse section. */}
      <div ref={setFooter} className={cn("shrink-0 border-t empty:hidden", PANEL_FOOTER_PADDING)} />
      <CopyToProjectDialog target={copying} currentProjectId={projectId} onClose={() => setCopying(null)} />

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
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * The player. Once the file has been downloaded it plays from the bucket,
 * which is the copy the breakdown's timings belong to. Before that, YouTube's
 * and Instagram's own embeds stand in; TikTok gets its cover and a way out.
 */
function Player({
  video,
  saved,
  playerRef,
  onTime,
  startAtMs,
  autoplay = false,
}: {
  video: ViralVideo
  saved: SavedVideoDetail | null
  playerRef: React.RefObject<HTMLVideoElement | null>
  onTime: (ms: number) => void
  startAtMs?: number
  /** Start playing at once: the viewer clicked a line of What is said. */
  autoplay?: boolean
}) {
  if (video.sample) {
    const length = formatDuration(video.durationSeconds)
    return (
      <div className="relative flex aspect-[9/16] max-h-[60vh] w-full flex-col items-center justify-center gap-3 bg-neutral-900 p-6 text-center">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-white/10 text-white">
          <PlayIcon className="size-4 fill-current" />
        </span>
        <p className="text-xs text-white/70">A sample has nothing to play.</p>
        {length ? (
          <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
            {length}
          </span>
        ) : null}
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
        onLoadedMetadata={(event) => {
          if (startAtMs) event.currentTarget.currentTime = startAtMs / 1000
        }}
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
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.platformVideoId)}${
          startAtMs ? `?start=${Math.floor(startAtMs / 1000)}${autoplay ? "&autoplay=1" : ""}` : ""
        }`}
        title={video.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        className="aspect-[9/16] max-h-[60vh] w-full border-0 bg-black"
      />
    )
  }
  if (video.platform === "instagram") {
    return (
      <iframe
        // Instagram's own player page, the one its Embed button gives out. It
        // needs no script of Instagram's on this page, and plays in the frame.
        // Unlike YouTube there is no address that keeps Instagram from
        // knowing who is watching.
        src={`https://www.instagram.com/p/${encodeURIComponent(video.platformVideoId)}/embed/`}
        title={video.title}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        className="h-[70vh] w-full border-0 border-b bg-background"
      />
    )
  }
  const platform = creatorPlatformLabels[video.platform]
  return (
    <div className="flex flex-col items-center gap-3 border-b p-3">
      <CoverImage
        src={video.thumbnailUrl}
        className="max-h-[40vh] rounded-md object-contain"
        fallback={null}
      />
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

/** One cell of the strip under the player: a small label over a bold figure. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  )
}
