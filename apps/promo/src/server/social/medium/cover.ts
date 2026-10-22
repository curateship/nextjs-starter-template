import { and, eq } from "drizzle-orm"

import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { now as clockNow, uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { validateMediaContent, validateMediaFile } from "@/server/media/library"
import { deleteFromR2, getPublicMediaUrl, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { promoMediumArticles } from "./schema"

/**
 * An AI cover picture for an article with none (part 28), made from its
 * title by Google's Gemini picture model and saved to the media library like
 * an upload, so it can be picked again, deleted, or swapped for another.
 *
 * Priced at $0.039 a picture in `src/lib/ai/ai-models.ts`, about 4 cents,
 * and metered through the shell's `runAiCall` under "medium-cover" with the
 * project, so the module's spend line counts it (part 41). The request shape
 * is Google's own, the same one Video's picture maker sends.
 */

const COVER_MODEL = "gemini-2.5-flash-image"

/** Medium shows a story's first picture wide; 16:9 fills its card without cropping much. */
const COVER_ASPECT = "16:9"

type GeminiImageAnswer = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string }
        inline_data?: { data?: string; mime_type?: string }
      }>
    }
  }>
}

/** The words handed to the model for a cover. Exported for the test. */
export function buildCoverPrompt(title: string, subtitle: string): string {
  return [
    `A cover picture for a blog article titled "${title}".`,
    subtitle ? `What it is about: ${subtitle}` : "",
    "A calm editorial photograph or illustration with one clear subject, natural light, and no words, letters, logos or watermarks anywhere in it.",
  ]
    .filter(Boolean)
    .join(" ")
}

/** The picture out of Google's answer, as bytes, or a refusal saying what came back instead. */
export function pictureFromAnswer(payload: GeminiImageAnswer): { bytes: Uint8Array; mimeType: string } {
  const parts = payload.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    const data = part.inlineData?.data ?? part.inline_data?.data
    const mimeType = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png"
    if (data && /^image\/(png|jpeg|webp)$/.test(mimeType)) {
      return { bytes: Uint8Array.from(Buffer.from(data, "base64")), mimeType }
    }
  }
  throw new Error("Google answered, but with no picture in the answer.")
}

/** Makes a cover for one article and sets it. Returns the picture's address. */
export async function makeMediumCover(
  userId: string,
  articleId: string,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const [article] = await db
    .select()
    .from(promoMediumArticles)
    .where(and(eq(promoMediumArticles.id, articleId), eq(promoMediumArticles.userId, userId)))
    .limit(1)
  if (!article) throw new Error("That article is not there any more.")
  if (!article.title.trim()) throw new Refusal("Give the article a title first, so the picture has something to show.")
  if (article.status !== "draft" && article.status !== "failed") throw new Refusal("This article has gone to Medium already.")
  const key = await getAiKey("gemini")
  if (!key) throw new Refusal("Add a Google Gemini key in Settings, under AI provider keys, to make a cover.")

  const picture = await runAiCall(
    {
      userId,
      provider: "gemini",
      model: COVER_MODEL,
      feature: "medium-cover",
      metadata: { projectId: article.projectId, articleId: article.id },
    },
    async () => {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${COVER_MODEL}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildCoverPrompt(article.title, article.subtitle) }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: COVER_ASPECT } },
        }),
        signal: AbortSignal.timeout(90_000),
      })
      if (!response.ok) {
        throw new Error(`Google could not make the cover: status ${response.status}. ${(await response.text()).slice(0, 300)}`.trim())
      }
      return { result: pictureFromAnswer((await response.json()) as GeminiImageAnswer), usage: { inputTokens: 0, outputTokens: 0, units: 1 } }
    }
  )

  validateMediaFile(picture.mimeType, picture.bytes.byteLength)
  validateMediaContent(picture.mimeType, picture.bytes)
  const id = uuid()
  const extension = picture.mimeType === "image/jpeg" ? "jpg" : picture.mimeType === "image/webp" ? "webp" : "png"
  const filename = `${id}.${extension}`
  const storagePath = `${userId}/${filename}`
  await uploadToR2(storagePath, picture.bytes, picture.mimeType)
  const at = clockNow()
  const name = `Medium cover for ${article.title.replace(/[^a-zA-Z0-9 ._-]+/g, "").trim().slice(0, 80) || "article"}`
  try {
    await db.insert(customShellMedia).values({
      id,
      workspaceId: await workspaceIdForRequest(userId),
      userId,
      filename,
      originalName: `${name}.${extension}`,
      altText: article.title.slice(0, 200),
      fileSize: picture.bytes.byteLength,
      mimeType: picture.mimeType,
      fileType: "image",
      storagePath,
      emailProtectedAt: null,
      createdAt: at,
      updatedAt: at,
    })
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }
  const url = await getPublicMediaUrl(storagePath)
  await db.update(promoMediumArticles).set({ coverUrl: url, updatedAt: new Date() }).where(eq(promoMediumArticles.id, article.id))
  return url
}
