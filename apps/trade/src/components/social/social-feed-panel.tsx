import { Link } from "@tanstack/react-router"
import { Loader2Icon, NewspaperIcon, XIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  CoinChip,
  COINS_ON_A_ROW,
} from "@/components/social/social-posts-panel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing } from "@/lib/layout/focus-ring"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { formatSeen } from "@/lib/trade/social/dashboard"
import type { SocialFeedPostRow } from "@/lib/trade/social/feed"
import { cn } from "@/lib/utils"

/**
 * The feed itself: every post in the scope, newest first, whoever wrote it.
 *
 * Each row is the creator dashboard's post row plus one line saying whose it
 * is, because a feed across thirty accounts is unreadable without the author
 * on every row. The handle is the way to that creator's own dashboard; the
 * rows in the left panel only filter.
 *
 * **The chips in the header name what the feed is narrowed to** — a folder, a
 * creator, a coin — each with its own clear. The narrowing itself is done by
 * the server, never by sieving the page already on screen, so a coin with 41
 * posts shows all 41.
 */
export type FeedChip = {
  key: string
  label: string
  clearLabel: string
  onClear: () => void
}

export function SocialFeedPanel({
  posts,
  held,
  narrowed,
  chips,
  more,
  busy,
  onLoadOlder,
}: {
  posts: SocialFeedPostRow[]
  /** How many posts the scope holds in all, before a coin narrowed it. */
  held: number
  /** True when a coin is narrowing the list below `held`. */
  narrowed: boolean
  chips: FeedChip[]
  more: boolean
  busy: boolean
  onLoadOlder: () => void
}) {
  return (
    <>
      <DashboardCardTitleHeader
        icon={<NewspaperIcon />}
        title="Feed"
        meta={
          narrowed
            ? `${posts.length} of ${held}`
            : `${held} ${plural(held, "post", "posts")}`
        }
        action={
          chips.length > 0 ? (
            <div className="flex items-center gap-2">
              {chips.map((chip) => (
                <Button
                  key={chip.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={chip.clearLabel}
                  onClick={chip.onClear}
                >
                  <XIcon className="size-4" />
                  <span className="max-w-32 truncate">{chip.label}</span>
                </Button>
              ))}
            </div>
          ) : undefined
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        {posts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {held === 0
              ? "Nothing here yet. Open a creator's dashboard and sync their profile, and their posts land in this feed."
              : "No post in this view names that coin."}
          </p>
        ) : (
          <ul className="divide-y">
            {posts.map((post) => (
              <FeedPostLine key={post.id} post={post} />
            ))}
          </ul>
        )}
        {more ? (
          <div className="grid justify-items-center border-t p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onLoadOlder}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Show older posts
            </Button>
          </div>
        ) : null}
      </ScrollArea>
    </>
  )
}

function FeedPostLine({ post }: { post: SocialFeedPostRow }) {
  const posted = new Date(post.postedAt)
  return (
    <li className="grid gap-1 px-5 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          to="/social/$handle"
          params={{ handle: post.creator.handle }}
          aria-label={`Open @${post.creator.handle}'s dashboard`}
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-md font-medium text-foreground hover:underline",
            focusRing
          )}
        >
          <Avatar size="sm">
            {post.creator.picture ? (
              <AvatarImage src={post.creator.picture} alt="" />
            ) : null}
            <AvatarFallback>
              {post.creator.handle.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 truncate">@{post.creator.handle}</span>
        </Link>
        <span title={formatDateTime(posted)} className="shrink-0 tabular-nums">
          {formatTimeAgo(posted)}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">
          {post.seen === null ? "—" : `${formatSeen(post.seen)} seen`}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground empty:hidden">
        {post.coins.slice(0, COINS_ON_A_ROW).map((coin) => (
          <CoinChip key={coin} coin={coin} />
        ))}
        {post.coins.length > COINS_ON_A_ROW ? (
          // The hidden ones are named on hover. Without it the only way to
          // see the fifth coin on a post is to widen the panel.
          <span
            className="shrink-0"
            title={post.coins.slice(COINS_ON_A_ROW).join(", ")}
          >
            +{post.coins.length - COINS_ON_A_ROW}
          </span>
        ) : null}
      </div>
      <p className="text-sm break-words whitespace-pre-wrap">{post.text}</p>
      {post.url ? (
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            "justify-self-start rounded-md text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground",
            focusRing
          )}
        >
          Open on X
        </a>
      ) : null}
    </li>
  )
}
