import { and, eq, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { generationUsage } from "@/server/schema"

export type GenerationKind = "background" | "soundscape"
export function generationLimit(kind: GenerationKind) { return kind === "background" ? 5 : 20 }

export async function reserveGenerationCredit(userId: string, kind: GenerationKind, month = currentMonth()) {
  return db.transaction(async (tx) => {
    await tx.insert(generationUsage).values({ userId, month, kind }).onConflictDoNothing()
    const [usage] = await tx.select().from(generationUsage).where(and(eq(generationUsage.userId, userId), eq(generationUsage.month, month), eq(generationUsage.kind, kind))).for("update")
    if (!usage || usage.reserved - usage.refunded >= generationLimit(kind)) throw new Error("GENERATION_LIMIT_REACHED")
    await tx.update(generationUsage).set({ reserved: usage.reserved + 1, updatedAt: new Date() }).where(eq(generationUsage.id, usage.id))
    return generationLimit(kind) - (usage.reserved + 1 - usage.refunded)
  })
}

export async function settleGenerationCredit(userId: string, kind: GenerationKind, success: boolean, month = currentMonth()) {
  await db.update(generationUsage).set(success ? { completed: sql`${generationUsage.completed} + 1`, updatedAt: new Date() } : { refunded: sql`${generationUsage.refunded} + 1`, updatedAt: new Date() }).where(and(eq(generationUsage.userId, userId), eq(generationUsage.month, month), eq(generationUsage.kind, kind)))
}

function currentMonth(timestamp = new Date()) { return `${timestamp.getUTCFullYear()}-${String(timestamp.getUTCMonth() + 1).padStart(2, "0")}-01` }
