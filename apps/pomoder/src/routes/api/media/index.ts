import { createFileRoute } from "@tanstack/react-router"

import {
  uploadUserMedia,
  validateUploadContentLength,
} from "@/server/pomoder-media"
import { requireAppOrigin } from "@/server/origin"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute("/api/media/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          requireAppOrigin()
        } catch {
          return apiError("INVALID_ORIGIN", "Invalid request origin", 403)
        }
        const user = await findCurrentUser()
        if (!user)
          return apiError("AUTH_REQUIRED", "Authentication required", 401)
        try {
          validateUploadContentLength(request.headers.get("content-length"))
        } catch (error) {
          const code =
            error instanceof Error ? error.message : "INVALID_CONTENT_LENGTH"
          const status =
            code === "FILE_TOO_LARGE"
              ? 413
              : code === "CONTENT_LENGTH_REQUIRED"
                ? 411
                : 400
          return apiError(
            code,
            code === "FILE_TOO_LARGE"
              ? "File is too large"
              : "Invalid upload length",
            status
          )
        }
        let form
        try {
          form = await request.formData()
        } catch {
          return apiError("INVALID_FORM", "Invalid upload", 400)
        }
        const file = form.get("file")
        const name = String(form.get("name") || "")
        if (!(file instanceof File))
          return apiError("FILE_REQUIRED", "Choose a file", 422)
        try {
          return Response.json(
            { data: await uploadUserMedia(user.id, file, name) },
            { status: 201 }
          )
        } catch (error) {
          const code = error instanceof Error ? error.message : "UPLOAD_FAILED"
          const status =
            code === "PRO_REQUIRED"
              ? 403
              : code === "STORAGE_QUOTA_EXCEEDED"
                ? 409
                : code === "FILE_TOO_LARGE"
                  ? 413
                  : 422
          return apiError(code, "The upload could not be accepted", status)
        }
      },
    },
  },
})

function apiError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status })
}
