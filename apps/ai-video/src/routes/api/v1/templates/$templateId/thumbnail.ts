import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { streamPrivateR2Object } from "@/server/r2-response"
import { aiVideoTemplates } from "@/server/schema"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute("/api/v1/templates/$templateId/thumbnail")(
  {
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

          const [template] = await db
            .select()
            .from(aiVideoTemplates)
            .where(
              and(
                eq(aiVideoTemplates.id, params.templateId),
                eq(aiVideoTemplates.userId, user.id)
              )
            )
            .limit(1)

          if (!template?.thumbnailStoragePath) {
            return Response.json(
              { detail: "Thumbnail not found" },
              { status: 404 }
            )
          }

          return streamPrivateR2Object({
            storagePath: template.thumbnailStoragePath,
            contentType: "image/jpeg",
            range: request.headers.get("Range"),
            cacheControl: "private, max-age=3600",
          })
        },
      },
    },
  }
)
