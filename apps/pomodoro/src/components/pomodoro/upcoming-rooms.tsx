import * as React from "react"
import { CalendarClockIcon, CheckIcon, CopyIcon, MailIcon } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { listUpcoming } from "@/lib/api/pomodoro/rooms"
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
  busySlug,
  onCancel,
  onReachedStart,
}: {
  rooms: UpcomingRoomRow[]
  busySlug: string
  onCancel: (room: UpcomingRoomRow) => void
  onReachedStart: () => void
}) {
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

  if (!rooms.length) return null

  return (
    <section className="flex flex-col gap-3.5">
      <RoomGroupHeading title="Upcoming" subtitle="booked · opens on its own" />
      <div className="grid gap-3.5 sm:grid-cols-2">
        {rooms.map((room) => (
          <UpcomingRoomCard
            key={room.id}
            room={room}
            busy={busySlug === room.slug}
            onCancel={() => onCancel(room)}
          />
        ))}
      </div>
    </section>
  )
}

function UpcomingRoomCard({
  room,
  busy,
  onCancel,
}: {
  room: UpcomingRoomRow
  busy: boolean
  onCancel: () => void
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
                <button
                  type="button"
                  disabled={busy}
                  aria-label={
                    copied ? "Invite link copied" : "Copy the invite link"
                  }
                  className="flex size-10 shrink-0 items-center justify-center outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 rounded-full border text-[var(--p-text-subtle)] disabled:opacity-60"
                  onClick={() => void copyInvite()}
                >
                  {copied ? (
                    <CheckIcon className="size-4" aria-hidden="true" />
                  ) : (
                    <CopyIcon className="size-4" aria-hidden="true" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {copied ? "Invite link copied" : "Copy the invite link"}
              </TooltipContent>
            </Tooltip>
            <button
              type="button"
              disabled={busy}
              className="shrink-0 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 rounded-full bg-[var(--p-accent)] px-5 py-2.5 text-[13.5px] font-bold text-[var(--p-on-accent)] hover:bg-[var(--p-accent-2)] disabled:opacity-60"
              onClick={onCancel}
            >
              Cancel
            </button>
          </>
        ) : null}
      </RoomCardAction>
      {copyFailed ? (
        <p className="px-3 text-xs text-[var(--p-text-subtle)]">
          Copying failed. The link is {inviteUrl}
        </p>
      ) : null}
    </RoomCard>
  )
}
