import {
  Loader2Icon,
  MessageSquareTextIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing } from "@/lib/layout/focus-ring"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import type { SocialPostRow } from "@/lib/trade/social/dashboard"
import { cn } from "@/lib/utils"

/**
 * This creator's posts, newest first.
 *
 * One row each: when it was posted, the market it names, the words, and how
 * many people saw it. The panel scrolls and pages — 412 posts are never all
 * drawn at once, because the middle of a workspace has to stay responsive
 * while somebody drags the divider beside it.
 *
 * The coins are X's own tagging, read out of the page it serves.
 *
 * **The list draws no line at its top.** The card header above it already
 * draws one, and a `border-t` here lands on that `border-b` and reads as a
 * 2px rule where every other line in the app is 1px.
 *
 * **Sync profile sits in this panel's header**, not in a strip above the page.
 * Fetching posts is a thing you do to this list, so the button lives on the
 * list rather than on a header row that exists only to hold it.
 */
export function SocialPostsPanel({
  posts,
  total,
  filter,
  onClearFilter,
  more,
  busy,
  onLoadOlder,
  onSync,
  syncing,
}: {
  posts: SocialPostRow[]
  /** How many are held in all, before the market filter narrowed them. */
  total: number
  /** The market the right-hand panel is filtering by, or null. */
  filter: string | null
  onClearFilter: () => void
  more: boolean
  busy: boolean
  onLoadOlder: () => void
  onSync: () => void
  /** A profile read is in flight. */
  syncing: boolean
}) {
  return (
    <>
      <DashboardCardTitleHeader
        icon={<MessageSquareTextIcon />}
        title="Posts"
        meta={
          filter
            ? `${posts.length} of ${total}`
            : `${total} ${plural(total, "post", "posts")}`
        }
        action={
          <div className="flex items-center gap-2">
            {filter ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClearFilter}
              >
                <XIcon className="size-4" />
                {filter}
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={syncing} onClick={onSync}>
              {syncing ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              Sync profile
            </Button>
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        {posts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {total === 0
              ? "No posts yet. Sync the profile to read the newest ones off X."
              : `No post held for this creator names ${filter}.`}
          </p>
        ) : (
          <ul className="divide-y">
            {posts.map((post) => (
              <PostLine key={post.id} post={post} />
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

function PostLine({ post }: { post: SocialPostRow }) {
  const posted = new Date(post.postedAt)
  return (
    <li className="grid gap-1 px-5 py-3">
      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span title={formatDateTime(posted)} className="shrink-0 tabular-nums">
          {formatTimeAgo(posted)}
        </span>
        {post.markets.slice(0, 4).map((market) => (
          <span
            key={market}
            className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground"
          >
            ${market}
          </span>
        ))}
        <span className="ml-auto shrink-0 tabular-nums">
          {post.seen === null ? "—" : `${formatSeen(post.seen)} seen`}
        </span>
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

/** "1.2k", "3.1k", "412" — the shape the platform itself prints. */
function formatSeen(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return `${value}`
}
