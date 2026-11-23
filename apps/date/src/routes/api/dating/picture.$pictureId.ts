import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { R2StorageNotConfiguredError } from "@/server/media/storage"
import { readPicture } from "@/server/phone/pictures"

/**
 * One of the signed-in member's Date pictures: a card's photo, a step's
 * screenshot or the screen that stopped the phone. Pictures are other
 * people's photos and private chats, so they are never at a public address:
 * this checks the session and that the picture is the member's own, then
 * opens the encrypted copy. A sample picture is a drawing in `public/`, and
 * the answer points there.
 *
 * Outside `src/lib/api/`, so the shell's guard test does not walk it; the
 * session check below is its lock, the same as the shell's media file route.
 */
export const Route = createFileRoute("/api/dating/picture/$pictureId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await findCurrentUser()
        if (!user) return Response.json({ error: "Sign in to see this picture." }, { status: 401 })
        if (!/^[A-Za-z0-9-]{1,40}$/.test(params.pictureId)) {
          return Response.json({ error: "No such picture." }, { status: 404 })
        }
        try {
          const picture = await readPicture(user.id, params.pictureId)
          if (!picture) return Response.json({ error: "No such picture." }, { status: 404 })
          if (picture.kind === "sample") {
            return new Response(null, { status: 302, headers: { location: picture.path, "cache-control": "private, max-age=3600" } })
          }
          return new Response(new Uint8Array(picture.jpeg), {
            headers: {
              "content-type": "image/jpeg",
              // A picture never changes once kept, and only this member may see it.
              "cache-control": "private, max-age=86400, immutable",
              "x-content-type-options": "nosniff",
            },
          })
        } catch (error) {
          if (error instanceof R2StorageNotConfiguredError) {
            return Response.json({ error: "File storage is not set up, so pictures cannot be opened." }, { status: 503 })
          }
          console.error("A Date picture could not be opened", error)
          return Response.json({ error: "The picture could not be opened." }, { status: 502 })
        }
      },
    },
  },
})
