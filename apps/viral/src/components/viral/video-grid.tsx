import type * as React from "react"
import { EyeIcon, FilmIcon, Loader2Icon } from "lucide-react"

import { Chip, CrmTable, CrmTableRow, OpenBar } from "@/components/crm/crm-table"

import { type TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TableCell } from "@/components/ui/table"
import { ViralScoreCell } from "@/components/viral/viral-score-cell"
import { formatDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import {
  creatorPlatformLabels,
  formatCount,
  formatDuration,
  isSavedVideoWorking,
  savedVideoStatusLabels,
  type SavedVideoStatus,
} from "@/lib/viral/creators"
import {
  SHORT_MAX_SECONDS,
  type ViralCreator,
  type ViralVideo,
} from "@/lib/viral/viral"
import { formatShortDay, type ViralCardSize, type ViralSort } from "@/lib/viral/viral-view"
import { CoverImage } from "@/components/viral/cover-image"
import { OutlierBadge } from "@/components/viral/outlier-badge"
import { RisingBadge } from "@/components/viral/rising-badge"
import { SocialIcon } from "@/components/viral/social-icon"
import { isRising } from "@/lib/viral/rising"

/**
 * The middle panel's two ways to show videos, a grid of covers or a list of
 * rows, and the creators list. Picking a video only plays it on the right:
 * nothing is downloaded and nothing is spent.
 */

const CARD_MIN_WIDTH: Record<ViralCardSize, number> = {
  small: 120,
  medium: 160,
  large: 220,
}

type GridProps = {
  videos: ViralVideo[]
  selectedKey: string | null
  onPick: (video: ViralVideo) => void
  /** Left out where ticked videos have nothing to be done to them. */
  ticked?: Set<string>
  onTick?: (key: string) => void
  /** Opens the video's channel as a creator page. Left out where it has none. */
  onPickChannel?: (video: ViralVideo) => void
  /** Whether this video's channel has a creator page to open. */
  hasChannel?: (video: ViralVideo) => boolean
}

/** New until this person opens it (Tyler, 4 Nov 2026: "Opening that video"). */
function showsNew(video: ViralVideo) {
  return video.isNew && !video.seen
}

/**
 * The channel's name under a title: a button to its creator page where the
 * screen has one, plain text otherwise.
 */
function ChannelName({ video, onPickChannel }: { video: ViralVideo; onPickChannel?: (video: ViralVideo) => void }) {
  const name = video.channelName || creatorPlatformLabels[video.platform]
  if (!onPickChannel || !video.channelName) {
    return <span className="truncate text-xs text-muted-foreground">{name}</span>
  }
  return (
    <button
      type="button"
      className="truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
      onClick={(event) => {
        event.stopPropagation()
        onPickChannel(video)
      }}
    >
      {name}
    </button>
  )
}

export function VideoGrid({
  size,
  ...props
}: GridProps & { size: ViralCardSize }) {
  const { videos, selectedKey, onPick, ticked, onTick } = props
  return (
    <ul
      aria-label="Videos"
      className="grid gap-3 p-3"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH[size]}px, 1fr))`,
      }}
    >
      {videos.map((video) => (
        <li
          key={video.key}
          data-processing={isProcessing(video) || undefined}
          className={cn(
            "group relative overflow-hidden rounded-lg border bg-card",
            isProcessing(video) && processingCardClassName,
            video.key === selectedKey && "ring-2 ring-primary"
          )}
        >
          <button
            type="button"
            aria-current={video.key === selectedKey ? "true" : undefined}
            onClick={() => onPick(video)}
            className={cn("block w-full text-left", focusRing)}
          >
            <Cover video={video} />
            <ProcessingStrip video={video} />
            <span className="grid gap-1 p-2">
              <span
                className={cn(
                  "line-clamp-2 text-sm leading-snug font-medium",
                  video.seen && "font-normal text-muted-foreground"
                )}
              >
                {video.title}
              </span>
              <PastedChip video={video} />
              {/* Plain text here: the card is already one button, and a button can't hold another. */}
              <ChannelName video={video} />
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular-nums">
                <span>{formatCount(video.views)} views</span>
                {video.postedAt ? <span>{formatDate(video.postedAt)}</span> : null}
              </span>
              <SavedChip status={video.savedStatus} />
            </span>
          </button>
          {ticked && onTick ? (
            <span className="absolute top-1.5 left-1.5 flex items-center rounded-md bg-background/90 p-1">
              <Checkbox
                checked={ticked.has(video.key)}
                onCheckedChange={() => onTick(video.key)}
                aria-label={`Tick ${video.title}`}
              />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * The still at the top of a card. Upright for a Short, wide for anything
 * longer, so a cover is never cropped into a shape it was not shot in.
 */
function Cover({ video }: { video: ViralVideo }) {
  const length = formatDuration(video.durationSeconds)
  const wide = (video.durationSeconds ?? 0) > SHORT_MAX_SECONDS
  return (
    <span
      className={cn(
        "relative block bg-muted",
        wide ? "aspect-video" : "aspect-[9/16]"
      )}
    >
      <CoverImage
        src={video.thumbnailUrl}
        className="size-full object-cover"
        fallback={
          <span className="grid size-full place-items-center">
            <FilmIcon className="size-6 text-muted-foreground" />
          </span>
        }
      />
      <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
        {video.score.score}
      </span>
      {length ? (
        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[11px] text-white tabular-nums">
          {length}
        </span>
      ) : null}
      {showsNew(video) || isRising(video.growth) ? (
        <span className="absolute bottom-6 left-1 flex gap-1">
          {showsNew(video) ? <Badge>New</Badge> : null}
          {isRising(video.growth) ? <RisingBadge growth={video.growth} /> : null}
        </span>
      ) : null}
    </span>
  )
}

/** True while the video is being downloaded or watched by the AI. */
function isProcessing(video: ViralVideo) {
  return (
    video.savedStatus !== null &&
    isSavedVideoWorking(video.savedStatus as SavedVideoStatus)
  )
}

/**
 * A video being saved and broken down stands out from across the grid, in
 * the amber the app already uses for things that need noticing, so it is
 * still plain which one is working after somebody clicks another.
 */
const processingCardClassName =
  "border-amber-400 bg-amber-50 dark:border-amber-400/70 dark:bg-amber-400/10"

/** The line under the cover saying what the working video is doing now. */
function ProcessingStrip({ video }: { video: ViralVideo }) {
  if (!isProcessing(video)) return null
  return (
    <span
      role="status"
      className="flex items-center gap-1.5 border-y border-amber-400 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-950 dark:bg-amber-400/20 dark:text-amber-100"
    >
      <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
      {savedVideoStatusLabels[video.savedStatus as SavedVideoStatus]}…
    </span>
  )
}

/** A video pasted in by its link, which no search or followed creator found. */
function PastedChip({ video }: { video: ViralVideo }) {
  return video.source === "link" ? (
    <span>
      <Badge variant="outline">Pasted</Badge>
    </span>
  ) : null
}

/** Broken down, or failed. A video still working has its strip instead. */
function SavedChip({ status }: { status: string | null }) {
  if (!status) return null
  const saved = status as SavedVideoStatus
  if (isSavedVideoWorking(saved)) return null
  return (
    <span>
      <Badge variant={saved === "failed" ? "destructive" : "outline"}>
        {savedVideoStatusLabels[saved] ?? status}
      </Badge>
    </span>
  )
}

/**
 * The columns, each dropping out as the middle narrows, only once there is
 * room for every column before it, so the table never runs past its panel
 * (the Admin 3 panel design, "A table"). `md:hidden` keeps the table's own
 * `md:table-cell` from showing them on any laptop.
 */
const LIST_COLUMNS: TableHeaderColumn<ViralSort>[] = [
  { key: "video", label: "Video", sortable: false, column: "main", className: "min-w-40" },
  { key: "score", label: "Score", column: "meta", className: "hidden md:hidden @md:table-cell" },
  { key: "rising", label: "Rising", column: "meta", className: "hidden md:hidden @lg:table-cell" },
  { key: "views", label: "Views", column: "meta", className: "hidden md:hidden @xl:table-cell" },
  { key: "outlier", label: "Outlier", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  { key: "topic", label: "Fits", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
  { key: "views_per_day", label: "Views a day", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
  { key: "newest", label: "Posted", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
  { key: "length", label: "Length", column: "meta", className: "hidden md:hidden @6xl:table-cell" },
]

/**
 * The project's videos as a list, on the shell's table (`CrmTable`): grey
 * titles that turn dark while pointed at and while open, the sliding bar
 * before the open one, chips in grey, and a column heading that sorts. A
 * video nobody opened says New. A row being saved or broken down says so
 * under its title, in amber. Right-click opens the row's menu.
 */
export function VideoList({
  sort,
  direction,
  onSort,
  onRightClick,
  onTickAll,
  empty,
  ...props
}: GridProps & {
  sort: ViralSort
  direction: "asc" | "desc"
  onSort: (sort: ViralSort) => void
  onRightClick?: (video: ViralVideo, x: number, y: number) => void
  /** The heading's tick box, while Mass select is on. */
  onTickAll?: () => void
  empty?: React.ReactNode
}) {
  const { videos, selectedKey, onPick, ticked, onTick, onPickChannel, hasChannel } = props
  const ticking = Boolean(ticked && onTick)
  const keys = videos.map((video) => video.key)
  const all = keys.length > 0 && keys.every((key) => ticked?.has(key))
  const some = keys.some((key) => ticked?.has(key))
  return (
    <CrmTable<ViralSort>
      columns={LIST_COLUMNS}
      sort={sort}
      direction={direction}
      onSort={onSort}
      actions={false}
      select={ticking && onTickAll ? { noun: "videos", checked: all ? true : some ? "indeterminate" : false, onToggle: onTickAll } : null}
      empty={videos.length ? null : empty}
    >
      {videos.map((video) => (
        <CrmTableRow
          key={video.key}
          open={video.key === selectedKey}
          label={video.title}
          tick={ticking ? { shown: true, ticked: ticked?.has(video.key) ?? false, onToggle: () => onTick?.(video.key) } : null}
          onOpen={() => onPick(video)}
          onRightClick={onRightClick ? (x, y) => onRightClick(video, x, y) : undefined}
        >
          <TableCell column="main" className="min-w-40">
            <span data-processing={isProcessing(video) || undefined} className="flex min-w-0 items-center gap-2">
              <OpenBar />
              <span className="size-7 shrink-0 overflow-hidden rounded-md bg-muted">
                <CoverImage
                  src={video.thumbnailUrl}
                  className="size-full object-cover"
                  fallback={
                    <span className="grid size-full place-items-center">
                      <FilmIcon className="size-3.5 text-muted-foreground" />
                    </span>
                  }
                />
              </span>
              <span className="grid min-w-0 leading-tight">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span data-row-name="" className="line-clamp-1 min-w-0 font-medium break-all">
                    {video.title}
                  </span>
                  {showsNew(video) ? <Chip className="shrink-0">New</Chip> : null}
                  {video.source === "link" ? <Chip className="shrink-0" muted>Pasted</Chip> : null}
                </span>
                {/* Where saving has got to sits with the channel, leaving the title its row. */}
                <span className="flex min-w-0 items-center gap-1.5">
                  <ChannelName
                    video={video}
                    onPickChannel={onPickChannel && (hasChannel?.(video) ?? true) ? onPickChannel : undefined}
                  />
                  {isProcessing(video) ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                      <Loader2Icon className="size-3.5 animate-spin" />
                      {savedVideoStatusLabels[video.savedStatus as SavedVideoStatus]}…
                    </span>
                  ) : (
                    <SavedChip status={video.savedStatus} />
                  )}
                </span>
              </span>
            </span>
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @md:table-cell">
            <ViralScoreCell score={video.score} />
          </TableCell>
          <TableCell column="meta" className="hidden whitespace-nowrap md:hidden @lg:table-cell">
            <RisingBadge growth={video.growth} />
          </TableCell>
          <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @xl:table-cell">
            {formatCount(video.views)}
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @2xl:table-cell">
            <OutlierBadge outlier={video.outlier} />
          </TableCell>
          <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @3xl:table-cell">
            {video.topicMatch ?? "-"}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @4xl:table-cell">
            {formatCount(video.score.viewsPerDay)}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden whitespace-nowrap md:hidden @5xl:table-cell">
            {formatShortDay(video.postedAt)}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @6xl:table-cell">
            {formatDuration(video.durationSeconds) || "-"}
          </TableCell>
        </CrmTableRow>
      ))}
    </CrmTable>
  )
}

const CREATOR_COLUMNS: TableHeaderColumn<"creator">[] = [
  { key: "creator", label: "Creator", sortable: false, column: "main", className: "min-w-40" },
  { key: "subscribers", label: "Subscribers", sortable: false, column: "meta", className: "hidden md:hidden @md:table-cell" },
  { key: "hits", label: "Hits", sortable: false, column: "meta", className: "hidden md:hidden @lg:table-cell" },
  { key: "typical", label: "Typical", sortable: false, column: "meta", className: "hidden md:hidden @xl:table-cell" },
  { key: "checked", label: "Checked", sortable: false, column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  { key: "watch", label: "New posts", sortable: false, column: "meta" },
]

/**
 * The project's creators on the Creators tab, on the shell's table, most hits
 * first (Tyler, 21 Nov 2026: "Move the creators block into the middle tab
 * here"). YouTube's and TikTok's share the list, each marked with its
 * social. A row opens their page of videos; the eye in the action column
 * shows them on the right, as the Viral dashboard's Projects rows do. A followed creator's row has the watch timer's switch and when it
 * last looked; a creator found only through search results is never checked,
 * so their row has neither.
 */
export function CreatorTable({
  creators,
  openKey,
  onOpen,
  onShow,
  onWatchChange,
  empty,
}: {
  creators: ViralCreator[]
  /** The creator shown on the right, marked open. */
  openKey: string | null
  /** A press on the row: their page of videos. */
  onOpen: (creator: ViralCreator) => void
  /** The eye in the action column: the creator on the right, the list staying put. */
  onShow: (creator: ViralCreator) => void
  /** Check for new posts, switched on or off for one followed creator. */
  onWatchChange?: (creator: ViralCreator, watch: boolean) => void
  empty?: React.ReactNode
}) {
  return (
    <CrmTable<"creator">
      columns={CREATOR_COLUMNS}
      sort="creator"
      direction="desc"
      onSort={() => undefined}
      empty={creators.length ? null : empty}
    >
      {creators.map((creator) => {
        const watched = Boolean(creator.followedId && onWatchChange)
        return (
          <CrmTableRow
            key={creator.key}
            open={creator.key === openKey}
            label={creator.name}
            onOpen={() => onOpen(creator)}
            cog={false}
            buttons={[{ label: `Show ${creator.name} here`, icon: <EyeIcon className="size-4" />, onPress: () => onShow(creator) }]}
          >
            <TableCell column="main" className="min-w-40">
              <span className="flex min-w-0 items-center gap-2">
                <OpenBar />
                <Avatar className="size-7 shrink-0">
                  {creator.avatarUrl ? <AvatarImage src={creator.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="text-[0.625rem] font-medium">{initials(creator.name)}</AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 leading-tight">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span data-row-name="" className="line-clamp-1 min-w-0 font-medium break-all">
                      {creator.name}
                    </span>
                    {creator.followedId ? (
                      <Chip className="shrink-0" muted={creator.watch === false}>
                        {creator.watch === false ? "Paused" : "Following"}
                      </Chip>
                    ) : null}
                  </span>
                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground [&_svg]:size-3 [&_svg]:shrink-0">
                    <SocialIcon social={creator.platform} />
                    <span className="truncate">{creator.handle ? `@${creator.handle}` : creatorPlatformLabels[creator.platform]}</span>
                  </span>
                </span>
              </span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @md:table-cell">
              {creator.subscribers !== null ? formatCount(creator.subscribers) : "-"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @lg:table-cell">
              {creator.hits}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @xl:table-cell">
              {creator.typicalScore ?? "-"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden whitespace-nowrap md:hidden @2xl:table-cell">
              {creator.followedId ? checkedAgo(creator.lastCheckedAt) : "-"}
            </TableCell>
            <TableCell column="meta">
              {watched && onWatchChange ? <WatchSwitch creator={creator} onWatchChange={onWatchChange} /> : null}
            </TableCell>
          </CrmTableRow>
        )
      })}
    </CrmTable>
  )
}

function initials(name: string) {
  const words = name.replace(/^@/, "").trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)
  return letters.toUpperCase()
}

/**
 * "Check for new posts" for one followed creator, as a switch at the row's
 * right; what it does is on hover.
 */
function WatchSwitch({
  creator,
  onWatchChange,
}: {
  creator: ViralCreator
  onWatchChange: (creator: ViralCreator, watch: boolean) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 pr-1.5">
          <Switch
            checked={creator.watch !== false}
            onCheckedChange={(checked) => onWatchChange(creator, checked)}
            aria-label={`Check ${creator.name} for new posts`}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Check for new posts. The watch timer looks every six hours. They are one
        creator in every project they are in, so switching this off pauses them
        in all of those projects. Posts already saved stay.
      </TooltipContent>
    </Tooltip>
  )
}

/** "3h ago", "just now", "2d ago" or "not checked yet", after the typical score. */
function checkedAgo(at: string | null) {
  if (!at) return "not checked yet"
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / (24 * 60))}d ago`
}
