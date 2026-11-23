import { createFileRoute } from "@tanstack/react-router"

import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { Leaderboard } from "@/components/social/leaderboard"
import { requirePageVisible } from "@/lib/api/content/pages"
import {
  getPublicProfileErrorMessage,
  readLeaderboard,
} from "@/lib/api/trade/public-profiles"
import {
  isLeaderboardPeriod,
  LEADERBOARD_MIN_DAYS,
  LEADERBOARD_MIN_TRADES,
  type LeaderboardPeriod,
} from "@/lib/trade/public-profile/profile"

type TradersSearch = { period?: LeaderboardPeriod; exchange?: string }

/**
 * The leaderboard of public trader profiles, open without an account. It
 * ranks by dollars made in the last 30 days unless the address says 7 days
 * or all time, and lists only a profile whose record is 30 days long with
 * 20 closed trades, so one lucky trade never tops it.
 */
export const Route = createFileRoute("/traders")({
  validateSearch: (search: Record<string, unknown>): TradersSearch => ({
    period: isLeaderboardPeriod(search.period) ? search.period : undefined,
    exchange:
      typeof search.exchange === "string" &&
      /^[a-z]{2,20}$/.test(search.exchange)
        ? search.exchange
        : undefined,
  }),
  loader: async () => {
    const [, rows] = await Promise.all([
      requirePageVisible("/traders"),
      readLeaderboard(),
    ])
    return rows
  },
  head: () => ({
    meta: [
      { title: "Traders on Trade" },
      {
        name: "description",
        content: `Public traders ranked by what every one of their real wallets made, worked out by Trade. Each has a record at least ${LEADERBOARD_MIN_DAYS} days long with ${LEADERBOARD_MIN_TRADES} closed trades.`,
      },
    ],
  }),
  component: TradersRoute,
  errorComponent: visitorRouteErrorComponent(getPublicProfileErrorMessage),
})

function TradersRoute() {
  const rows = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <PublicPageFrame className="place-items-start justify-items-center [&>*]:w-full [&>*]:min-w-0">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-2 text-left md:gap-3">
        <Leaderboard
          rows={rows}
          period={search.period ?? "30d"}
          exchange={search.exchange ?? null}
          onChange={(next) =>
            void navigate({
              search: (current) => ({ ...current, ...next }),
              replace: true,
            })
          }
        />
      </div>
    </PublicPageFrame>
  )
}
