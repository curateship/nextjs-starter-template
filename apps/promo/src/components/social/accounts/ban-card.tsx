import * as React from "react"
import { Link } from "@tanstack/react-router"
import { BanIcon, BrushCleaningIcon, Loader2Icon, PlayIcon, SendIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PanelCard } from "@/components/shared/panel-card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  cleanUpBannedAccount,
  getBansErrorMessage,
  loadBanDetail,
  recordAppeal,
  recordAppealAnswer,
  type BanDetail,
} from "@/lib/api/bans"
import { BAN_KIND_LABELS, type AppealAnswer, type BanKind } from "@/lib/bans/options"
import { formatDateTime } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * A ban as one card (Bans task, parts 6, 10 and 25): the screen's words and
 * the picture kept for an appeal, the appeal's record, and the two ways out,
 * Let it run again and Clean up. Clean up asks once, here in the card, and
 * never runs by itself, so an appeal can come first (Tyler, 3 Nov 2026).
 *
 * The account's settings window shows it while a ban stops the account, and
 * the Bans dashboard's window shows it for any ban.
 */

export type BanCardBan = {
  id: string
  kind: BanKind
  at: Date
  words: string
  hasPicture: boolean
  appealedAt: Date | null
  appealNote: string
  appealAnswer: AppealAnswer | ""
}

export function BanCard({
  ban,
  accountName,
  stopped,
  cleanUpHeldBack,
  phoneId,
  onRunAgain,
  onChanged,
  showActionsBefore = false,
  accountId,
  onCleanedUp,
}: {
  ban: BanCardBan
  accountName: string
  /** The account is still stopped by this ban, so it can run again or be cleaned up. */
  stopped: boolean
  /** Why Clean up cannot run now (an iPhone not read signed out of iCloud), or empty. */
  cleanUpHeldBack: string
  /** The phone it ran on, for the iCloud check, or null. */
  phoneId: string | null
  accountId: string | null
  onRunAgain: (() => Promise<void>) | null
  onChanged: () => Promise<void> | void
  /** The Bans dashboard's window also lists the phone's last 20 actions before the ban. */
  showActionsBefore?: boolean
  /** After Clean up; the account's settings window closes, since the account is retired. Defaults to `onChanged`. */
  onCleanedUp?: () => Promise<void> | void
}) {
  const [detail, setDetail] = React.useState<BanDetail | null>(null)
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [wide, setWide] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState<"appeal" | "answer" | "clean" | "run" | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const needsDetail = ban.hasPicture || showActionsBefore

  React.useEffect(() => {
    if (!needsDetail) return
    let live = true
    loadBanDetail(ban.id).then(
      (next) => {
        if (live) setDetail(next)
      },
      (failure: unknown) => {
        if (live) setDetailError(getBansErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [ban.id, needsDetail])

  async function run(step: NonNullable<typeof busy>, work: () => Promise<unknown>) {
    setBusy(step)
    try {
      await work()
      await onChanged()
    } catch (failure) {
      showErrorToast(getBansErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  return (
    // The right panel's grey card, as every group on a right panel is (Tyler, 12 Nov 2026: "the right
    // panel is mostly not using ui standards. Look at how shell does it").
    <PanelCard icon={<BanIcon />} storageId="promo-ban-card" title={stopped ? "Stopped by a ban" : "The ban"}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <p className="text-sm">
          {BAN_KIND_LABELS[ban.kind]} on {formatDateTime(ban.at)}
          {ban.words ? <>: &ldquo;{ban.words}&rdquo;</> : "."}
        </p>
        {ban.hasPicture ? (
          detailError ? (
            <p className="text-sm text-destructive">{detailError}</p>
          ) : !detail ? (
            <LoadingRow label="Opening the picture" />
          ) : detail.picture ? (
            <button
              type="button"
              className="w-fit rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => setWide((open) => !open)}
              aria-label={wide ? "Show the ban picture small" : "Show the ban picture full size"}
            >
              <img src={detail.picture} alt={`What the app showed ${accountName}`} className={wide ? "max-w-full rounded-md" : "max-h-48 rounded-md"} />
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">The picture could not be opened.</p>
          )
        ) : null}

        {/* An account stopped before bans were recorded has no record to hang an appeal on. */}
        {ban.id ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <span className="text-sm font-medium">Appeal</span>
          {!ban.appealedAt ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-0 flex-1 basis-48 gap-2">
                <Label htmlFor={`appeal-note-${ban.id}`} className="text-xs text-muted-foreground">
                  A note, if you want one
                </Label>
                <Input id={`appeal-note-${ban.id}`} value={note} maxLength={1000} placeholder="Sent from the app's help screen" className="bg-background" onChange={(event) => setNote(event.target.value)} />
              </div>
              <Button type="button" variant="outline" className="bg-background" disabled={busy !== null} onClick={() => void run("appeal", () => recordAppeal(ban.id, note))}>
                {busy === "appeal" ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
                I appealed
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Appealed on {formatDateTime(ban.appealedAt)}
                {ban.appealNote ? `: ${ban.appealNote}` : "."}{" "}
                {ban.appealAnswer === "won" ? "Won." : ban.appealAnswer === "lost" ? "Lost." : "No answer yet."}
              </p>
              {!ban.appealAnswer ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="bg-background" disabled={busy !== null} onClick={() => void run("answer", () => recordAppealAnswer(ban.id, "won"))}>
                    Answer came: won
                  </Button>
                  <Button type="button" variant="outline" className="bg-background" disabled={busy !== null} onClick={() => void run("answer", () => recordAppealAnswer(ban.id, "lost"))}>
                    Answer came: lost
                  </Button>
                </div>
              ) : null}
            </>
          )}
          <p className="text-xs text-muted-foreground">Appeals are sent by hand in the app. Promo only keeps the record.</p>
        </div>
        ) : null}

        {stopped ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <span className="text-sm font-medium">What next</span>
            <p className="text-sm text-muted-foreground">
              {ban.appealAnswer === "won"
                ? "The appeal was won. Let it run again: it goes at half pace for 7 days."
                : ban.appealAnswer === "lost"
                  ? "The appeal was lost. Clean up retires it as Banned and puts its phone back to work."
                  : "Let it run again once it is sorted, at half pace for 7 days, or clean up to retire it as Banned, take it off its phone or profile and wipe the phone."}
            </p>
            {cleanUpHeldBack ? <p className="text-sm text-amber-600 dark:text-amber-400">{cleanUpHeldBack}</p> : null}
            {confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Retire {accountName} as Banned and wipe its phone?</span>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (!accountId) return
                    setBusy("clean")
                    try {
                      await cleanUpBannedAccount(accountId)
                      setConfirming(false)
                      // Says whether the wipe was queued or why it waits.
                      await (onCleanedUp ?? onChanged)()
                    } catch (failure) {
                      showErrorToast(getBansErrorMessage(failure))
                    } finally {
                      setBusy(null)
                    }
                  }}
                >
                  {busy === "clean" ? <Loader2Icon className="animate-spin" /> : null}
                  Yes, clean up
                </Button>
                <Button type="button" variant="outline" className="bg-background" disabled={busy !== null} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {onRunAgain && ban.appealAnswer !== "lost" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-background"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy("run")
                      try {
                        await onRunAgain()
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    {busy === "run" ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
                    Let it run again
                  </Button>
                ) : null}
                {cleanUpHeldBack && phoneId ? (
                  // Its words wrap in a narrow right panel rather than running past its edge.
                  <Button type="button" variant="outline" className="h-auto min-h-8 max-w-full bg-background whitespace-normal" asChild>
                    <Link to="/admin/anti-detect" search={{ section: "phones", open: phoneId }}>
                      Check iCloud on its phone
                    </Link>
                  </Button>
                ) : ban.appealAnswer !== "won" && accountId ? (
                  <Button type="button" variant="outline" className="bg-background" disabled={busy !== null} onClick={() => setConfirming(true)}>
                    <BrushCleaningIcon />
                    Clean up
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {showActionsBefore ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <span className="text-sm font-medium">The phone's last actions before it</span>
            {!detail ? (
              detailError ? <p className="text-sm text-destructive">{detailError}</p> : <LoadingRow label="Reading the actions" />
            ) : !detail.actionsBefore.length ? (
              <p className="text-sm text-muted-foreground">{phoneId ? "No actions were kept before it." : "It ran in a browser, which keeps no list of actions here. Its jobs are in the Jobs window."}</p>
            ) : (
              <div className="divide-y rounded-md border bg-background">
                {detail.actionsBefore.map((action) => (
                  <div key={action.id} className="grid gap-0.5 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span>{action.words}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(action.at)}</span>
                    </div>
                    <span className={action.status === "failed" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                      {action.status === "failed" ? action.error || "Failed" : action.status === "done" ? "Done" : action.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </PanelCard>
  )
}
