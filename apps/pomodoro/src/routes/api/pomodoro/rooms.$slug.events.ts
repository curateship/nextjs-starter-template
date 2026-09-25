import { createFileRoute } from "@tanstack/react-router"
import { Client } from "pg"
import { eq } from "drizzle-orm"

import { db, getDatabaseUrl } from "@/server/db"
import { findCurrentUser } from "@/server/auth/security"
import { roomChannel, roomSnapshot } from "@/server/pomodoro/rooms"
import { rooms } from "@/server/pomodoro/schema"

/**
 * The room's live stream, ported from the old app: a Server-Sent Events
 * connection that sends a full snapshot on every change. The server LISTENs
 * on the room's pg_notify channel; joins, leaves, host actions and the
 * fifteen-second clock all NOTIFY it. Snapshots carry display names, roles
 * and chat bodies — never emails or user ids — and the client recomputes
 * the countdown locally from the snapshot's server timestamps.
 *
 * Members only: the first snapshot doubles as the membership check, and a
 * viewer whose membership ends mid-stream gets a `room_gone` event instead
 * of an error.
 */
export const Route = createFileRoute("/api/pomodoro/rooms/$slug/events")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const user = await findCurrentUser()
        if (!user)
          return Response.json(
            { error: { code: "AUTH_REQUIRED", message: "Sign in first" } },
            { status: 401 }
          )
        const [room] = await db
          .select()
          .from(rooms)
          .where(eq(rooms.slug, params.slug))
          .limit(1)
        if (!room)
          return Response.json(
            { error: { code: "ROOM_NOT_FOUND", message: "Room not found" } },
            { status: 404 }
          )
        try {
          await roomSnapshot(room.id, user.id)
        } catch {
          return Response.json(
            {
              error: {
                code: "ROOM_MEMBERSHIP_REQUIRED",
                message: "Join this room first",
              },
            },
            { status: 403 }
          )
        }
        const encoder = new TextEncoder()
        const client = new Client({ connectionString: getDatabaseUrl() })
        const channel = roomChannel(room.id)
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let closed = false
        const stream = new ReadableStream({
          async start(controller) {
            const finish = () => {
              if (closed) return
              closed = true
              if (heartbeat) clearInterval(heartbeat)
              void client.end()
              controller.close()
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
                controller.enqueue(
                  encoder.encode(`event: room_gone\ndata: {}\n\n`)
                )
                finish()
                return
              }
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${payload}\n\n`)
              )
            }
            try {
              await client.connect()
              client.on("notification", () => {
                void send("snapshot")
              })
              await client.query(`LISTEN ${channel}`)
              await send("snapshot")
              heartbeat = setInterval(() => {
                if (!closed)
                  controller.enqueue(encoder.encode(": heartbeat\n\n"))
              }, 15_000)
            } catch (error) {
              if (!closed) {
                closed = true
                if (heartbeat) clearInterval(heartbeat)
                void client.end()
                controller.error(error)
              }
            }
            request.signal.addEventListener("abort", () => finish(), {
              once: true,
            })
          },
          cancel() {
            closed = true
            if (heartbeat) clearInterval(heartbeat)
            return client.end()
          },
        })
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        })
      },
    },
  },
})
