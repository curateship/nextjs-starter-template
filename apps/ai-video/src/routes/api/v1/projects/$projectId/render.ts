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

// Streams a finished export as a download. Renders are served through the app
// (not the public R2 URL) because the bucket sends immutable cache headers —
// a re-export at the same key would otherwise serve stale from the CDN.
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
          const object = await getFromR2(project.renderStoragePath)
          if (!object.Body) {
            return Response.json(
              { detail: "Failed to load export" },
              { status: 502 }
            )
          }

          // The editor passes the user's chosen name via ?filename=; fall
          // back to the project name. Sanitized to a safe download filename.
          const requested = new URL(request.url).searchParams.get("filename")
          const filename =
            (requested ?? project.name).replace(/[^\w. -]+/g, "").trim() ||
            "export"
          const headers = new Headers({
            "Content-Type": "video/mp4",
            "Content-Disposition": `attachment; filename="${filename}.mp4"`,
            "Cache-Control": "private, no-store",
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
            { detail: "Failed to load export" },
            { status: 502 }
          )
        }
      },
    },
  },
})
