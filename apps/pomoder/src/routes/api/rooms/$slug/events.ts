import { createFileRoute } from "@tanstack/react-router"
import { Client } from "pg"
import { eq } from "drizzle-orm"

import { db, getDatabaseUrl } from "@/server/db"
import { roomChannel, roomSnapshot } from "@/server/rooms"
import { rooms } from "@/server/schema"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute("/api/rooms/$slug/events")({
  server: { handlers: { GET: async ({ params, request }) => {
    const user = await findCurrentUser()
    if (!user) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Authentication required" } }, { status: 401 })
    const [room] = await db.select().from(rooms).where(eq(rooms.slug, params.slug)).limit(1)
    if (!room) return Response.json({ error: { code: "ROOM_NOT_FOUND", message: "Room not found" } }, { status: 404 })
    try { await roomSnapshot(room.id, user.id) } catch { return Response.json({ error: { code: "ROOM_MEMBERSHIP_REQUIRED", message: "Join this room first" } }, { status: 403 }) }
    const encoder = new TextEncoder()
    const client = new Client({ connectionString: getDatabaseUrl() })
    const channel = roomChannel(room.id)
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let closed = false
    const stream = new ReadableStream({
      async start(controller) {
        const send = async (event: string) => { if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(await roomSnapshot(room.id, user.id))}\n\n`)) }
        try {
          await client.connect()
          client.on("notification", () => { void send("snapshot") })
          await client.query(`LISTEN ${channel}`)
          await send("snapshot")
          heartbeat = setInterval(() => controller.enqueue(encoder.encode(": heartbeat\n\n")), 15_000)
        } catch (error) { controller.error(error) }
        request.signal.addEventListener("abort", () => { if (closed) return; closed = true; if (heartbeat) clearInterval(heartbeat); void client.end(); controller.close() }, { once: true })
      },
      cancel() { closed = true; if (heartbeat) clearInterval(heartbeat); return client.end() },
    })
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } })
  } } },
})
