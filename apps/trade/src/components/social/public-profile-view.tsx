import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ExternalLinkIcon, FlagIcon } from "lucide-react"

import { PnlMonthGrid } from "@/components/pnl/pnl-month-grid"
import { ReportProfileDialog } from "@/components/social/report-profile-dialog"
import { PnlAmount, ShowPublicFigures } from "@/components/trade/pnl-amount"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatDate } from "@/lib/format/format-time"
import { formatWholeUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { currentMonth } from "@/lib/trade/pnl/periods"
import type { PeriodMoney } from "@/lib/trade/public-profile/figures"
import {
  LEADERBOARD_MIN_DAYS,
  LEADERBOARD_MIN_TRADES,
  type PublicProfileView,
  type PublicWallet,
} from "@/lib/trade/public-profile/profile"
import { signedWholeUsd } from "@/lib/trade/public-profile/share-image"
import { cn } from "@/lib/utils"

function day(at: number): string {
  return formatDate(new Date(at))
}

/**
 * What `/t/<handle>` draws: who, what the record shows, the month grid from
 * the P&L page, and every wallet the figures come from.
 *
 * Wrapped in `ShowPublicFigures`, so the Hide P&L switch, which is about a
 * member's own screen, never blurs a page that was published on purpose.
 */
export function PublicProfileContent({
  view,
  actions,
}: {
  view: PublicProfileView
  /** Follow and Copy, for the page at `/t/<handle>`. */
  actions?: React.ReactNode
}) {
  const [reporting, setReporting] = React.useState(false)
  const [month, setMonth] = React.useState(() => currentMonth(view.readAt))
  const since = view.recordStart ?? view.readAt
  const days = React.useMemo(
    () => new Map(view.days.map((day) => [day.day, day])),
    [view.days]
  )
  const initials = view.displayName.slice(0, 1).toUpperCase()

  return (
    <ShowPublicFigures>
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex items-start gap-3">
            <Avatar size="lg">
              {view.picture ? <AvatarImage src={view.picture} alt="" /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 gap-1">
              <h1 className="truncate text-lg font-semibold">
                {view.displayName}
              </h1>
              <p className="text-sm text-muted-foreground">
                @{view.handle} · on Trade since {day(view.joinedAt)}
                {view.recordStart !== null
                  ? ` · record starts ${day(view.recordStart)}`
                  : ""}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setReporting(true)}
            >
              <FlagIcon className="size-4" />
              Report
            </Button>
          </div>
          {actions}
          {view.bio ? (
            <p className="text-sm whitespace-pre-line">{view.bio}</p>
          ) : null}
          {view.links.length ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {view.links.map((link) => (
                <li key={link} className="min-w-0">
                  <a
                    href={link}
                    target="_blank"
                    rel="nofollow ugc noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 truncate underline-offset-4 hover:underline"
                  >
                    {new URL(link).host}
                    <ExternalLinkIcon className="size-3.5 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-2 md:grid-cols-2 md:gap-3">
        <Card>
          <CardHeader>
            <CardTitle>What the record shows</CardTitle>
            <CardDescription>
              Every real-money trade from every wallet below, after fees. Worked
              out by Trade from the trades it recorded, not typed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <MadeRow
                label="Made in the last 7 days"
                period={view.figures.made["7d"]}
              />
              <MadeRow
                label="Made in the last 30 days"
                period={view.figures.made["30d"]}
              />
              <MadeRow label="Made all time" period={view.figures.made.all} />
              <Row label="Trades that made money">
                {view.figures.wonPer100 === null
                  ? "No closed trades yet"
                  : `${view.figures.wonPer100} out of 100 (${view.figures.closedTrades.toLocaleString("en-US")} ${view.figures.closedTrades === 1 ? "trade" : "trades"})`}
              </Row>
              <Row label="Worst stretch">
                {view.figures.worstStretch ? (
                  <>
                    Total made fell from{" "}
                    <PnlAmount>
                      {signedWholeUsd(view.figures.worstStretch.from)}
                    </PnlAmount>{" "}
                    to{" "}
                    <PnlAmount>
                      {signedWholeUsd(view.figures.worstStretch.to)}
                    </PnlAmount>
                    {view.figures.worstStretch.recovered
                      ? ", then recovered"
                      : ", and has not recovered yet"}
                  </>
                ) : (
                  "It has not fallen yet"
                )}
              </Row>
              <Row label="Days traded">
                {view.figures.daysTraded.toLocaleString("en-US")}
              </Row>
              <Row label="Open right now">
                {view.openPositions === 0
                  ? "No open positions"
                  : `${view.openPositions} ${view.openPositions === 1 ? "position" : "positions"}. Which coins and at what price is not shown.`}
              </Row>
            </dl>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <PnlMonthGrid
            days={days}
            month={month}
            onMonthChange={setMonth}
            now={view.readAt}
            recordsSince={since}
          />
        </Card>
      </div>

      <CopyingCard view={view} />

      <Card>
        <CardHeader>
          <CardTitle>Wallets on this profile</CardTitle>
          <CardDescription>
            All of them. A wallet added later joins on its own, and none can be
            taken off.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid">
          {view.wallets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No real-money wallets yet.
            </p>
          ) : (
            view.wallets.map((wallet) => (
              <WalletRow
                key={wallet.id}
                wallet={wallet}
                name={view.displayName}
              />
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {view.onLeaderboard ? (
          <>
            On the{" "}
            <Link to="/traders" className="underline underline-offset-4">
              leaderboard
            </Link>
            .
          </>
        ) : (
          `Joins the leaderboard once the record is ${LEADERBOARD_MIN_DAYS} days long with ${LEADERBOARD_MIN_TRADES} closed trades.`
        )}
      </p>

      <ReportProfileDialog
        handle={view.handle}
        open={reporting}
        onClose={() => setReporting(false)}
      />
    </ShowPublicFigures>
  )
}

/**
 * What copying this trader has meant for the people doing it. The dollars
 * come from copiers' real wallets only, so a trader who sells into the people
 * copying them shows here as copiers losing.
 */
function CopyingCard({ view }: { view: PublicProfileView }) {
  const copying = view.copying
  return (
    <Card>
      <CardHeader>
        <CardTitle>Copying @{view.handle}</CardTitle>
        <CardDescription>
          {copying.copyable
            ? "Anyone with a wallet on the same exchange can copy these trades."
            : "Copying is not open for this profile right now."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <Row label="Following">
            {copying.followers.toLocaleString("en-US")}{" "}
            {copying.followers === 1 ? "person" : "people"}
          </Row>
          <Row label="Copying">
            {copying.copiers.toLocaleString("en-US")}{" "}
            {copying.copiers === 1 ? "person" : "people"}
          </Row>
          <Row label={`People copying @${view.handle} made or lost`}>
            {copying.copiedTrades30d === 0 ? (
              "No real-money copies in the last 30 days"
            ) : (
              <>
                <PnlAmount
                  className={cn(
                    "font-semibold tabular-nums",
                    moneyTone(Math.round(copying.copiersMade30d))
                  )}
                >
                  {signedWholeUsd(copying.copiersMade30d)}
                </PnlAmount>
                <span className="text-muted-foreground">
                  {" "}
                  in the last 30 days, from real wallets only, after every fee
                </span>
              </>
            )}
          </Row>
          <Row label="Sold soon after copiers bought">
            {copying.copiedTrades30d === 0
              ? "Nothing to compare yet: nobody copied with real money in the last 30 days"
              : `${copying.soldIntoCopiers30d} of ${copying.sales30d} ${copying.sales30d === 1 ? "sale" : "sales"} in the last 30 days came within five minutes of copiers buying the same coin`}
          </Row>
        </dl>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function MadeRow({ label, period }: { label: string; period: PeriodMoney }) {
  return (
    <Row label={label}>
      <PnlAmount
        className={cn(
          "font-semibold tabular-nums",
          moneyTone(Math.round(period.money))
        )}
      >
        {signedWholeUsd(period.money)}
      </PnlAmount>
      <span className="text-muted-foreground">
        {" "}
        after {formatWholeUsd(period.fees)} of fees
        {period.unpriced
          ? `, plus ${period.unpriced} ${period.unpriced === 1 ? "sale" : "sales"} the exchange has not priced yet`
          : ""}
      </span>
    </Row>
  )
}

function WalletRow({ wallet, name }: { wallet: PublicWallet; name: string }) {
  return (
    <div className="-mx-4 grid gap-1 border-t px-4 py-3 text-sm first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <p className="font-medium">{wallet.venue}</p>
      <div className="grid gap-1">
        {wallet.check === "failed" ? (
          <p>
            Does not count.{" "}
            {wallet.checkNote ?? "The last ownership check did not pass."}
          </p>
        ) : wallet.explorerUrl ? (
          <p>
            <span className="font-mono">{wallet.address}</span> ·{" "}
            <a
              href={wallet.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              On-chain, check it yourself
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </p>
        ) : (
          <p>Checked by Trade, not visible on-chain</p>
        )}
        <p className="text-muted-foreground">
          {wallet.removedAt !== null
            ? `Removed by ${name} on ${day(wallet.removedAt)}. Its trades still count.`
            : null}
          {wallet.removedAt !== null && wallet.recordStart !== null
            ? " "
            : null}
          {wallet.recordStart !== null
            ? `Record starts ${day(wallet.recordStart)}.`
            : wallet.removedAt === null
              ? "No trades yet."
              : null}
        </p>
      </div>
    </div>
  )
}
