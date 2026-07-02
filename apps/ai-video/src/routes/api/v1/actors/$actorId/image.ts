import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { streamPrivateR2Object } from "@/server/r2-response"
import { aiVideoActors } from "@/server/schema"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute("/api/v1/actors/$actorId/image")({
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

        const [actor] = await db
          .select()
          .from(aiVideoActors)
          .where(
            and(
              eq(aiVideoActors.id, params.actorId),
              eq(aiVideoActors.userId, user.id)
            )
          )
          .limit(1)

        if (!actor) {
          return Response.json({ detail: "Actor not found" }, { status: 404 })
        }

        return streamPrivateR2Object({
          storagePath: actor.imageStoragePath,
          contentType: actor.imageMimeType,
          range: request.headers.get("Range"),
          cacheControl: "private, max-age=3600",
        })
      },
    },
  },
})
