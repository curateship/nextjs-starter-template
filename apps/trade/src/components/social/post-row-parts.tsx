import { Link } from "@tanstack/react-router"

import { focusRing } from "@/lib/layout/focus-ring"
import { marketChartHref } from "@/lib/protocols/contracts"
import type { SocialPostCoin } from "@/lib/trade/social/dashboard"
import { cn } from "@/lib/utils"

/**
 * The small pieces every post row is built from.
 *
 * Their own module because three screens draw them: the creator dashboard's
 * posts panel, the feed's panel, and the window a post opens in. They used to
 * live in the posts panel, and the window importing one of them from there,
 * while that panel imported the window, was a circle between two modules.
 * It happened to work, because nothing used the other at the moment its module
 * was evaluated, but a bundler is entitled to hand one of them back undefined.
 */

/**
 * How many coins fit on a post's line before the rest become a count. A post
 * naming twelve coins would otherwise push the views figure off the row.
 * Exported, with the chip and the seen-count shape below, because the feed
 * draws the same post line with an author on top.
 */
export const COINS_ON_A_ROW = 4

/**
 * The way to the post on X, on the top line of every post row.
 *
 * Beside the seen count rather than under the words, where Tyler put it on
 * 2 Oct 2026. Under the post it read as part of the post, and it was the only
 * thing on its own line in the whole list.
 *
 * **It shows on hover, and not before.** Tyler asked for that on 2 Oct 2026:
 * one of these on every row of a long feed is a column of underlined blue
 * nobody is reading. It keeps its space while hidden — `opacity-0`, never
 * `hidden` — so the seen count does not jump sideways as the pointer moves
 * down the list.
 *
 * **Tabbing to it shows it too.** `group-focus-within` is what stops a
 * hover-only control being a control a keyboard can never see. On a phone,
 * where nothing hovers, the post's own window carries the same link in its
 * footer.
 *
 * It owns its own click, so pressing it opens X instead of the post's window.
 */
export function OpenOnX({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "rounded-md underline underline-offset-2 hover:text-foreground",
        "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        "motion-safe:transition-opacity",
        focusRing
      )}
    >
      Open on X
    </a>
  )
}

/**
 * One market on a post's line, and the way to its chart.
 *
 * The chip opens the venue that decided the word was a market at all, which is
 * the venue stored on the row: Hyperliquid for a coin, edgeX or ApeX Omni for
 * a stock, a metal or a currency. A market whose address cannot be built is
 * drawn as plain words rather than as a link that goes nowhere.
 */
export function CoinChip({ named }: { named: SocialPostCoin }) {
  const chip =
    "shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground"
  const href = marketChartHref(named.marketKey)
  if (!href) return <span className={chip}>${named.coin}</span>
  return (
    <Link
      to={href}
      aria-label={`Open the ${named.coin} chart`}
      className={cn(chip, "hover:bg-foreground/10", focusRing)}
    >
      ${named.coin}
    </Link>
  )
}
