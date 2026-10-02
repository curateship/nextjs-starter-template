import * as React from "react"
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
import { postRowWasClicked } from "@/components/social/post-row-click"
import {
  CoinChip,
  COINS_ON_A_ROW,
  OpenOnX,
} from "@/components/social/post-row-parts"
import { SocialPostDialog } from "@/components/social/social-post-dialog"
import { formatSeen, type SocialPostRow } from "@/lib/trade/social/dashboard"
import { cn } from "@/lib/utils"

/**
 * This creator's posts, newest first.
 *
 * One row each: when it was posted, the market it names, the words, and how
 * many people saw it. The panel scrolls and pages — 412 posts are never all
 * drawn at once, because the middle of a workspace has to stay responsive
 * while somebody drags the divider beside it.
 *
 * The coins are Trade's own reading of the words, and only coins it has a
 * market for. The three rules are in `src/lib/trade/social/coin-matcher.ts`.
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
  handle,
  picture,
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
  /** Whose posts these are, for the window one of them opens in. */
  handle: string
  picture: string | null
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
  // The post whose window is open, held here rather than per row: one window
  // on screen, and a row that pages out from under it does not shut it.
  const [open, setOpen] = React.useState<SocialPostRow | null>(null)

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
              <PostLine
                key={post.id}
                post={post}
                first={filter}
                onOpen={() => setOpen(post)}
              />
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
      <SocialPostDialog
        post={open}
        handle={handle}
        picture={picture}
        canOpenCreator={false}
        onOpenChange={(next) => {
          if (!next) setOpen(null)
        }}
      />
    </>
  )
}

function PostLine({
  post,
  first,
  onOpen,
}: {
  post: SocialPostRow
  /**
   * The coin the list is narrowed to, drawn before the others. A post naming
   * twelve coins would otherwise hide the very coin somebody clicked behind the
   * "+8", and a row with no chip for the coin it was filtered by reads as a
   * bug.
   */
  first: string | null
  onOpen: () => void
}) {
  const posted = new Date(post.postedAt)
  const named = post.coins.find((one) => one.coin === first)
  const coins = named
    ? [named, ...post.coins.filter((one) => one.coin !== first)]
    : post.coins
  return (
    <li
      className="group grid cursor-pointer gap-1 px-5 py-3 hover:bg-muted/50"
      onClick={(event) => {
        if (postRowWasClicked(event)) onOpen()
      }}
    >
      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span title={formatDateTime(posted)} className="shrink-0 tabular-nums">
          {formatTimeAgo(posted)}
        </span>
        {coins.slice(0, COINS_ON_A_ROW).map((one) => (
          <CoinChip key={one.coin} named={one} />
        ))}
        {coins.length > COINS_ON_A_ROW ? (
          // The hidden ones are named on hover. Without it the only way to see
          // the fifth coin on a post is to widen the panel, and a bare "+1"
          // beside a row of coins looks like something has gone wrong.
          <span
            className="shrink-0"
            title={coins
              .slice(COINS_ON_A_ROW)
              .map((one) => one.coin)
              .join(", ")}
          >
            +{coins.length - COINS_ON_A_ROW}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-baseline gap-2 tabular-nums">
          {post.url ? <OpenOnX url={post.url} /> : null}
          <span>
            {post.seen === null ? "—" : `${formatSeen(post.seen)} seen`}
          </span>
        </span>
      </div>
      {/* A button rather than a paragraph, so the window has a tab stop. The
          row's own click handler covers the mouse; this covers the keyboard. */}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "rounded-md text-left text-sm break-words whitespace-pre-wrap",
          focusRing
        )}
      >
        {post.text}
      </button>
    </li>
  )
}
