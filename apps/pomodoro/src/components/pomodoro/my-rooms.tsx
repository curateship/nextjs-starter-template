import { Loader2Icon, LockKeyholeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { listSavedRooms } from "@/lib/api/pomodoro/rooms"
import { cn } from "@/lib/utils"
import {
  RoomGroupEmpty,
  RoomGroupHeading,
} from "@/components/pomodoro/room-card"

export type MyRoomRow = Awaited<ReturnType<typeof listSavedRooms>>[number]

/**
 * My rooms on `/rooms`: every room you joined or hosted and have not left
 * for good, so a group that meets every week finds its room again without the
 * link. A closed room stays thirty days with the day it ended, then goes by
 * itself. Leave for good takes one off sooner.
 *
 * A short list in one card rather than the tall room cards, because these are
 * rooms you already know and the list can hold twenty of them.
 */
export function MyRooms({
  rooms,
  joiningSlug,
  busySlug,
  onJoin,
  onLeaveForGood,
}: {
  rooms: MyRoomRow[]
  /** The room a join is in flight for; every Join waits while one is. */
  joiningSlug: string
  /** The room a Leave for good is in flight for. */
  busySlug: string
  onJoin: (slug: string) => void
  onLeaveForGood: (room: MyRoomRow) => void
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <RoomGroupHeading
        title="My rooms"
        subtitle="joined or hosted · closed ones leave after 30 days"
      />
      {rooms.length ? (
        // No padding on the card or its content, so each line owns its inset
        // and the dividers between lines run edge to edge.
        <Card className="py-0">
          <CardContent className="px-0">
            <ul className="flex flex-col divide-y">
              {rooms.map((room) => (
                <MyRoomLine
                  key={room.id}
                  room={room}
                  joining={joiningSlug === room.slug}
                  joinBusy={joiningSlug !== ""}
                  leaving={busySlug === room.slug}
                  onJoin={() => onJoin(room.slug)}
                  onLeaveForGood={() => onLeaveForGood(room)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <RoomGroupEmpty>
          Rooms you join or host stay here, so you can find them again without
          the link.
        </RoomGroupEmpty>
      )}
    </section>
  )
}

function MyRoomLine({
  room,
  joining,
  joinBusy,
  leaving,
  onJoin,
  onLeaveForGood,
}: {
  room: MyRoomRow
  joining: boolean
  joinBusy: boolean
  leaving: boolean
  onJoin: () => void
  onLeaveForGood: () => void
}) {
  const closed = room.phase === "closed"
  // The phases a join is let in on, the same three the server allows.
  const open = !closed && ["waiting", "short", "long"].includes(room.phase)
  const status = room.current
    ? "You are in it"
    : closed
      ? `Ended ${new Date(room.closedAt ?? room.lastJoinedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
      : open
        ? "Open to join"
        : "In session"

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <i
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full",
          closed
            ? "bg-muted-foreground/50"
            : open || room.current
              ? "bg-[var(--p-success)]"
              : "bg-[var(--p-accent)]"
        )}
      />
      <div className="mr-auto flex min-w-0 flex-col">
        <strong className="truncate text-sm">{room.name}</strong>
        <span className="truncate text-xs text-muted-foreground">
          {status} · {room.hosting ? "you host it" : `${room.hostName} hosts`}
        </span>
      </div>
      {!room.current && !closed ? (
        open ? (
          <Button disabled={joinBusy || leaving} onClick={onJoin}>
            {joining ? (
              <>
                <Loader2Icon className="animate-spin" aria-hidden="true" />
                Joining…
              </>
            ) : (
              "Join"
            )}
          </Button>
        ) : (
          <Button variant="outline" disabled>
            <LockKeyholeIcon aria-hidden="true" />
            Locked
          </Button>
        )
      ) : null}
      <Button
        variant="outline"
        disabled={leaving || joining}
        onClick={onLeaveForGood}
      >
        {leaving ? (
          <>
            <Loader2Icon className="animate-spin" aria-hidden="true" />
            Leaving…
          </>
        ) : (
          "Leave for good"
        )}
      </Button>
    </li>
  )
}
