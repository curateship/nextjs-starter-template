import { createServerFn } from "@tanstack/react-start"
import { desc, eq, isNull, or } from "drizzle-orm"

import { db } from "@/server/db"
import { mediaAssets } from "@/server/schema"
import { requireUser } from "@/server/security"

const listMediaFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return db.select().from(mediaAssets).where(or(eq(mediaAssets.ownerUserId, user.id), isNull(mediaAssets.ownerUserId))).orderBy(desc(mediaAssets.createdAt)).limit(100)
})

export const listMedia = () => listMediaFn()
