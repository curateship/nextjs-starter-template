import { ExternalLinkIcon, FilmIcon, Loader2Icon, Trash2Icon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  formatCount,
  formatDuration,
  isSavedVideoWorking,
  savedVideoStatusLabels,
  type CreatorPost,
  type ResearchCreator,
} from "@/lib/video/creators"

/**
 * The middle panel: every video the creators in scope have posted, newest
 * first.
 *
 * Clicking a row only picks it for the right panel. Nothing is downloaded and
 * no AI runs until the button over there is pressed, which is what makes
 * browsing the feed free.
 */

export function FeedPanel({
  posts,
  held,
  more,
  scopeName,
  busy,
  olderBusy,
  selectedId,
  creator,
  onPick,
  onLoadOlder,
  onClearCreator,
  onToggleWatch,
  onUnfollow,
}: {
  posts: readonly CreatorPost[]
  held: number
  more: boolean
  /** "Everyone", a folder's name, or "@handle" — what the header says. */
  scopeName: string
  busy: boolean
  olderBusy: boolean
  selectedId: string | null
  /** Set while one creator is the scope; the header becomes theirs. */
  creator: ResearchCreator | null
  onPick: (post: CreatorPost) => void
  onLoadOlder: () => void
  onClearCreator: () => void
  onToggleWatch: (watch: boolean) => void
  onUnfollow: () => void
}) {
  const videos = held === 1 ? "1 video" : `${held} videos`
  const working = busy ? (
    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
  ) : null

  return (
    <>
      {creator ? (
        // One creator is the scope, so the header is theirs: who they are, how
        // many followers, and the three things you do to them. The arrow in
        // the icon square is the way back out to everyone, which is what that
        // slot is for — a header opened from a list carries a way back rather
        // than an icon repeating its own title.
        <DashboardCardTitleHeader
          icon={<FilmIcon />}
          back={{ label: "Back to everyone", onClick: onClearCreator }}
          title={
            <span className="flex min-w-0 items-center gap-2">
              <Avatar className="size-5 shrink-0">
                {creator.avatarUrl ? (
                  <AvatarImage src={creator.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback className="text-[9px]">
                  {creator.handle.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 truncate">@{creator.handle}</span>
            </span>
          }
          meta={
            creator.followerCount !== null
              ? `${formatCount(creator.followerCount)} followers · ${videos}`
              : videos
          }
          action={
            <div className="flex items-center gap-1">
              {working}
              <label className="flex items-center gap-1.5 text-xs">
                <Switch
                  checked={creator.watch}
                  aria-label={`Watch @${creator.handle} for new videos`}
                  onCheckedChange={onToggleWatch}
                />
                Watch
              </label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Open their profile"
                    asChild
                  >
                    <a
                      href={creator.profileUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <ExternalLinkIcon />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open their profile</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Unfollow @${creator.handle}`}
                    onClick={onUnfollow}
                  >
                    <Trash2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Unfollow</TooltipContent>
              </Tooltip>
            </div>
          }
        />
      ) : (
        <DashboardCardTitleHeader
          icon={<FilmIcon />}
          title="What they posted"
          meta={`${scopeName} · ${videos}`}
          action={working}
        />
      )}
      <ScrollArea className="min-h-0 flex-1">
        {posts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {held === 0 && !busy
              ? "Nothing here yet. The watch timer fills this in as the creators you follow post."
              : "Nothing to show."}
          </p>
        ) : (
          <ul className="divide-y">
            {posts.map((post) => (
              <li key={post.id}>
                <button
                  type="button"
                  aria-current={post.id === selectedId ? "true" : undefined}
                  onClick={() => onPick(post)}
                  className={cn(
                    "flex w-full items-start gap-3 p-3 text-left",
                    post.id === selectedId ? "bg-muted" : "hover:bg-muted/50",
                    focusRing
                  )}
                >
                  <Cover post={post} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="line-clamp-2 text-sm font-medium">
                      {post.title ?? "Untitled"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      @{post.creatorHandle}
                      {post.postedAt
                        ? ` · ${new Date(post.postedAt).toLocaleDateString()}`
                        : ""}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
                      <span>{formatCount(post.views)} views</span>
                      <span>{formatCount(post.likes)} likes</span>
                      {post.savedStatus ? (
                        <Badge
                          variant={
                            post.savedStatus === "failed"
                              ? "destructive"
                              : post.savedStatus === "ready"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {isSavedVideoWorking(post.savedStatus) ? (
                            <Loader2Icon className="animate-spin" />
                          ) : null}
                          {savedVideoStatusLabels[post.savedStatus]}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {more ? (
          <div className="p-3">
            <Button
              variant="outline"
              className="w-full"
              disabled={olderBusy}
              onClick={onLoadOlder}
            >
              {olderBusy ? <Loader2Icon className="animate-spin" /> : null}
              Show older
            </Button>
          </div>
        ) : null}
      </ScrollArea>
    </>
  )
}

/**
 * The still beside each row. Kept at the upright shape short video is shot in,
 * so a row's height does not jump about as covers load.
 */
function Cover({ post }: { post: CreatorPost }) {
  const length = formatDuration(post.durationSeconds)
  return (
    <span className="relative w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
      <span className="block aspect-[9/16]">
        {post.thumbnailUrl ? (
          <img
            src={post.thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : null}
      </span>
      {length ? (
        <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 text-[10px] text-white tabular-nums">
          {length}
        </span>
      ) : null}
    </span>
  )
}
