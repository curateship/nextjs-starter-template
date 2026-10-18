import * as React from "react"
import {
  AudioLinesIcon,
  CheckIcon,
  CircleCheckIcon,
  FilmIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react"

import { SampleBadge } from "@/components/note-videos/sample-badge"
import { SiteLogo } from "@/components/note-videos/site-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { focusRing } from "@/lib/layout/focus-ring"
import { siteName } from "@/lib/note/sites"
import { cn } from "@/lib/utils"
import {
  formatTimecode,
  isMoving,
  statusWords,
  type NoteFolder,
  type NoteVideoCard,
} from "@/lib/note/videos"
import type { NoteVideoView } from "@/lib/note/view-key"

/**
 * The middle panel's cards, as a grid of covers or a list of rows. Each shows
 * the cover, title, site and length, where the video has got to, and once it
 * is analysed the first line of the summary and its tags, a Done tick when
 * every step of the plan is ticked, and the first line of the person's note.
 *
 * A click anywhere on a card picks it. The title is the card's button, so the
 * keyboard reaches it, and Try again and the menu are buttons of their own
 * beside it rather than inside it.
 */

/** A file still on its way up from the computer. It has no row until it lands. */
export type PendingUpload = {
  key: string
  name: string
  kind: "video" | "audio"
  fraction: number
}

export type CardActions = {
  folders: NoteFolder[]
  onPick: (video: NoteVideoCard) => void
  onMove: (video: NoteVideoCard, folderId: string | null) => void
  onDelete: (video: NoteVideoCard) => void
  onRetry: (video: NoteVideoCard) => void
}

export function VideoCards({
  view,
  videos,
  uploads,
  pickedId,
  actions,
}: {
  view: NoteVideoView
  videos: NoteVideoCard[]
  uploads: PendingUpload[]
  pickedId: string | null
  actions: CardActions
}) {
  if (view === "list") {
    return (
      <ul aria-label="Videos" className="divide-y border-b">
        {uploads.map((upload) => (
          <li key={upload.key} className="flex items-center gap-3 px-3 py-2">
            <Thumb kind={upload.kind} coverUrl={null} className="h-12 w-20" />
            <UploadingLine upload={upload} />
          </li>
        ))}
        {videos.map((video) => (
          <li
            key={video.id}
            data-video-id={video.id}
            onClick={() => actions.onPick(video)}
            className={cn(
              "flex cursor-pointer items-start gap-3 px-3 py-2",
              video.id === pickedId ? "bg-muted" : "hover:bg-muted/50"
            )}
          >
            <Thumb kind={video.kind} coverUrl={video.coverUrl} className="h-12 w-20" />
            <span className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-4">
              <span className="grid min-w-0 gap-1">
                <TitleButton video={video} picked={video.id === pickedId} clamp="line-clamp-1" />
                <SourceLine video={video} />
              </span>
              <span className="grid min-w-0 gap-1">
                <StatusLine video={video} onRetry={actions.onRetry} />
                <Analysed video={video} clamp="line-clamp-1" />
              </span>
            </span>
            <CardMenu video={video} actions={actions} className="shrink-0" />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul
      aria-label="Videos"
      className="grid gap-3 p-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
    >
      {uploads.map((upload) => (
        <li key={upload.key} className="overflow-hidden rounded-lg border bg-card">
          <Thumb kind={upload.kind} coverUrl={null} className="aspect-video w-full rounded-none" />
          <span className="block p-2">
            <UploadingLine upload={upload} />
          </span>
        </li>
      ))}
      {videos.map((video) => (
        <li
          key={video.id}
          data-video-id={video.id}
          onClick={() => actions.onPick(video)}
          className={cn(
            "relative cursor-pointer overflow-hidden rounded-lg border bg-card hover:bg-muted/30",
            video.id === pickedId && "ring-2 ring-primary"
          )}
        >
          <span className="relative block">
            <Thumb kind={video.kind} coverUrl={video.coverUrl} className="aspect-video w-full rounded-none" />
            {video.durationSeconds ? (
              <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[11px] text-white tabular-nums">
                {formatTimecode(video.durationSeconds * 1000)}
              </span>
            ) : null}
          </span>
          <span className="grid gap-1 p-2">
            <TitleButton video={video} picked={video.id === pickedId} clamp="line-clamp-2" />
            <SourceLine video={video} hideLength />
            <StatusLine video={video} onRetry={actions.onRetry} />
            <Analysed video={video} clamp="line-clamp-2" />
          </span>
          <CardMenu
            video={video}
            actions={actions}
            className="absolute top-1 right-1 rounded-md bg-background/90"
          />
        </li>
      ))}
    </ul>
  )
}

/** The cover, or a plain fill with a sound or film mark when there is none. */
function Thumb({
  kind,
  coverUrl,
  className,
}: {
  kind: "video" | "audio"
  coverUrl: string | null
  className?: string
}) {
  const [broken, setBroken] = React.useState(false)
  const Icon = kind === "audio" ? AudioLinesIcon : FilmIcon
  return (
    <span className={cn("block shrink-0 overflow-hidden rounded-sm bg-muted", className)}>
      {coverUrl && !broken ? (
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="grid size-full place-items-center">
          <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
      )}
    </span>
  )
}

/**
 * The title, as the card's button. Its click bubbles to the card, which does
 * the picking, so a click on the title and a click on the cover are the same.
 */
function TitleButton({
  video,
  picked,
  clamp,
}: {
  video: NoteVideoCard
  picked: boolean
  clamp: string
}) {
  return (
    <span className="flex min-w-0 items-start gap-2">
      <button
        type="button"
        aria-current={picked ? "true" : undefined}
        className={cn(
          "min-w-0 flex-1 rounded-sm text-left text-sm leading-snug font-medium",
          clamp,
          focusRing
        )}
      >
        {video.title}
      </button>
      {video.sample ? <SampleBadge /> : null}
    </span>
  )
}

function SourceLine({ video, hideLength }: { video: NoteVideoCard; hideLength?: boolean }) {
  const parts = [
    video.channelName ?? siteName(video.source),
    !hideLength && video.durationSeconds ? formatTimecode(video.durationSeconds * 1000) : null,
  ].filter(Boolean)
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <SiteLogo source={video.source} />
      <span className="sr-only">{siteName(video.source)}:</span>
      <span className="truncate tabular-nums">{parts.join(" · ")}</span>
    </span>
  )
}

/** Where the video has got to, with a spinner while it is still moving. */
function StatusLine({
  video,
  onRetry,
}: {
  video: NoteVideoCard
  onRetry: (video: NoteVideoCard) => void
}) {
  if (video.sample) return null
  if (video.status === "failed") {
    // An upload with no file left has nothing to fetch again.
    const canRetry = video.hasFile || video.sourceUrl !== null
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="min-w-0 text-destructive">{statusWords(video)}</span>
        {canRetry ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              onRetry(video)
            }}
          >
            Try again
          </Button>
        ) : null}
      </span>
    )
  }
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {isMoving(video.status) ? <Loader2Icon className="size-3.5 shrink-0 animate-spin" /> : null}
      {statusWords(video)}
    </span>
  )
}

function UploadingLine({ upload }: { upload: PendingUpload }) {
  return (
    <span className="grid min-w-0 gap-1">
      <span className="truncate text-sm font-medium">{upload.name}</span>
      <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
        Uploading {Math.round(upload.fraction * 100)}%
      </span>
    </span>
  )
}

/** The first summary line, the tags, the Done tick and the person's note. */
function Analysed({ video, clamp }: { video: NoteVideoCard; clamp: string }) {
  const hasAnything =
    video.firstSummaryLine || video.tags.length || video.done || video.noteFirstLine
  if (!hasAnything) return null
  return (
    <span className="grid min-w-0 gap-1">
      {video.firstSummaryLine ? (
        <span className={cn("text-xs text-muted-foreground", clamp)}>{video.firstSummaryLine}</span>
      ) : null}
      {video.tags.length ? (
        <span className="flex flex-wrap gap-1">
          {video.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              {tag}
            </Badge>
          ))}
        </span>
      ) : null}
      {video.done ? (
        <span className="flex items-center gap-1 text-xs font-medium">
          <CircleCheckIcon className="size-3.5 text-primary" aria-hidden="true" />
          Done
        </span>
      ) : null}
      {video.noteFirstLine ? (
        <span className="truncate text-xs italic">{video.noteFirstLine}</span>
      ) : null}
    </span>
  )
}

/**
 * Move to folder and Delete. The sample has neither, because it is not saved.
 * Clicks inside stop here, so opening the menu never also picks the card.
 */
function CardMenu({
  video,
  actions,
  className,
}: {
  video: NoteVideoCard
  actions: CardActions
  className?: string
}) {
  if (video.sample) return null
  return (
    <span className={className} onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${video.title}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
          {actions.folders.map((folder) => (
            <DropdownMenuItem key={folder.id} onSelect={() => actions.onMove(video, folder.id)}>
              <CheckIcon className={video.folderId === folder.id ? "opacity-100" : "opacity-0"} />
              <span className="truncate">{folder.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => actions.onMove(video, null)}>
            <CheckIcon className={video.folderId === null ? "opacity-100" : "opacity-0"} />
            <span className="text-muted-foreground">No folder</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(video)}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
