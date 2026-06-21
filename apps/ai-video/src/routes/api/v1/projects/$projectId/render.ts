import { createFileRoute } from "@tanstack/react-router"

import { db } from "@/server/db"
import {
  getFromR2,
  R2StorageNotConfiguredError,
  toBodyInit,
} from "@/server/media-storage"
import { aiVideoProjects } from "@/server/schema"
import { findCurrentUser } from "@/server/security"
import { and, eq } from "drizzle-orm"

// Streams a finished export. Downloads remain attachments; ?mode=view serves
// the same file inline with range support for the preview modal. Renders are
// served through the app because the bucket sends immutable cache headers.
export const Route = createFileRoute("/api/v1/projects/$projectId/render")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
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

        if (!project) {
          return Response.json({ detail: "Project not found" }, { status: 404 })
        }
        if (project.renderStatus !== "ready" || !project.renderStoragePath) {
          return Response.json(
            { detail: "No finished export for this project" },
            { status: 404 }
          )
        }

        try {
          const url = new URL(request.url)
          const previewMode = url.searchParams.get("mode") === "view"
          const range = previewMode ? request.headers.get("Range") : null
          const object = await getFromR2(project.renderStoragePath, range)
          if (!object.Body) {
            return Response.json(
              { detail: "Failed to load export" },
              { status: 502 }
            )
          }

          // The UI can pass the current title via ?filename=; otherwise use
          // the saved export title. Sanitized to a safe download filename.
          const requested = url.searchParams.get("filename")
          const baseFilename =
            (requested ?? project.renderTitle ?? project.name)
              .replace(/[^\w. -]+/g, "")
              .trim()
              .replace(/\.mp4$/i, "") || "export"
          const headers = new Headers({
            "Accept-Ranges": "bytes",
            "Content-Type": "video/mp4",
            "Content-Disposition": `${previewMode ? "inline" : "attachment"}; filename="${baseFilename}.mp4"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          })
          if (object.ContentLength !== undefined) {
            headers.set("Content-Length", object.ContentLength.toString())
          }
          if (object.ContentRange) {
            headers.set("Content-Range", object.ContentRange)
          }

          return new Response(toBodyInit(object.Body), {
            status: range && object.ContentRange ? 206 : 200,
            headers,
          })
        } catch (error) {
          if (error instanceof R2StorageNotConfiguredError) {
            return Response.json(
              { detail: "R2 storage is not configured." },
              { status: 503 }
            )
          }
          return Response.json(
            { detail: "Failed to load export" },
            { status: 502 }
          )
        }
      },
    },
  },
})
