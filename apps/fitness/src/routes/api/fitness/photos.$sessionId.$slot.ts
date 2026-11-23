import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { PHOTO_SLOTS, photoKeyFor, type PhotoSlot } from "@/server/fitness/photos"
import { getFromR2 } from "@/server/media/storage"

/**
 * One before and after photo, for its owner or a coach they let see photos.
 * Anyone else, signed out or not, and an id that doesn't exist get the same
 * 404, so the address tells an outsider nothing. Never cached by anything
 * between the bucket and the person.
 */
export const Route = createFileRoute("/api/fitness/photos/$sessionId/$slot")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const notFound = Response.json({ detail: "That photo doesn't exist or you can't see it." }, { status: 404 })
        const user = await findCurrentUser()
        if (!user) return notFound
        if (!(PHOTO_SLOTS as readonly string[]).includes(params.slot)) return notFound
        const key = await photoKeyFor(user.id, params.sessionId, params.slot as PhotoSlot)
        if (!key) return notFound
        try {
          const object = await getFromR2(key)
          if (!object.Body) return Response.json({ detail: "The photo could not be read." }, { status: 502 })
          const headers = new Headers({
            "Content-Type": object.ContentType ?? "image/jpeg",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          })
          if (object.ContentLength !== undefined) headers.set("Content-Length", object.ContentLength.toString())
          return new Response(toBodyInit(object.Body), { headers })
        } catch {
          return Response.json({ detail: "The photo could not be read." }, { status: 502 })
        }
      },
    },
  },
})

function toBodyInit(body: unknown): BodyInit {
  if (
    body &&
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    return body.transformToWebStream() as ReadableStream
  }
  return body as BodyInit
}
