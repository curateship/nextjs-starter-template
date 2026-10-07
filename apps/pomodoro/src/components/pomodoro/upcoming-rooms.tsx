import * as React from "react"
import {
  CalendarClockIcon,
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  MailIcon,
  RepeatIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { listMyRepeats, listUpcoming } from "@/lib/api/pomodoro/rooms"
import {
  RoomCard,
  RoomCardAction,
  RoomCardDetail,
  RoomCardTitle,
  RoomGroupHeading,
} from "@/components/pomodoro/room-card"
import {
  describeWaitUntil,
  formatRoomStart,
} from "@/lib/pomodoro/scheduled-rooms"

export type UpcomingRoomRow = Awaited<ReturnType<typeof listUpcoming>>[number]
export type MyRepeatRow = Awaited<ReturnType<typeof listMyRepeats>>[number]

/** What the two series buttons act on: the rule, with words for the question. */
export type SeriesTarget = {
  repeatId: string
  name: string
  startsAt: Date | null
  invited: number
}

/**
 * The Upcoming group on the rooms page: rooms that have been booked and have
 * not opened yet. Everyone sees the public bookings; a host also sees their
 * own unlisted ones, with the invite tally and the button that calls it off.
 *
 * The times are drawn in the reader's own clock, because the reader is the
 * one deciding whether to be there. The invite email uses the host's clock
 * instead and says so, since its reader has no app to ask.
 */
export function UpcomingRooms({
  rooms,
  series,
  busyKey,
  onCancel,
  onSkipWeek,
  onCancelSeries,
  onReachedStart,
}: {
  rooms: UpcomingRoomRow[]
  /** The host's own weekly rules. Those with a booked room show as that room. */
  series: MyRepeatRow[]
  /** The slug or rule id an action is running for. */
  busyKey: string
  onCancel: (room: UpcomingRoomRow) => void
  onSkipWeek: (target: SeriesTarget) => void
  onCancelSeries: (target: SeriesTarget) => void
  onReachedStart: () => void
}) {
  const unbooked = series.filter((rule) => !rule.nextIsBooked)
  const soonest = rooms.length
    ? Math.min(...rooms.map((room) => new Date(room.startsAt).getTime()))
    : null

  // A booked room opens on the server with nobody watching, so the page has
  // to look again once its time passes or the card would sit there for ever.
  // Twenty seconds of slack covers the worker's fifteen-second pass, and the
  // check repeats because a busy worker can take longer than one pass. It
  // stops on its own: once the room opens it leaves this list, and with no
  // bookings left there is no soonest start time to wait for.
  React.useEffect(() => {
    if (soonest === null) return
    let timer = 0
    const check = () => {
      onReachedStart()
      timer = window.setTimeout(check, 20_000)
    }
    timer = window.setTimeout(check, Math.max(0, soonest + 20_000 - Date.now()))
    return () => window.clearTimeout(timer)
  }, [soonest, onReachedStart])

  if (!rooms.length && !unbooked.length) return null

  return (
    <section className="flex flex-col gap-3.5">
      <RoomGroupHeading title="Upcoming" subtitle="booked · opens on its own" />
      <div className="grid gap-3.5 sm:grid-cols-2">
        {rooms.map((room) => {
          const target: SeriesTarget | null = room.repeatId
            ? {
                repeatId: room.repeatId,
                name: room.name,
                startsAt: new Date(room.startsAt),
                invited: room.invitedCount,
              }
            : null
          return (
            <UpcomingRoomCard
              key={room.id}
              room={room}
              busy={busyKey === room.slug || busyKey === room.repeatId}
              onCancel={() => onCancel(room)}
              seriesActions={
                target ? (
                  <SeriesActions
                    busy={busyKey === target.repeatId}
                    onSkipWeek={() => onSkipWeek(target)}
                    onCancelSeries={() => onCancelSeries(target)}
                  />
                ) : null
              }
            />
          )
        })}
        {unbooked.map((rule) => {
          const target: SeriesTarget = {
            repeatId: rule.id,
            name: rule.name,
            startsAt: rule.nextStartsAt ? new Date(rule.nextStartsAt) : null,
            invited: 0,
          }
          return (
            <SeriesCard
              key={rule.id}
              rule={rule}
              actions={
                <SeriesActions
                  busy={busyKey === rule.id}
                  onSkipWeek={() => onSkipWeek(target)}
                  onCancelSeries={() => onCancelSeries(target)}
                />
              }
            />
          )
        })}
      </div>
    </section>
  )
}

/**
 * The two ways a weekly room ends, side by side and worded apart: one week,
 * or every week from now on. Both remove bookings, so both are destructive.
 */
function SeriesActions({
  busy,
  onSkipWeek,
  onCancelSeries,
}: {
  busy: boolean
  onSkipWeek: () => void
  onCancelSeries: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3">
      {busy ? (
        <Loader2Icon
          className="size-4 animate-spin text-muted-foreground"
          aria-label="Cancelling"
        />
      ) : null}
      <Button variant="destructive" disabled={busy} onClick={onSkipWeek}>
        Cancel this week
      </Button>
      <Button variant="destructive" disabled={busy} onClick={onCancelSeries}>
        Cancel the series
      </Button>
    </div>
  )
}

/**
 * A weekly rule whose next room is not booked yet, which is most of the week:
 * each room is booked a day before it starts. Only its host sees this card.
 */
function SeriesCard({
  rule,
  actions,
}: {
  rule: MyRepeatRow
  actions: React.ReactNode
}) {
  const readerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const next = rule.nextStartsAt ? new Date(rule.nextStartsAt) : null
  return (
    <RoomCard roomId={rule.id}>
      <RoomCardTitle
        name={rule.name}
        tone="locked"
        status={next ? describeWaitUntil(next, new Date()) : "paused"}
      />
      <RoomCardDetail>
        <RepeatIcon className="size-3.5" aria-hidden="true" />
        Repeats {rule.label}, {rule.timezone} time
      </RoomCardDetail>
      <RoomCardDetail>
        <CalendarClockIcon className="size-3.5" aria-hidden="true" />
        {next ? `Next: ${formatRoomStart(next, readerTimezone)}` : "No day left to book"}
      </RoomCardDetail>
      <RoomCardAction
        note={
          <>
            You are hosting · booked a day ahead
            {rule.inviteCount
              ? ` · ${rule.inviteCount} ${rule.inviteCount === 1 ? "invite" : "invites"} each week`
              : ""}
            {rule.visibility === "unlisted" ? " · unlisted" : ""}
          </>
        }
      >
        {null}
      </RoomCardAction>
      {actions}
    </RoomCard>
  )
}

function UpcomingRoomCard({
  room,
  busy,
  onCancel,
  seriesActions,
}: {
  room: UpcomingRoomRow
  busy: boolean
  onCancel: () => void
  /** Cancel this week and Cancel the series, when the host's own rule booked it. */
  seriesActions: React.ReactNode
}) {
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)
  const startsAt = new Date(room.startsAt)
  const inviteUrl = `${window.location.origin}/rooms/${room.slug}`
  const readerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

  const copyInvite = async () => {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <RoomCard roomId={room.id}>
      <RoomCardTitle
        name={room.name}
        tone="locked"
        status={describeWaitUntil(startsAt, new Date())}
      />
      <RoomCardDetail>
        <CalendarClockIcon className="size-3.5" aria-hidden="true" />
        {formatRoomStart(startsAt, readerTimezone)}
      </RoomCardDetail>
      {room.repeatLabel ? (
        <RoomCardDetail>
          <RepeatIcon className="size-3.5" aria-hidden="true" />
          Repeats {room.repeatLabel}
        </RoomCardDetail>
      ) : null}
      {room.mine && room.invitedCount > 0 ? (
        <RoomCardDetail>
          <MailIcon className="size-3.5" aria-hidden="true" />
          {room.emailedCount} of {room.invitedCount} invitations sent
        </RoomCardDetail>
      ) : null}
      <RoomCardAction
        note={
          <>
            {room.mine ? "You are hosting" : `${room.hostName} is hosting`} ·{" "}
            {room.focusMinutes} min focus
            {room.mine && room.visibility === "unlisted" ? " · unlisted" : ""}
          </>
        }
      >
        {room.mine ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={busy}
                  aria-label={
                    copied ? "Invite link copied" : "Copy the invite link"
                  }
                  onClick={() => void copyInvite()}
                >
                  {copied ? (
                    <CheckIcon aria-hidden="true" />
                  ) : (
                    <CopyIcon aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {copied ? "Invite link copied" : "Copy the invite link"}
              </TooltipContent>
            </Tooltip>
            {/* Destructive, because it removes a booking. The label says what
                it cancels, since "Cancel" alone reads like closing a window.
                A weekly room has its own two buttons below instead. */}
            {seriesActions ? null : (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={onCancel}
              >
                {busy ? (
                  <>
                    <Loader2Icon className="animate-spin" aria-hidden="true" />
                    Cancelling…
                  </>
                ) : (
                  "Cancel booking"
                )}
              </Button>
            )}
          </>
        ) : null}
      </RoomCardAction>
      {seriesActions}
      {copyFailed ? (
        <p className="px-3 text-xs text-[var(--p-text-subtle)]">
          Copying failed. The link is {inviteUrl}
        </p>
      ) : null}
    </RoomCard>
  )
}
