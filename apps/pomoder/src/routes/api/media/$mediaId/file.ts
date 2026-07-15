import { createFileRoute } from "@tanstack/react-router"

import { getMediaObject, getViewableMedia } from "@/server/pomoder-media"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute("/api/media/$mediaId/file")({
  server: { handlers: { GET: async ({ params, request }) => {
    const user = await findCurrentUser()
    if (!user) return Response.json({ error: { code: "AUTH_REQUIRED", message: "Authentication required" } }, { status: 401 })
    try {
      const asset = await getViewableMedia(user.id, params.mediaId)
      const object = await getMediaObject(asset.storageKey, request.headers.get("range"))
      if (!object.Body) throw new Error("MEDIA_NOT_FOUND")
      const headers = new Headers({ "Content-Type": asset.mimeType, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=31536000, immutable" })
      if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength))
      if (object.ContentRange) headers.set("Content-Range", object.ContentRange)
      return new Response(object.Body.transformToWebStream(), { status: object.ContentRange ? 206 : 200, headers })
    } catch { return Response.json({ error: { code: "MEDIA_NOT_FOUND", message: "Media not found" } }, { status: 404 }) }
  } } },
})
