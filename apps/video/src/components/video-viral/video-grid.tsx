import * as React from "react"
import { FilmIcon, Loader2Icon } from "lucide-react"

import {
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollBar } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { StarMenu, type Favourites } from "@/components/video-viral/star-menu"
import { ViralScoreCell } from "@/components/video-viral/viral-score-cell"
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
} from "@/lib/video/creators"
import {
  SHORT_MAX_SECONDS,
  type ViralCreator,
  type ViralVideo,
} from "@/lib/video/viral"
import { formatShortDay, type ViralCardSize, type ViralSort } from "@/lib/video/viral-view"

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
  favourites: Favourites
  onFavouritesChanged: () => Promise<void>
  projectId: string | null
  /** A button drawn under each card, such as Break it down on the Downloaded tab. */
  cardAction?: (video: ViralVideo) => React.ReactNode
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
              <span className="line-clamp-2 text-sm leading-snug font-medium">
                {video.title}
              </span>
              <PastedChip video={video} />
              <span className="truncate text-xs text-muted-foreground">
                {video.channelName || creatorPlatformLabels[video.platform]}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular-nums">
                <span>{formatCount(video.views)} views</span>
                {video.postedAt ? <span>{formatDate(video.postedAt)}</span> : null}
              </span>
              <SavedChip status={video.savedStatus} />
            </span>
          </button>
          {props.cardAction ? (
            <span className="grid px-2 pb-2">{props.cardAction(video)}</span>
          ) : null}
          {ticked && onTick ? (
            <span className="absolute top-1.5 left-1.5 flex items-center rounded-md bg-background/90 p-1">
              <Checkbox
                checked={ticked.has(video.key)}
                onCheckedChange={() => onTick(video.key)}
                aria-label={`Tick ${video.title}`}
              />
            </span>
          ) : null}
          {video.sample ? null : (
            <span className="absolute top-1 right-1 rounded-md bg-background/90">
              <StarMenu
                videos={[video]}
                favourites={props.favourites}
                sourceProjectId={props.projectId}
                onChanged={props.onFavouritesChanged}
              />
            </span>
          )}
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
  // TikTok's cover addresses expire after a few days, so a cover that will
  // not load shows the plain film icon instead of a broken picture.
  const [broken, setBroken] = React.useState(false)
  return (
    <span
      className={cn(
        "relative block bg-muted",
        wide ? "aspect-video" : "aspect-[9/16]"
      )}
    >
      {video.thumbnailUrl && !broken ? (
        <img
          src={video.thumbnailUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="grid size-full place-items-center">
          <FilmIcon className="size-6 text-muted-foreground" />
        </span>
      )}
      <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
        {video.score.score}
      </span>
      {length ? (
        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[11px] text-white tabular-nums">
          {length}
        </span>
      ) : null}
      {video.isNew ? (
        <Badge className="absolute bottom-6 left-1">New</Badge>
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
      <Badge
        variant={
          saved === "failed" ? "destructive" : saved === "ready" ? "default" : "secondary"
        }
      >
        {savedVideoStatusLabels[saved] ?? status}
      </Badge>
    </span>
  )
}

const LIST_COLUMNS: TableHeaderColumn<ViralSort>[] = [
  // The video takes the spare width, so the figures sit together at the right.
  { key: "video", label: "Video", sortable: false, column: "main", className: "w-full min-w-56" },
  { key: "score", label: "Score", column: "meta" },
  { key: "topic", label: "Fits", column: "meta" },
  { key: "views", label: "Views", column: "meta" },
  { key: "views_per_day", label: "Views a day", column: "meta" },
  { key: "newest", label: "Posted", column: "meta" },
  { key: "length", label: "Length", sortable: false, column: "meta" },
]

export function VideoList({
  sort,
  direction,
  onSort,
  selectChip,
  ...props
}: GridProps & {
  sort: ViralSort
  direction: "asc" | "desc"
  onSort: (sort: ViralSort) => void
  /** The "Mass select" chip, beside the first column's heading. */
  selectChip?: React.ReactNode
}) {
  const { videos, selectedKey, onPick, ticked, onTick } = props
  const columns: TableHeaderColumn<ViralSort>[] = selectChip
    ? [
        {
          ...LIST_COLUMNS[0],
          sortable: false,
          className: "group/title w-full min-w-56",
          label: (
            <span className="flex items-center gap-2">
              Video
              {selectChip}
            </span>
          ),
        },
        ...LIST_COLUMNS.slice(1),
      ]
    : LIST_COLUMNS
  return (
    <>
      <Table containerClassName="overflow-visible">
        <SortableTableHeader
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={onSort}
          leading={ticked && onTick ? <TableHead column="select" /> : undefined}
          trailing={props.cardAction ? <TableHead column="meta" /> : undefined}
        />
        <TableBody>
          {videos.map((video) => (
            <TableRow
              key={video.key}
              aria-current={video.key === selectedKey ? "true" : undefined}
              data-processing={isProcessing(video) || undefined}
              className={cn(
                isProcessing(video) &&
                  "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-400/10 dark:hover:bg-amber-400/15",
                video.key === selectedKey && "bg-muted"
              )}
              rowAction={() => onPick(video)}
            >
              {ticked && onTick ? (
                <TableCell column="select">
                  <Checkbox
                    checked={ticked.has(video.key)}
                    onCheckedChange={() => onTick(video.key)}
                    aria-label={`Tick ${video.title}`}
                  />
                </TableCell>
              ) : null}
              <TableCell column="main" className="w-full max-w-0 min-w-56">
                <div className="flex items-center gap-3">
                  <span className="size-8 shrink-0 overflow-hidden rounded-md bg-muted">
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <button
                        type="button"
                        className="truncate text-left font-medium hover:underline"
                        onClick={() => onPick(video)}
                      >
                        {video.title}
                      </button>
                      {video.isNew ? <Badge>New</Badge> : null}
                      <PastedChip video={video} />
                    </span>
                    {/* Where saving has got to sits with the channel, leaving the title its row. */}
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs text-muted-foreground">
                        {video.channelName || creatorPlatformLabels[video.platform]}
                      </span>
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
                </div>
              </TableCell>
              <TableCell column="actions">
                <ViralScoreCell score={video.score} />
              </TableCell>
              <TableCell column="meta" className="tabular-nums">
                {video.topicMatch ?? "—"}
              </TableCell>
              <TableCell column="meta" className="tabular-nums">
                {formatCount(video.views)}
              </TableCell>
              <TableCell column="meta" className="tabular-nums">
                {formatCount(video.score.viewsPerDay)}
              </TableCell>
              <TableCell column="meta" className="whitespace-nowrap">
                {formatShortDay(video.postedAt)}
              </TableCell>
              <TableCell column="meta" className="tabular-nums">
                {formatDuration(video.durationSeconds) || "—"}
              </TableCell>
              {props.cardAction ? (
                <TableCell column="actions">{props.cardAction(video)}</TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </>
  )
}

/**
 * The Creators view: one row per channel, most hits first. A followed
 * creator's row also carries the watch timer's switch and when it last
 * looked. Creators found only through search results are never checked, so
 * their rows have neither.
 */
export function CreatorList({
  creators,
  selectedKey,
  onPick,
  onWatchChange,
}: {
  creators: ViralCreator[]
  selectedKey: string | null
  onPick: (creator: ViralCreator) => void
  /** Check for new posts, switched on or off for one followed creator. */
  onWatchChange?: (creator: ViralCreator, watch: boolean) => void
}) {
  return (
    // Sized for the left panel's Creators section, as Tyler drew it. A
    // followed creator's row carries its typical score and its last check in
    // the muted line and the watch switch at the right (20 Oct 2026); one the
    // search found has its typical score at the right instead.
    <ul aria-label="Creators" className="-mx-2 grid grid-cols-[minmax(0,1fr)] gap-0.5">
      {creators.map((creator) => {
        const watched = Boolean(creator.followedId && onWatchChange)
        return (
          <li
            key={creator.key}
            className={cn("flex min-w-0 items-center rounded-md", creator.key === selectedKey && "bg-muted")}
          >
            <button
              type="button"
              aria-current={creator.key === selectedKey ? "true" : undefined}
              onClick={() => onPick(creator)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left",
                creator.key === selectedKey ? null : "hover:bg-muted/60",
                focusRing
              )}
            >
              <Avatar className="size-8 shrink-0">
                {creator.avatarUrl ? (
                  <AvatarImage src={creator.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback className="text-xs font-medium">
                  {initials(creator.name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{creator.name}</span>
                  {creator.followedId ? (
                    <Badge variant="secondary">
                      {creator.watch === false ? "Paused" : "Following"}
                    </Badge>
                  ) : null}
                </span>
                {/* "10m ago" is worked out on the server and again in the
                    browser; a load that crosses a minute says "11m ago" the
                    second time, which is not worth a hydration error. */}
                <span className="truncate text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
                  {[
                    creator.subscribers !== null ? `${formatCount(creator.subscribers)} subs` : null,
                    `${creator.hits} ${creator.hits === 1 ? "hit" : "hits"}`,
                    watched ? `${creator.typicalScore ?? "—"} typical` : null,
                    watched ? checkedAgo(creator.lastCheckedAt) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {watched ? null : (
                <span className="grid shrink-0 text-right leading-tight">
                  <span className="text-sm font-semibold tabular-nums">{creator.typicalScore ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">typical</span>
                </span>
              )}
            </button>
            {watched && onWatchChange ? (
              <WatchSwitch creator={creator} onWatchChange={onWatchChange} />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** "Five Minute Moves" → "FM", "@yayaxixi" → "YA": two letters for a creator with no picture. */
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
