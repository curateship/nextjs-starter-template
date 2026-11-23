import { createFileRoute } from "@tanstack/react-router"

import { subscribeToUserNotifications } from "@/server/notification-events"
import { findCurrentUser } from "@/server/security"

// Server-Sent Events stream for instant notification nudges. The browser's
// EventSource holds this open and refetches its inbox whenever a `data:`
// message arrives. Comment lines (`: ping`) are heartbeats that keep the
// connection alive through proxies; EventSource ignores them.
const HEARTBEAT_MS = 25_000

export const Route = createFileRoute("/api/v1/notifications/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await findCurrentUser()
        if (!user) {
          return Response.json(
            { detail: "Missing AI Video session" },
            { status: 401 }
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
                // Consumer went away without an abort/cancel — tear down so the
                // heartbeat and subscription don't linger.
                close()
              }
            }

            // Open the stream immediately so the client sees a live connection.
            send(": connected\n\n")
            unsubscribe = subscribeToUserNotifications(user.id, () =>
              send("data: 1\n\n")
            )
            heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS)

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
            // no-transform stops proxies compressing/buffering the stream.
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Disable nginx-style proxy buffering so events flush immediately.
            "X-Accel-Buffering": "no",
          },
        })
      },
    },
  },
})
