import { createFileRoute } from "@tanstack/react-router"

import { AVATAR_MAX_BYTES } from "@/lib/avatar"
import { removeUserAvatar, saveUserAvatar } from "@/server/avatars"
import { requireAppOrigin } from "@/server/origin"
import { enforceRateLimit } from "@/server/rate-limit"
import { findCurrentUser } from "@/server/security"

// Multipart, so this is a route rather than a server function. The picture is
// already cropped to a square by the browser; everything here re-checks it.
export const Route = createFileRoute("/api/avatar/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authorize()
        if (user instanceof Response) return user
        const declaredLength = Number(request.headers.get("content-length"))
        if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0)
          return apiError("INVALID_CONTENT_LENGTH", "Invalid upload length", 400)
        // The multipart envelope adds a little to the file itself, so allow a
        // small margin over the picture's own limit.
        if (declaredLength > AVATAR_MAX_BYTES + 8 * 1024)
          return apiError("FILE_TOO_LARGE", "That picture is too large", 413)
        try {
          await enforceRateLimit(`avatar-upload:${user.id}`, { maxAttempts: 20, windowSeconds: 3_600 })
        } catch (error) {
          // Only a real limit tells someone to wait; anything else that went
          // wrong here should not send them away for an hour.
          return error instanceof Error && error.message === "RATE_LIMITED"
            ? apiError("RATE_LIMITED", "Too many changes. Try again later.", 429)
            : apiError("AVATAR_UPLOAD_FAILED", "The picture could not be saved", 500)
        }
        let form
        try {
          form = await request.formData()
        } catch {
          return apiError("INVALID_FORM", "Invalid upload", 400)
        }
        const file = form.get("file")
        if (!(file instanceof File)) return apiError("FILE_REQUIRED", "Choose a picture", 422)
        try {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const saved = await saveUserAvatar(user.id, { bytes, mimeType: file.type })
          return Response.json({ data: saved }, { status: 201 })
        } catch (error) {
          const code = error instanceof Error ? error.message : "AVATAR_UPLOAD_FAILED"
          return apiError(
            code,
            "The picture could not be saved",
            code === "FILE_TOO_LARGE" ? 413 : code === "INVALID_FILE_CONTENT" ? 422 : 500
          )
        }
      },
      DELETE: async () => {
        const user = await authorize()
        if (user instanceof Response) return user
        try {
          return Response.json({ data: await removeUserAvatar(user.id) })
        } catch {
          return apiError("AVATAR_REMOVE_FAILED", "The picture could not be removed", 500)
        }
      },
    },
  },
})

async function authorize() {
  try {
    requireAppOrigin()
  } catch {
    return apiError("INVALID_ORIGIN", "Invalid request origin", 403)
  }
  const user = await findCurrentUser()
  return user ?? apiError("AUTH_REQUIRED", "Authentication required", 401)
}

function apiError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status })
}
