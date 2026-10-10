import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import {
  getFromR2,
  R2StorageNotConfiguredError,
} from "@/server/media/storage"
import { loadUploadDownload } from "@/server/pomodoro/media-uploads"

/**
 * Download one of your own uploads (uploads-and-sharing task 02, part 6): the
 * finished file you play, named after the upload, as an attachment. Only for
 * the signed-in owner; anybody else's id, a file in the bin and one still
 * being prepared all answer 404. See "Download" in
 * `workspace/docs/my-uploads.md`.
 *
 * Through the server rather than the bucket's own address, because a browser
 * ignores a download name on another site's file and would open it instead.
 */
export const Route = createFileRoute("/api/pomodoro/uploads/$mediaId/download")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await findCurrentUser()
        if (!user) {
          return Response.json({ detail: "Sign in to download your files." }, { status: 401 })
        }
        const file = await loadUploadDownload(user.id, params.mediaId)
        if (!file) {
          return Response.json({ detail: "That file is not yours to download." }, { status: 404 })
        }
        try {
          const object = await getFromR2(file.storagePath)
          const body = object.Body
          if (!body) {
            return Response.json({ detail: "The file could not be read." }, { status: 502 })
          }
          const headers = new Headers({
            "Content-Type": object.ContentType || file.mimeType,
            "Content-Disposition": contentDisposition(file.filename),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          })
          if (object.ContentLength !== undefined) {
            headers.set("Content-Length", object.ContentLength.toString())
          }
          return new Response(toBodyInit(body), { headers })
        } catch (error) {
          if (error instanceof R2StorageNotConfiguredError) {
            return Response.json({ detail: "File storage is not set up." }, { status: 503 })
          }
          return Response.json({ detail: "The file could not be read." }, { status: 502 })
        }
      },
    },
  },
})

/**
 * `attachment` with the name twice: a plain one any browser reads, with
 * quotes and anything outside printable ASCII replaced, and the exact name
 * for browsers that read `filename*`.
 */
function contentDisposition(filename: string) {
  const plain = filename.replace(/[^\x20-\x7e]|["\\]/g, "_")
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

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
