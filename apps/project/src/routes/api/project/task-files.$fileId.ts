import { createFileRoute } from "@tanstack/react-router"

import { isShownPicture } from "@/lib/project/files"
import { findCurrentUser } from "@/server/auth/security"
import { getFromR2 } from "@/server/media/storage"
import { loadTaskFileForDownload } from "@/server/project/task-files"

/**
 * One file on a task, for someone who can see the task. Anyone else, and an
 * id that doesn't exist, gets the same 404, so a file's address tells an
 * outsider nothing. See `workspace/docs/task-chat.md`, "Files".
 *
 * Everything downloads as an attachment. With `?view=1`, a PNG, JPEG, GIF or
 * WebP picture is shown in the page instead, for the Files card's small
 * pictures; any other type ignores `view`.
 */
export const Route = createFileRoute("/api/project/task-files/$fileId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const user = await findCurrentUser()
        if (!user) {
          return Response.json({ detail: "Sign in to download this file." }, { status: 401 })
        }
        const file = await loadTaskFileForDownload(user.id, params.fileId)
        if (!file) {
          return Response.json(
            { detail: "That file doesn't exist or you can't see it." },
            { status: 404 }
          )
        }
        const shown =
          new URL(request.url).searchParams.get("view") === "1" && isShownPicture(file.mimeType)
        try {
          const object = await getFromR2(file.storagePath)
          if (!object.Body) {
            return Response.json({ detail: "The file could not be read." }, { status: 502 })
          }
          const headers = new Headers({
            "Content-Type": shown ? file.mimeType : "application/octet-stream",
            "Content-Disposition": contentDisposition(shown ? "inline" : "attachment", file.name),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          })
          if (object.ContentLength !== undefined) {
            headers.set("Content-Length", object.ContentLength.toString())
          }
          return new Response(toBodyInit(object.Body), { headers })
        } catch {
          return Response.json({ detail: "The file could not be read." }, { status: 502 })
        }
      },
    },
  },
})

/**
 * The name twice: a plain one any browser reads, with quotes and anything
 * outside printable ASCII replaced, and the exact name for browsers that read
 * `filename*`.
 */
function contentDisposition(kind: "inline" | "attachment", filename: string) {
  const plain = filename.replace(/[^\x20-\x7e]|["\\]/g, "_")
  return `${kind}; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(filename)}`
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
