import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { getEntitlements } from "@/server/entitlements"
import { reserveGenerationCredit, settleGenerationCredit } from "@/server/generation"
import { requireAppOrigin } from "@/server/origin"
import { enqueueGeneration } from "@/server/queue"
import { mediaAssets, subscriptions } from "@/server/schema"
import { requireUser } from "@/server/security"

const generationSchema = z.object({ kind: z.enum(["background", "soundscape"]), prompt: z.string().trim().min(5).max(500) })

const requestGenerationFn = createServerFn({ method: "POST" }).inputValidator(generationSchema).handler(async ({ data }) => {
  requireAppOrigin()
  if (process.env.POMODER_AI_ENABLED !== "true") throw new Error("AI_DISABLED")
  const user = await requireUser()
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1)
  if (getEntitlements(subscription || null).plan !== "pro") throw new Error("PRO_REQUIRED")
  const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-01`
  await reserveGenerationCredit(user.id, data.kind, month)
  const [asset] = await db.insert(mediaAssets).values({ ownerUserId: user.id, kind: data.kind === "background" ? "video" : "audio", source: "ai", status: "queued", name: data.prompt.slice(0, 60), storageKey: `pending/${crypto.randomUUID()}`, mimeType: data.kind === "background" ? "video/mp4" : "audio/mpeg", prompt: data.prompt, provider: data.kind === "background" ? "gemini" : "elevenlabs", premium: true }).returning()
  try { await enqueueGeneration({ assetId: asset.id, userId: user.id, kind: data.kind, prompt: data.prompt, month }) } catch (error) { await db.update(mediaAssets).set({ status: "failed", errorCode: "QUEUE_FAILED", updatedAt: new Date() }).where(eq(mediaAssets.id, asset.id)); await settleGenerationCredit(user.id, data.kind, false, month); throw error }
  return asset
})

export const requestGeneration = (kind: "background" | "soundscape", prompt: string) => requestGenerationFn({ data: { kind, prompt } })
