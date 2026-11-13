import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { findCurrentUser } from "@/server/auth/security"
import { subscribeToRoom } from "@/server/pomodoro/room-events"
import {
  keepWatching,
  roomSnapshot,
  stopWatching,
} from "@/server/pomodoro/rooms"
import { roomMemberships, rooms } from "@/server/pomodoro/schema"

/**
 * The room's live stream, ported from the old app: a Server-Sent Events
 * connection that sends a full snapshot on every change. Joins, leaves, host
 * actions and the fifteen-second clock all NOTIFY the room's channel, and the
 * process's one shared listener (`room-events.ts`) passes each to every open
 * page of that room. Snapshots carry display names, roles and chat bodies —
 * never emails or user ids — and the client recomputes the countdown locally
 * from the snapshot's server timestamps.
 *
 * Members only: the first snapshot doubles as the membership check, and a
 * viewer whose membership ends mid-stream gets a `room_gone` event instead
 * of an error. One account may hold at most three pages open at once.
 *
 * A closed room has no members left, so it answers only somebody who was in
 * it: one closed snapshot, which tells a tab that was hidden while the host
 * closed it that the room has ended, and then the stream ends. Anyone else
 * gets 404. A refused request is never retried by the browser, so a 404 to a
 * former member would leave their tab saying "Reconnecting" for good.
 */
/** A failed watching write costs at most a notice nobody needed; say so in the log. */
function logWatchingFailure(error: unknown) {
  console.error("room watching could not be saved", error)
}

function refuse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status })
}

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}

async function wasInRoom(roomId: string, userId: string) {
  const [row] = await db
    .select({ id: roomMemberships.id })
    .from(roomMemberships)
    .where(
      and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId))
    )
    .limit(1)
  return Boolean(row)
}

export const Route = createFileRoute("/api/pomodoro/rooms/$slug/events")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const user = await findCurrentUser()
        if (!user) return refuse(401, "AUTH_REQUIRED", "Sign in first")
        const [room] = await db
          .select()
          .from(rooms)
          .where(eq(rooms.slug, params.slug))
          .limit(1)
        if (!room) return refuse(404, "ROOM_NOT_FOUND", "Room not found")
        if (room.closedAt || room.phase === "closed") {
          if (room.hostUserId !== user.id && !(await wasInRoom(room.id, user.id)))
            return refuse(404, "ROOM_NOT_FOUND", "Room not found")
          const ended = JSON.stringify(await roomSnapshot(room.id, user.id))
          return new Response(`event: snapshot\ndata: ${ended}\n\n`, {
            headers: STREAM_HEADERS,
          })
        }
        try {
          await roomSnapshot(room.id, user.id)
        } catch {
          return refuse(403, "ROOM_MEMBERSHIP_REQUIRED", "Join this room first")
        }
        const encoder = new TextEncoder()
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let closed = false
        let onEvent = () => {}
        const stopListening = subscribeToRoom(room.id, user.id, () => onEvent())
        if (!stopListening)
          return refuse(
            429,
            "ROOM_STREAM_LIMIT",
            "This room is open in too many tabs. Close one and try again."
          )
        const stopAll = () => {
          closed = true
          if (heartbeat) clearInterval(heartbeat)
          stopListening()
          void stopWatching(room.id, user.id).catch(logWatchingFailure)
        }
        const stream = new ReadableStream({
          start(controller) {
            const finish = () => {
              if (closed) return
              stopAll()
              try {
                controller.close()
              } catch {
                // Already closed.
              }
            }
            // The tab can go away while it is told nothing; writing to it then
            // throws, and that is the moment to give its place back.
            const push = (text: string) => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(text))
              } catch {
                finish()
              }
            }
            const send = async (event: string) => {
              if (closed) return
              let payload: string | null = null
              try {
                payload = JSON.stringify(await roomSnapshot(room.id, user.id))
              } catch {
                payload = null
              }
              if (closed) return
              if (payload === null) {
                // The viewer's membership ended (they left or were removed),
                // so tell the client the stream is over instead of erroring.
                push(`event: room_gone\ndata: {}\n\n`)
                finish()
                return
              }
              push(`event: ${event}\ndata: ${payload}\n\n`)
            }
            // A tab that left during the membership check has already fired
            // its abort, and a listener added later would never hear it.
            if (request.signal.aborted) {
              finish()
              return
            }
            onEvent = () => void send("snapshot")
            void send("snapshot")
            // While this page is open the member is looking at the room, so
            // the bell stays quiet about joins, chat and reactions they can
            // already see. The heartbeat renews it; the close clears it. A
            // failed write only means a notice they did not need, so it never
            // ends the stream.
            void keepWatching(room.id, user.id).catch(logWatchingFailure)
            heartbeat = setInterval(() => {
              if (closed) return
              push(": heartbeat\n\n")
              void keepWatching(room.id, user.id).catch(logWatchingFailure)
            }, 15_000)
            request.signal.addEventListener("abort", () => finish(), {
              once: true,
            })
          },
          cancel() {
            if (!closed) stopAll()
          },
        })
        return new Response(stream, { headers: STREAM_HEADERS })
      },
    },
  },
})
