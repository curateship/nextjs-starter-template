import * as React from "react"
import {
  CheckIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  ListChecksIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { HIGHLIGHT_CLASS } from "@/lib/note/notes/colours"
import {
  distinctName,
  isPostMoving,
  postStatusWords,
  progressWords,
  type NotePostCard,
  type NotePostFolder,
  type PlanProgress,
} from "@/lib/note/posts/posts"
import { cn } from "@/lib/utils"

/**
 * The middle panel's cards, one row per post: a tick box for picking several,
 * the author's picture and name, the first lines of the post, its first
 * picture, the first highlight, where it has got to, and once analysed the
 * first line of the summary, the tags and how far the plan has got.
 *
 * A click anywhere on a row picks it. The author is the row's button, so the
 * keyboard reaches it; the tick box, a tag, Try again and the menu are buttons
 * of their own beside it.
 */

export type PostCardActions = {
  folders: NotePostFolder[]
  onPick: (post: NotePostCard) => void
  onMove: (post: NotePostCard, folderId: string | null) => void
  onDelete: (post: NotePostCard) => void
  onRetry: (post: NotePostCard) => void
  onTag: (tag: string) => void
}

export function PostCards({
  posts,
  pickedId,
  selected,
  onToggle,
  actions,
}: {
  posts: NotePostCard[]
  pickedId: string | null
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  actions: PostCardActions
}) {
  // An empty list draws nothing, so no stray line sits under the empty words.
  if (!posts.length) return null
  return (
    <ul aria-label="Posts" className="divide-y border-b">
      {posts.map((post) => (
        <li
          key={post.id}
          data-post-id={post.id}
          onClick={() => actions.onPick(post)}
          className={cn(
            "flex cursor-pointer items-start gap-3 px-3 py-2.5",
            post.id === pickedId ? "bg-muted" : "hover:bg-muted/50"
          )}
        >
          <span className="flex pt-0.5" onClick={(event) => event.stopPropagation()}>
            <Checkbox
              checked={selected.has(post.id)}
              onCheckedChange={() => onToggle(post.id)}
              aria-label={`Pick ${post.title}`}
            />
          </span>
          <Avatar post={post} />
          <span className="grid min-w-0 flex-1 gap-1">
            <TitleLine post={post} picked={post.id === pickedId} />
            {post.firstLines ? (
              <span className="line-clamp-3 text-sm text-foreground/90">{post.firstLines}</span>
            ) : null}
            {post.firstHighlight ? (
              <span className="line-clamp-2 text-xs">
                <span className={HIGHLIGHT_CLASS.yellow}>{post.firstHighlight}</span>
              </span>
            ) : null}
            <StatusLine post={post} onRetry={actions.onRetry} />
            <Analysed post={post} onTag={actions.onTag} />
          </span>
          {post.firstPictureUrl ? <Thumb url={post.firstPictureUrl} /> : null}
          <CardMenu post={post} actions={actions} />
        </li>
      ))}
    </ul>
  )
}

function Avatar({ post }: { post: NotePostCard }) {
  const [broken, setBroken] = React.useState(false)
  if (post.kind === "merged") {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
        <ListChecksIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
    )
  }
  if (post.authorPictureUrl && !broken) {
    return (
      <img
        src={post.authorPictureUrl}
        alt=""
        loading="lazy"
        className="size-8 shrink-0 rounded-full bg-muted object-cover"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium uppercase">
      {(post.authorHandle ?? "x").slice(0, 1)}
    </span>
  )
}

function Thumb({ url }: { url: string }) {
  const [broken, setBroken] = React.useState(false)
  if (broken) return null
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="hidden size-14 shrink-0 rounded-sm bg-muted object-cover sm:block"
      onError={() => setBroken(true)}
    />
  )
}

/** The author, as the row's button. Its click bubbles to the row, which does the picking. */
function TitleLine({ post, picked }: { post: NotePostCard; picked: boolean }) {
  const name = post.kind === "post" ? distinctName(post.authorName, post.authorHandle) : null
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <button
        type="button"
        aria-current={picked ? "true" : undefined}
        className={cn("min-w-0 truncate rounded-sm text-left text-sm font-medium", focusRing)}
      >
        {name ?? post.title}
      </button>
      {name && post.authorHandle ? (
        <span className="truncate text-xs text-muted-foreground">@{post.authorHandle}</span>
      ) : null}
      {post.postedAt ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">· {formatDate(post.postedAt)}</span>
      ) : null}
    </span>
  )
}

function StatusLine({ post, onRetry }: { post: NotePostCard; onRetry: (post: NotePostCard) => void }) {
  if (post.status === "failed") {
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="min-w-0 text-destructive">{postStatusWords(post)}</span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={(event) => {
            event.stopPropagation()
            onRetry(post)
          }}
        >
          Try again
        </Button>
      </span>
    )
  }
  const moving = isPostMoving(post)
  const words =
    post.status === "saved" && (post.videoStatus === "downloading" || post.videoStatus === "waiting")
      ? "Saving the video…"
      : postStatusWords(post)
  if (post.status === "ready" && !moving) return null
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {moving ? <Loader2Icon className="size-3.5 shrink-0 animate-spin" /> : null}
      {words}
    </span>
  )
}

const PROGRESS_ICON: Record<PlanProgress, typeof CircleDotIcon> = {
  not_started: CircleDashedIcon,
  in_progress: CircleDotIcon,
  done: CircleCheckIcon,
}

/** The first summary line, the tags, and how far the plan has got. */
function Analysed({ post, onTag }: { post: NotePostCard; onTag: (tag: string) => void }) {
  if (!post.firstSummaryLine && !post.tags.length && !post.progress) return null
  const Icon = post.progress ? PROGRESS_ICON[post.progress] : null
  return (
    <span className="grid min-w-0 gap-1">
      {post.firstSummaryLine ? (
        <span className="line-clamp-1 text-xs text-muted-foreground">{post.firstSummaryLine}</span>
      ) : null}
      <span className="flex flex-wrap items-center gap-1">
        {post.progress && Icon ? (
          <span className="mr-1 flex items-center gap-1 text-xs font-medium">
            <Icon
              className={cn("size-3.5", post.progress === "done" ? "text-primary" : "text-muted-foreground")}
              aria-hidden="true"
            />
            {progressWords(post.progress)}
          </span>
        ) : null}
        {post.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={cn("rounded-md", focusRing)}
            onClick={(event) => {
              event.stopPropagation()
              onTag(tag)
            }}
          >
            <Badge variant="secondary" className="font-normal hover:bg-secondary/70">
              {tag}
            </Badge>
          </button>
        ))}
      </span>
    </span>
  )
}

/** Move to folder and Delete. Clicks inside stop here, so opening the menu never also picks the row. */
function CardMenu({ post, actions }: { post: NotePostCard; actions: PostCardActions }) {
  return (
    <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${post.title}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
          {actions.folders.map((folder) => (
            <DropdownMenuItem key={folder.id} onSelect={() => actions.onMove(post, folder.id)}>
              <CheckIcon className={post.folderId === folder.id ? "opacity-100" : "opacity-0"} />
              <span className="truncate">{folder.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => actions.onMove(post, null)}>
            <CheckIcon className={post.folderId === null ? "opacity-100" : "opacity-0"} />
            <span className="text-muted-foreground">No folder</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(post)}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
