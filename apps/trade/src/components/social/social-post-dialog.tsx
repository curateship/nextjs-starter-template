import { Link } from "@tanstack/react-router"

import { CoinChip } from "@/components/social/post-row-parts"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDateTime } from "@/lib/format/format-time"
import { formatSeen, type SocialPostCoin } from "@/lib/trade/social/dashboard"
import { postArrivedCut } from "@/lib/trade/social/post-text"

/**
 * One post, whole, without going to X.
 *
 * Opened by clicking a post anywhere in Social. Tyler asked for it on
 * 2 Oct 2026: the rows are a list to scan, and reading one of them should not
 * mean leaving the app.
 *
 * **It shows what Trade stored, which is not always the whole post.** X's
 * profile page serves a long post cut to about 300 characters with a `t.co`
 * link where the rest was. Trade stores what it was given, so a post that
 * arrived cut is still cut here. The window says so rather than letting
 * somebody read half a post and believe it was all of it, and Open on X is
 * there for those.
 */
export type PostInWindow = {
  postedAt: number
  text: string
  url: string | null
  seen: number | null
  coins: SocialPostCoin[]
}

export function SocialPostDialog({
  post,
  handle,
  picture,
  canOpenCreator = true,
  onOpenChange,
}: {
  /** The post to show, or null when the window is shut. */
  post: PostInWindow | null
  handle: string
  picture: string | null
  /**
   * False on the creator's own dashboard, where "Open @handle" would be a
   * button that reloads the page somebody is already looking at. The feed
   * leaves it on, because there it is the way to that creator.
   */
  canOpenCreator?: boolean
  onOpenChange: (open: boolean) => void
}) {
  const posted = post ? new Date(post.postedAt) : null
  const cut = post ? postArrivedCut(post.text) : false
  const seen = post?.seen ?? null

  return (
    <Dialog open={post !== null} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Avatar size="sm">
              {picture ? <AvatarImage src={picture} alt="" /> : null}
              <AvatarFallback>
                {handle.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate">@{handle}</span>
          </DialogTitle>
          <DialogDescription>
            {posted ? formatDateTime(posted) : null}
            {seen === null ? null : ` · ${formatSeen(seen)} seen`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <p className="text-sm break-words whitespace-pre-wrap">
            {post?.text}
          </p>
          {cut ? (
            <p className="text-sm text-muted-foreground">
              X served only the first part of this post, so the rest is not
              held here. Open on X to read all of it.
            </p>
          ) : null}
          {post && post.coins.length > 0 ? (
            <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
              {post.coins.map((one) => (
                <CoinChip key={one.coin} named={one} />
              ))}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {canOpenCreator ? (
            <Button asChild variant="outline" size="lg">
              <Link
                to="/social/$handle"
                params={{ handle }}
                onClick={() => onOpenChange(false)}
              >
                Open @{handle}
              </Link>
            </Button>
          ) : null}
          {post?.url ? (
            <Button asChild variant="outline" size="lg">
              <a href={post.url} target="_blank" rel="noreferrer noopener">
                Open on X
              </a>
            </Button>
          ) : null}
          <Button type="button" size="lg" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
