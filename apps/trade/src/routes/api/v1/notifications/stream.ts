import { createFileRoute } from "@tanstack/react-router"

import { subscribeToUserNotifications } from "@/server/notification-events"
import { findSessionContext } from "@/server/security"
import { readShellGlobals } from "@/server/shell-settings"
import { db } from "@/server/db"

/**
 * The connection a browser holds open so its bell can light up on its own.
 *
 * It is a Server-Sent Events stream: an ordinary GET whose response never ends.
 * A line starting `data:` means "go and check"; a line starting `:` is a
 * comment the browser ignores, used here to open the stream immediately and to
 * send a sign of life every 25 seconds so nothing in between decides the
 * connection is dead and cuts it.
 *
 * Nothing about a notice travels down here — only "you, specifically, have
 * something new". The browser then asks for the count the normal way.
 *
 * No origin check, and none is missing: this is a read, like every other read
 * in the app, and the only thing another site could learn by opening it is
 * whether its own visitor has unread notices — which the browser will not tell
 * it, because a cross-origin EventSource needs CORS headers this never sends.
 */
const HEARTBEAT_MS = 25_000

export const Route = createFileRoute("/api/v1/notifications/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Read as whoever the page is being drawn for. While an admin is
        // viewing the app as a member, that is the member — same bell, same
        // notices, same as the shell bootstrap.
        const session = await findSessionContext()
        if (!session) {
          return Response.json(
            { detail: "Missing Custom Shell session" },
            { status: 401 }
          )
        }

        // The off switch. A browser whose settings say it is off never gets
        // here, but a browser that was already open when it was flipped would
        // reconnect — and a plain error answer is what stops it: EventSource
        // only retries after a *stream* drops, never after a refused request.
        // The bell keeps working on its slow poll.
        const globals = await readShellGlobals(db)
        if (!globals.liveNotifications) {
          return Response.json(
            { detail: "Live notifications are turned off" },
            { status: 503 }
          )
        }

        const encoder = new TextEncoder()
        let heartbeat: ReturnType<typeof setInterval> | null = null
        let unsubscribe: (() => void) | null = null
        let closed = false

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const close = () => {
              if (closed) return
              closed = true
              if (heartbeat) clearInterval(heartbeat)
              unsubscribe?.()
              try {
                controller.close()
              } catch {
                // Already closed.
              }
            }

            const send = (text: string) => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(text))
              } catch {
                // The browser went away without an abort or a cancel. Tear
                // down here too, or this tab leaves a heartbeat ticking and a
                // subscriber in the set forever.
                close()
              }
            }

            send(": connected\n\n")
            unsubscribe = subscribeToUserNotifications(session.user.id, () =>
              send("data: 1\n\n")
            )
            heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS)
            heartbeat.unref?.()

            request.signal.addEventListener("abort", close)
          },
          cancel() {
            closed = true
            if (heartbeat) clearInterval(heartbeat)
            unsubscribe?.()
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            // `no-transform` is the one that matters: it tells anything in
            // between not to compress or repackage the body. A compressed
            // stream does not fail, it just goes quiet — which reads exactly
            // like "no notifications" and can be broken for weeks. Nothing in
            // this app gzips (Nitro's node server does not compress by
            // default and no compression plugin is installed), so this is
            // about the proxy in front of it in production.
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Only nginx reads this one. Coolify fronts this app with Traefik
            // or Caddy, which ignore it — kept because it is free and correct
            // if nginx ever appears, but the real check is the deployed URL.
            "X-Accel-Buffering": "no",
          },
        })
      },
    },
  },
})
