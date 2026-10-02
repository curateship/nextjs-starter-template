import { Link } from "@tanstack/react-router"
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
import {
  coinChartHref,
  formatSeen,
  type SocialPostRow,
} from "@/lib/trade/social/dashboard"
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
              <PostLine key={post.id} post={post} first={filter} />
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

/**
 * How many coins fit on a post's line before the rest become a count. A post
 * naming twelve coins would otherwise push the views figure off the row.
 * Exported, with the chip and the seen-count shape below, because the feed
 * draws the same post line with an author on top.
 */
export const COINS_ON_A_ROW = 4

function PostLine({
  post,
  first,
}: {
  post: SocialPostRow
  /**
   * The coin the list is narrowed to, drawn before the others. A post naming
   * twelve coins would otherwise hide the very coin somebody clicked behind the
   * "+8", and a row with no chip for the coin it was filtered by reads as a
   * bug.
   */
  first: string | null
}) {
  const posted = new Date(post.postedAt)
  const coins =
    first && post.coins.includes(first)
      ? [first, ...post.coins.filter((coin) => coin !== first)]
      : post.coins
  return (
    <li className="grid gap-1 px-5 py-3">
      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span title={formatDateTime(posted)} className="shrink-0 tabular-nums">
          {formatTimeAgo(posted)}
        </span>
        {coins.slice(0, COINS_ON_A_ROW).map((coin) => (
          <CoinChip key={coin} coin={coin} />
        ))}
        {coins.length > COINS_ON_A_ROW ? (
          // The hidden ones are named on hover. Without it the only way to see
          // the fifth coin on a post is to widen the panel, and a bare "+1"
          // beside a row of coins looks like something has gone wrong.
          <span
            className="shrink-0"
            title={coins.slice(COINS_ON_A_ROW).join(", ")}
          >
            +{coins.length - COINS_ON_A_ROW}
          </span>
        ) : null}
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

/**
 * One coin on a post's line, and the way to its chart.
 *
 * Every coin here is a Hyperliquid market, because Hyperliquid's own market
 * list is what decided the word was a coin, so the chip always has somewhere to
 * go. A coin whose address cannot be built is drawn as plain words rather than
 * as a link that goes nowhere.
 */
export function CoinChip({ coin }: { coin: string }) {
  const chip =
    "shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground"
  const href = coinChartHref(coin)
  if (!href) return <span className={chip}>${coin}</span>
  return (
    <Link
      to={href}
      aria-label={`Open the ${coin} chart`}
      className={cn(chip, "hover:bg-foreground/10", focusRing)}
    >
      ${coin}
    </Link>
  )
}
