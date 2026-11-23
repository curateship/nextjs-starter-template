import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { getFromR2, R2StorageNotConfiguredError } from "@/server/media/storage"
import { noteVideoFile } from "@/server/note/library/files"

/**
 * Download video, from a note's ⋮ menu (Tyler's task 02, part 6). The saved
 * file is sent as a download named after the note. A plain link to the file
 * would not do: it lives on the bucket's own address, and a browser ignores
 * "download" on a link to another address and plays it instead.
 */
export const Route = createFileRoute("/api/v1/note/$noteId/video")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await findCurrentUser()
        if (!user) return Response.json({ detail: "Sign in first" }, { status: 401 })
        const file = await noteVideoFile(user.id, params.noteId)
        if (!file) return Response.json({ detail: "Video not found" }, { status: 404 })
        try {
          const object = await getFromR2(file.storagePath)
          const body = object.Body as { transformToWebStream?: () => ReadableStream } | undefined
          if (!body?.transformToWebStream) return Response.json({ detail: "Failed to load the video" }, { status: 502 })
          const headers = new Headers({
            "Cache-Control": "private, no-store",
            "Content-Type": object.ContentType || file.mimeType,
            // The plain name for old browsers, the exact one for the rest.
            "Content-Disposition": `attachment; filename="${file.fileName.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
            "X-Content-Type-Options": "nosniff",
          })
          if (object.ContentLength !== undefined) headers.set("Content-Length", object.ContentLength.toString())
          return new Response(body.transformToWebStream(), { status: 200, headers })
        } catch (error) {
          if (error instanceof R2StorageNotConfiguredError) {
            return Response.json({ detail: "File storage is not set up." }, { status: 503 })
          }
          return Response.json({ detail: "Failed to load the video" }, { status: 502 })
        }
      },
    },
  },
})
