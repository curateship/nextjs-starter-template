import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { requireProjectAccess } from "@/server/project/access"
import { subscribeToProject } from "@/server/project/live"

/**
 * One project's live updates, held open by a browser showing that project or
 * one of its tasks (`src/lib/project/use-project-live.ts`). See
 * `src/server/project/live.ts` for where the changes come from.
 *
 * Server-Sent Events: `data: task:<id>` when a task or anything on it
 * changed, `data: chat` when the project's own chat did, and `data: all`
 * after the server missed some. Lines starting `:`
 * open the stream and keep it alive. Only ids are sent; the browser then
 * loads what changed the normal way.
 *
 * Someone who can't see the project gets the same 404 as a project that
 * doesn't exist, and EventSource never retries a refused request. Access is
 * checked again every few minutes, so someone taken off the project stops
 * hearing about it.
 */
const HEARTBEAT_MS = 25_000
const RECHECK_EVERY_BEATS = 12

export const Route = createFileRoute("/api/project/live/$projectId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const user = await findCurrentUser()
        if (!user) return Response.json({ detail: "Sign in first." }, { status: 401 })
        const canSee = () =>
          requireProjectAccess(user.id, params.projectId).then(
            () => true,
            () => false
          )
        if (!(await canSee())) {
          return Response.json(
            { detail: "That project doesn't exist or you can't see it." },
            { status: 404 }
          )
        }

        const encoder = new TextEncoder()
        let heartbeat: ReturnType<typeof setInterval> | null = null
        let unsubscribe: (() => void) | null = null
        let closed = false
        let beats = 0

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
                close()
              }
            }

            send(": connected\n\n")
            unsubscribe = subscribeToProject(params.projectId, (change) => send(`data: ${change}\n\n`))
            heartbeat = setInterval(() => {
              beats += 1
              if (beats % RECHECK_EVERY_BEATS === 0) {
                void canSee().then((still) => (still ? send(": ping\n\n") : close()))
              } else {
                send(": ping\n\n")
              }
            }, HEARTBEAT_MS)
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
