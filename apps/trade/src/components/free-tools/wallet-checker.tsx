import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowRightIcon, Loader2Icon } from "lucide-react"

import { FreeToolSignUpCard } from "@/components/free-tools/sign-up-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { checkWalletAddress } from "@/lib/api/trade/wallet-checker"
import {
  getWalletCheckErrorMessage,
  walletAddressProblem,
  WALLET_CHECK_KEEP_MS,
  type WalletCheckReport,
} from "@/lib/free-tools/wallet-checker"
import { formatToolMoney } from "@/lib/free-tools/money"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { formatSignedUsd } from "@/lib/trade/format"
import { shortAddress } from "@/lib/trade/public-profile/profile"

/**
 * `/tools/wallet-checker`: what any Hyperliquid wallet really made and lost,
 * worked out from the trade history Hyperliquid publishes for every address.
 *
 * The page arrives with nothing in it. Pressing Check asks the server, which
 * asks the exchange once and keeps that answer for ten minutes, so the same
 * address pressed again costs the exchange nothing.
 */
export function WalletChecker({ signedIn }: { signedIn: boolean }) {
  const [typed, setTyped] = React.useState("")
  const [problem, setProblem] = React.useState<string | null>(null)
  const [checking, setChecking] = React.useState(false)
  const [report, setReport] = React.useState<WalletCheckReport | null>(null)

  const check = (event: React.FormEvent) => {
    event.preventDefault()
    // A second press while the first is still out would be a second check
    // against this visitor's minute and a second question to the exchange:
    // the kept copy cannot help, because the first answer does not exist yet.
    if (checking) return
    // The last failure goes the moment a new attempt starts, so a refused
    // address never sits over the answer to the next one.
    dismissErrorToast()
    const wrong = walletAddressProblem(typed)
    setProblem(wrong)
    // Refused here, so a mistyped address never reaches Hyperliquid and never
    // spends a check against this visitor's minute.
    if (wrong) {
      showErrorToast(wrong)
      return
    }
    setChecking(true)
    checkWalletAddress(typed)
      .then(setReport)
      .catch((error: unknown) => {
        setReport(null)
        showErrorToast(getWalletCheckErrorMessage(error))
      })
      .finally(() => setChecking(false))
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-2 text-left md:gap-3">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Wallet checker</h1>
        <p className="text-sm text-muted-foreground">
          Paste any Hyperliquid wallet address and see what it really made and
          lost. The history is Hyperliquid's own, public for every address.
        </p>
      </header>

      <Card size="sm">
        <CardHeader>
          <CardTitle>The wallet</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={check}
            className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-2"
          >
            <div className="grid min-w-0 flex-1 gap-2">
              <FieldLabel
                htmlFor="wallet-address"
                hint="A Hyperliquid address starts with 0x and has 40 characters after it. Trade never learns who owns it."
              >
                Wallet address
              </FieldLabel>
              <Input
                id="wallet-address"
                value={typed}
                spellCheck={false}
                autoComplete="off"
                placeholder="0x0000000000000000000000000000000000000000"
                aria-invalid={problem !== null}
                aria-describedby={problem ? "wallet-address-problem" : undefined}
                className="font-mono"
                onChange={(event) => setTyped(event.target.value)}
                // Leaving an empty box is not a mistake. Marking it red would
                // scold a visitor who clicked into the field and out again
                // before pasting anything.
                onBlur={() =>
                  setProblem(typed.trim() ? walletAddressProblem(typed) : null)
                }
              />
              {/*
                Said out loud to a screen reader and nowhere on screen. The
                sentence a sighted visitor reads is the error toast, which is
                the app's rule for a field that fails. A visible line here
                would appear and disappear as the field is left, moving the
                Check button out from under a cursor already on its way to it.
              */}
              {problem ? (
                <p id="wallet-address-problem" className="sr-only">
                  {problem}
                </p>
              ) : null}
            </div>
            <Button type="submit" className="w-fit">
              {checking ? <Loader2Icon className="animate-spin" /> : null}
              Check wallet
            </Button>
          </form>
        </CardContent>
      </Card>

      {report ? <Answer report={report} /> : <WhatYouGet />}

      {signedIn ? null : <FreeToolSignUpCard />}
    </div>
  )
}

/** A moment as a day: "Mar 2, 2026". */
function day(at: number | null): string {
  return formatDate(at === null ? null : new Date(at))
}

/** What the page says before anybody has checked anything. */
function WhatYouGet() {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>What you get</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm text-muted-foreground">
          <li>
            What the wallet made or lost over the last 30 days and over its
            whole history, after the fees it paid.
          </li>
          <li>How many of its finished trades made money, out of 100.</li>
          <li>Its single worst trade, and how many positions are open now.</li>
          <li>
            The figures come from the trades themselves, not from anybody's
            screenshot.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}

function Answer({ report }: { report: WalletCheckReport }) {
  const { figures, worstTrade } = report
  const traded = report.historyStart !== null

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-mono">
          {shortAddress(report.address)}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {traded ? (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              History from {day(report.historyStart)} to today.
            </p>
            <dl className="grid gap-4">
              <Row
                label="Made in the last 30 days"
                value={formatSignedUsd(figures.made["30d"].money)}
                note={`after ${formatToolMoney(figures.made["30d"].fees)} of fees`}
              />
              <Row
                label="Made over the whole history"
                value={formatSignedUsd(figures.made.all.money)}
                note={`after ${formatToolMoney(figures.made.all.fees)} of fees`}
              />
              <Row
                label="Trades that made money"
                value={
                  figures.wonPer100 === null
                    ? "No finished trades"
                    : `${figures.wonPer100} out of 100`
                }
                note={
                  figures.closedTrades === 0
                    ? "every trade it opened is still open"
                    : `${figures.wonTrades} of ${figures.closedTrades} finished ${plural(figures.closedTrades, "trade")}`
                }
              />
              <Row
                label="Biggest loss"
                value={
                  worstTrade
                    ? formatToolMoney(Math.abs(worstTrade.pnl))
                    : "None"
                }
                note={
                  worstTrade
                    ? `on ${worstTrade.symbol}, ${day(worstTrade.closedAt)}`
                    : "no finished trade lost money"
                }
              />
              <Row
                label="Open now"
                value={`${report.openPositions} ${plural(report.openPositions, "position")}`}
                note="on Hyperliquid's main market"
              />
            </dl>
            <HistoryNote report={report} />
          </>
        ) : (
          <p role="status" className="text-sm">
            This wallet has no trades on Hyperliquid. It may trade on another
            exchange, or hold coins without ever having traded them here.
          </p>
        )}
        <ProfileLine handle={report.profileHandle} />
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex flex-col gap-0.5 sm:items-end">
        <span className="font-mono text-lg font-medium tabular-nums">
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </dd>
    </div>
  )
}

/** How far back the figures reach, said every time, and why they stop there. */
function HistoryNote({ report }: { report: WalletCheckReport }) {
  const kept = Math.round(WALLET_CHECK_KEEP_MS / 60_000)
  return (
    <p className="text-xs text-muted-foreground">
      {report.historyCapped
        ? `Hyperliquid hands out only a wallet's most recent trades, and this wallet has more than it will give. Everything before ${day(report.historyStart)} is missing, so the figures above cover ${day(report.historyStart)} onwards. `
        : `Hyperliquid gave its whole history for this wallet, starting ${day(report.historyStart)}. `}
      {report.thirtyDaysPartial
        ? "That cut falls inside the last 30 days, so the 30-day figure covers only part of the month. "
        : ""}
      Read {day(report.readAt)} and kept for {kept} minutes, so checking
      the same wallet again shows the same answer.
    </p>
  )
}

/** The link to the wallet's Trade profile, or the invitation to make one. */
function ProfileLine({ handle }: { handle: string | null }) {
  if (!handle) {
    return (
      <p className="text-sm text-muted-foreground">
        This wallet is not on a Trade profile. If it is yours, put your record
        on Trade and let anybody check the numbers themselves.
      </p>
    )
  }
  return (
    <p className="text-sm">
      This wallet is on a Trade profile:{" "}
      <Link
        to="/t/$handle"
        params={{ handle }}
        className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
      >
        @{handle}
        <ArrowRightIcon className="size-3.5" />
      </Link>
    </p>
  )
}
