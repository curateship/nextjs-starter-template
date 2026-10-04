import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  Loader2Icon,
  NewspaperIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { PanelHeaderButton } from "@/components/social/panel-header-button"
import {
  CoinChip,
  COINS_ON_A_ROW,
  OpenOnX,
} from "@/components/social/post-row-parts"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing } from "@/lib/layout/focus-ring"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { postRowWasClicked } from "@/components/social/post-row-click"
import { SocialPostDialog } from "@/components/social/social-post-dialog"
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
  onRefresh,
  refreshing,
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
  /** Ask the server for this same view again, newest posts included. */
  onRefresh: () => void
  /** That ask is in flight. */
  refreshing: boolean
}) {
  // The post whose window is open, held here rather than per row: one window
  // on screen, and a row that scrolls out from under it does not shut it.
  const [open, setOpen] = React.useState<SocialFeedPostRow | null>(null)

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
            {/* The feed is read once when the screen opens. Syncing a
                creator's profile on their own dashboard, or another tab
                adding posts, leaves this list behind until it is asked
                again, so the button asks for the view on screen now. */}
            <PanelHeaderButton
              label="Refresh the feed"
              icon={<RefreshCwIcon />}
              busy={refreshing}
              onClick={onRefresh}
            />
          </div>
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
              <FeedPostLine
                key={post.id}
                post={post}
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
        handle={open?.creator.handle ?? ""}
        picture={open?.creator.picture ?? null}
        onOpenChange={(next) => {
          if (!next) setOpen(null)
        }}
      />
    </>
  )
}

function FeedPostLine({
  post,
  onOpen,
}: {
  post: SocialFeedPostRow
  onOpen: () => void
}) {
  const posted = new Date(post.postedAt)
  return (
    <li
      className="group grid cursor-pointer gap-1 px-5 py-3 hover:bg-muted/50"
      onClick={(event) => {
        if (postRowWasClicked(event)) onOpen()
      }}
    >
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
        {/* Open on X sits up here beside the seen count, where Tyler asked
            for it on 2 Oct 2026. Under the words it read as part of the post,
            and it was the only thing on its own line. */}
        <span className="ml-auto flex shrink-0 items-baseline gap-2 tabular-nums">
          {post.url ? <OpenOnX url={post.url} /> : null}
          <span>
            {post.seen === null ? "—" : `${formatSeen(post.seen)} seen`}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground empty:hidden">
        {post.coins.slice(0, COINS_ON_A_ROW).map((one) => (
          <CoinChip key={one.coin} named={one} />
        ))}
        {post.coins.length > COINS_ON_A_ROW ? (
          // The hidden ones are named on hover. Without it the only way to
          // see the fifth coin on a post is to widen the panel.
          <span
            className="shrink-0"
            title={post.coins
              .slice(COINS_ON_A_ROW)
              .map((one) => one.coin)
              .join(", ")}
          >
            +{post.coins.length - COINS_ON_A_ROW}
          </span>
        ) : null}
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
