import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { watchForPerson, type MyLiveWatch } from "@/server/project/my-live"

/**
 * One person's live updates, held open by My dashboard or the Team dashboard
 * (`src/lib/project/use-my-live.ts`). See `src/server/project/my-live.ts`
 * for what each word means.
 *
 * Server-Sent Events: `data: mine` or `data: team`. Lines starting `:` open
 * the stream and keep it alive. Which projects the person can see is looked
 * at again on every heartbeat, so a project they join is heard within a
 * heartbeat and one they leave goes quiet. Someone with no team gets a 404,
 * and EventSource never retries a refused request.
 */
const HEARTBEAT_MS = 25_000

export const Route = createFileRoute("/api/project/my-live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await findCurrentUser()
        if (!user) return Response.json({ detail: "Sign in first." }, { status: 401 })

        const encoder = new TextEncoder()
        let heartbeat: ReturnType<typeof setInterval> | null = null
        let watch: MyLiveWatch | null = null
        let closed = false
        const queued: string[] = []
        let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null

        const send = (text: string) => {
          if (closed) return
          if (!controllerRef) {
            queued.push(text)
            return
          }
          try {
            controllerRef.enqueue(encoder.encode(text))
          } catch {
            close()
          }
        }
        const close = () => {
          if (closed) return
          closed = true
          if (heartbeat) clearInterval(heartbeat)
          watch?.stop()
          try {
            controllerRef?.close()
          } catch {
            // Already closed.
          }
        }

        watch = await watchForPerson(user.id, (change) => send(`data: ${change}\n\n`))
        if (!watch) return Response.json({ detail: "You're not on a team." }, { status: 404 })

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controllerRef = controller
            send(": connected\n\n")
            for (const text of queued.splice(0)) send(text)
            heartbeat = setInterval(() => {
              void watch!.refresh().then(
                (still) => (still ? send(": ping\n\n") : close()),
                () => send(": ping\n\n")
              )
            }, HEARTBEAT_MS)
            heartbeat.unref?.()
            request.signal.addEventListener("abort", close)
          },
          cancel() {
            closed = true
            if (heartbeat) clearInterval(heartbeat)
            watch?.stop()
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            // See the bell's stream: anything that compresses this makes it go quiet.
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        })
      },
    },
  },
})
