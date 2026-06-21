import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import {
  getFromR2,
  R2StorageNotConfiguredError,
  toBodyInit,
} from "@/server/media-storage"
import { aiVideoProjects } from "@/server/schema"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute(
  "/api/v1/projects/$projectId/render-thumbnail"
)({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await findCurrentUser()
        if (!user) {
          return Response.json(
            { detail: "Missing AI Video session" },
            { status: 401 }
          )
        }

        const [project] = await db
          .select()
          .from(aiVideoProjects)
          .where(
            and(
              eq(aiVideoProjects.id, params.projectId),
              eq(aiVideoProjects.userId, user.id)
            )
          )
          .limit(1)

        if (
          !project ||
          project.renderStatus !== "ready" ||
          !project.renderThumbnailStoragePath
        ) {
          return Response.json({ detail: "Thumbnail not found" }, { status: 404 })
        }

        try {
          const object = await getFromR2(project.renderThumbnailStoragePath)
          if (!object.Body) {
            return Response.json(
              { detail: "Failed to load thumbnail" },
              { status: 502 }
            )
          }

          const headers = new Headers({
            "Cache-Control": "private, max-age=3600",
            "Content-Type": object.ContentType || "image/jpeg",
            "X-Content-Type-Options": "nosniff",
          })
          if (object.ContentLength !== undefined) {
            headers.set("Content-Length", object.ContentLength.toString())
          }

          return new Response(toBodyInit(object.Body), { status: 200, headers })
        } catch (error) {
          if (error instanceof R2StorageNotConfiguredError) {
            return Response.json(
              { detail: "R2 storage is not configured." },
              { status: 503 }
            )
          }
          return Response.json(
            { detail: "Failed to load thumbnail" },
            { status: 502 }
          )
        }
      },
    },
  },
})
