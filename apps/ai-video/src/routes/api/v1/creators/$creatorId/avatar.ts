import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { streamPrivateR2Object } from "@/server/r2-response"
import { aiVideoCreators } from "@/server/schema"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute("/api/v1/creators/$creatorId/avatar")({
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

        const [creator] = await db
          .select()
          .from(aiVideoCreators)
          .where(
            and(
              eq(aiVideoCreators.id, params.creatorId),
              eq(aiVideoCreators.userId, user.id)
            )
          )
          .limit(1)

        if (!creator?.avatarStoragePath) {
          return Response.json({ detail: "Avatar not found" }, { status: 404 })
        }

        return streamPrivateR2Object({
          storagePath: creator.avatarStoragePath,
          contentType: "image/jpeg",
          range: request.headers.get("Range"),
          cacheControl: "private, max-age=3600",
        })
      },
    },
  },
})
