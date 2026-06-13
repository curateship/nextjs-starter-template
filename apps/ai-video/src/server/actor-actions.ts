import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"

import { actorModelProvider, type ActorPayload } from "@/lib/actor-models"
import {
  cleanActorName,
  cleanActorPrompt,
  getOwnedActor,
  listOwnedActors,
  normalizeActorTags,
  serializeActor,
  type ActorItem,
  type ActorListResponse,
} from "@/server/actors"
import { db } from "@/server/db"
import { getLlmKey } from "@/server/llm-keys"
import { getOwnedMedia, saveGeneratedImageToLibrary } from "@/server/media"
import {
  bodyToBytes,
  deleteFromR2,
  getFromR2,
  R2StorageNotConfiguredError,
  uploadToR2,
} from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoActorGenerationEvents, aiVideoActors } from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import { safeBody } from "@/server/video-analysis"

const ACTOR_GENERATION_LIMIT = 10
const ACTOR_GENERATION_WINDOW_MS = 60 * 60 * 1000
const ACTOR_GENERATION_MAX_BYTES = 10 * 1024 * 1024
const ACTOR_GENERATION_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
])

export async function listActorsForCurrentUser(): Promise<ActorListResponse> {
  const user = await requireUser()
  return listOwnedActors(user.id)
}

export async function createActorForCurrentUser(
  data: ActorPayload
): Promise<ActorItem> {
  requireAppOrigin()
  const user = await requireUser()
  const referenceMedia = await resolveReferenceMedia(
    user.id,
    data.referenceMediaId
  )
  const name = cleanActorName(data.name)
  const prompt = cleanActorPrompt(data.prompt)
  const tags = normalizeActorTags(data.tags)
  const actorId = uuid()
  await enforceActorGenerationRateLimit(user.id)
  const image = await generateActorImage(prompt, data.model, referenceMedia)
  const storagePath = actorImageStoragePath(user.id, actorId, image.mimeType)

  try {
    await uploadToR2(storagePath, image.bytes, image.mimeType)
  } catch (error) {
    if (error instanceof R2StorageNotConfiguredError) {
      throw new Error("Actor image storage is not configured")
    }
    throw new Error("Actor image upload failed")
  }

  const createdAt = now()
  const row = {
    id: actorId,
    userId: user.id,
    name,
    prompt,
    status: data.status,
    model: data.model,
    tags,
    referenceMediaId: referenceMedia?.id ?? null,
    imageStoragePath: storagePath,
    imageMimeType: image.mimeType,
    imageFileSize: image.bytes.byteLength,
    createdAt,
    updatedAt: createdAt,
  }

  try {
    const [created] = await db.insert(aiVideoActors).values(row).returning()
    if (!created) {
      throw new Error("Actor was not created")
    }
    // Also drop the generated headshot into the media library as an independent
    // asset (best-effort: a library failure must not lose the created actor).
    await saveActorImageToLibrary(user.id, name, image)
    return serializeActor(created, referenceMedia)
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }
}

// Saves a copy of a freshly generated actor headshot to the media library so it
// shows up there as a standalone image. Best-effort and self-contained: it
// swallows/logs its own failure so the actor create/regenerate it follows can
// still succeed (the library copy is decoupled from the actor).
async function saveActorImageToLibrary(
  userId: string,
  actorName: string,
  image: { bytes: Buffer; mimeType: string }
) {
  try {
    await saveGeneratedImageToLibrary(
      userId,
      image.bytes,
      image.mimeType,
      `${actorName}.${extensionForMimeType(image.mimeType)}`
    )
  } catch (error) {
    console.error("Actor image library copy failed", error)
  }
}

export async function updateActorForCurrentUser(
  actorId: string,
  data: ActorPayload
): Promise<ActorItem> {
  requireAppOrigin()
  const user = await requireUser()
  await getOwnedActor(user.id, actorId)
  const referenceMedia = await resolveReferenceMedia(
    user.id,
    data.referenceMediaId
  )

  const [row] = await db
    .update(aiVideoActors)
    .set({
      name: cleanActorName(data.name),
      prompt: cleanActorPrompt(data.prompt),
      status: data.status,
      model: data.model,
      tags: normalizeActorTags(data.tags),
      referenceMediaId: referenceMedia?.id ?? null,
      updatedAt: now(),
    })
    .where(and(eq(aiVideoActors.id, actorId), eq(aiVideoActors.userId, user.id)))
    .returning()

  if (!row) {
    throw new Error("Actor not found")
  }

  return serializeActor(row, referenceMedia)
}

export async function regenerateActorForCurrentUser(
  actorId: string,
  data: ActorPayload
): Promise<ActorItem> {
  requireAppOrigin()
  const user = await requireUser()
  const actor = await getOwnedActor(user.id, actorId)
  const referenceMedia = await resolveReferenceMedia(
    user.id,
    data.referenceMediaId
  )
  const name = cleanActorName(data.name)
  const prompt = cleanActorPrompt(data.prompt)
  await enforceActorGenerationRateLimit(user.id)
  const image = await generateActorImage(prompt, data.model, referenceMedia)
  const storagePath = actorImageStoragePath(user.id, actor.id, image.mimeType)

  try {
    await uploadToR2(storagePath, image.bytes, image.mimeType)
  } catch (error) {
    if (error instanceof R2StorageNotConfiguredError) {
      throw new Error("Actor image storage is not configured")
    }
    throw new Error("Actor image upload failed")
  }

  let updatedActor: Awaited<ReturnType<typeof getOwnedActor>> | null = null
  try {
    const [row] = await db
      .update(aiVideoActors)
      .set({
        name,
        prompt,
        status: data.status,
        model: data.model,
        tags: normalizeActorTags(data.tags),
        referenceMediaId: referenceMedia?.id ?? null,
        imageStoragePath: storagePath,
        imageMimeType: image.mimeType,
        imageFileSize: image.bytes.byteLength,
        updatedAt: now(),
      })
      .where(
        and(eq(aiVideoActors.id, actor.id), eq(aiVideoActors.userId, user.id))
      )
      .returning()

    if (!row) {
      throw new Error("Actor not found")
    }

    updatedActor = row
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }

  await deleteFromR2(actor.imageStoragePath)
  if (!updatedActor) {
    throw new Error("Actor not found")
  }
  // Save the regenerated headshot to the library too (independent copy).
  await saveActorImageToLibrary(user.id, name, image)
  return serializeActor(updatedActor, referenceMedia)
}

export async function deleteActorForCurrentUser(actorId: string) {
  requireAppOrigin()
  const user = await requireUser()
  const actor = await getOwnedActor(user.id, actorId)

  await deleteFromR2(actor.imageStoragePath)
  const [row] = await db
    .delete(aiVideoActors)
    .where(and(eq(aiVideoActors.id, actorId), eq(aiVideoActors.userId, user.id)))
    .returning({ id: aiVideoActors.id })

  if (!row) {
    throw new Error("Actor not found")
  }

  return { actorId: row.id }
}

export async function deleteActorsForCurrentUser(
  actorIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(actorIds))

  // Delete the owned rows, returning each one's stored image path so the R2
  // objects can be cleaned up after (best-effort, like the single delete).
  const rows = await db
    .delete(aiVideoActors)
    .where(
      and(
        eq(aiVideoActors.userId, user.id),
        inArray(aiVideoActors.id, uniqueIds)
      )
    )
    .returning({ imageStoragePath: aiVideoActors.imageStoragePath })

  await Promise.all(
    rows.map((row) => deleteFromR2(row.imageStoragePath).catch(() => undefined))
  )

  return { deletedCount: rows.length }
}

async function resolveReferenceMedia(userId: string, mediaId?: string | null) {
  if (!mediaId) return null
  const media = await getOwnedMedia(userId, mediaId)
  if (media.fileType !== "image") {
    throw new Error("Reference media must be an image")
  }
  return media
}

// Routes to the right provider API for the chosen model. Both paths return
// { bytes, mimeType } ready to upload.
async function generateActorImage(
  prompt: string,
  model: string,
  referenceMedia: Awaited<ReturnType<typeof resolveReferenceMedia>>
) {
  const provider = actorModelProvider(model)
  if (provider === "gemini") {
    return generateGeminiImage(prompt, model, referenceMedia)
  }
  if (provider === "openai") {
    return generateOpenAiImage(prompt, model, referenceMedia)
  }
  throw new Error("Unsupported actor model")
}

async function generateGeminiImage(
  prompt: string,
  model: string,
  referenceMedia: Awaited<ReturnType<typeof resolveReferenceMedia>>
) {
  // Prefer the key saved in Settings → AI Providers, else the env var.
  const apiKey = await getLlmKey("gemini")
  if (!apiKey) {
    throw new Error("Image generation is not configured")
  }

  const parts: unknown[] = [{ text: prompt }]
  if (referenceMedia) {
    const object = await getFromR2(referenceMedia.storagePath)
    const bytes = await bodyToBytes(object.Body)
    parts.push({
      inline_data: {
        mime_type: referenceMedia.mimeType,
        data: Buffer.from(bytes).toString("base64"),
      },
    })
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    }
  )

  if (!response.ok) {
    // Surface the real Gemini rejection (invalid key, no model access, quota)
    // in the logs so failures are diagnosable; the client still sees the safe
    // generic message rather than a raw API error.
    console.error(
      "Gemini actor image failed",
      response.status,
      await safeBody(response)
    )
    throw new Error("Image generation failed")
  }

  const payload = (await response.json()) as GeminiGenerateResponse
  const generated = findGeneratedImage(payload)
  if (!generated) {
    throw new Error("Image generation did not return an image")
  }
  return decodeActorImage(generated.data, generated.mimeType || "image/png")
}

// OpenAI image generation. gpt-image-1 can edit a reference image (the edits
// endpoint); dall-e-3 is text-only and must be told to return base64.
async function generateOpenAiImage(
  prompt: string,
  model: string,
  referenceMedia: Awaited<ReturnType<typeof resolveReferenceMedia>>
) {
  const apiKey = await getLlmKey("openai")
  if (!apiKey) {
    throw new Error("Image generation is not configured")
  }

  // Portrait sizes suit actor headshots; the two models allow different values.
  const size = model === "dall-e-3" ? "1024x1792" : "1024x1536"

  let response: Response
  if (model === "gpt-image-1" && referenceMedia) {
    // Send the reference image alongside the prompt via the edits endpoint.
    const object = await getFromR2(referenceMedia.storagePath)
    const bytes = await bodyToBytes(object.Body)
    const form = new FormData()
    form.append("model", model)
    form.append("prompt", prompt)
    form.append("size", size)
    form.append(
      "image",
      new Blob([Buffer.from(bytes)], { type: referenceMedia.mimeType }),
      `reference.${extensionForMimeType(referenceMedia.mimeType)}`
    )
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } else {
    const body: Record<string, unknown> = { model, prompt, n: 1, size }
    // dall-e-3 returns a URL by default; force base64 like gpt-image-1.
    if (model === "dall-e-3") {
      body.response_format = "b64_json"
    }
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
  }

  if (!response.ok) {
    // Surface the real OpenAI rejection (unverified org, quota, invalid key) in
    // the logs; the client still sees the safe generic message.
    console.error(
      "OpenAI actor image failed",
      response.status,
      await safeBody(response)
    )
    throw new Error("Image generation failed")
  }

  const payload = (await response.json()) as OpenAiImageResponse
  const data = payload.data?.[0]?.b64_json
  if (!data) {
    throw new Error("Image generation did not return an image")
  }
  // OpenAI returns PNG by default for both models.
  return decodeActorImage(data, "image/png")
}

// Validates a base64 image from any provider against the actor image limits and
// decodes it to bytes. Shared by the Gemini and OpenAI paths.
function decodeActorImage(data: string, mimeType: string) {
  if (!ACTOR_GENERATION_MIME_TYPES.has(mimeType)) {
    throw new Error("Image generation returned an invalid file type")
  }
  if (Math.floor((data.length * 3) / 4) > ACTOR_GENERATION_MAX_BYTES) {
    throw new Error("Image generation returned an image that is too large")
  }
  const bytes = Buffer.from(data, "base64")
  if (!bytes.byteLength) {
    throw new Error("Image generation returned an empty image")
  }
  if (bytes.byteLength > ACTOR_GENERATION_MAX_BYTES) {
    throw new Error("Image generation returned an image that is too large")
  }
  return { bytes, mimeType }
}

async function enforceActorGenerationRateLimit(userId: string) {
  const currentTime = now()
  const windowStart = new Date(
    currentTime.getTime() - ACTOR_GENERATION_WINDOW_MS
  )
  const cleanupBefore = new Date(
    currentTime.getTime() - ACTOR_GENERATION_WINDOW_MS * 24
  )

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${userId})::bigint)`
    )

    await tx
      .delete(aiVideoActorGenerationEvents)
      .where(lt(aiVideoActorGenerationEvents.createdAt, cleanupBefore))

    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(aiVideoActorGenerationEvents)
      .where(
        and(
          eq(aiVideoActorGenerationEvents.userId, userId),
          gte(aiVideoActorGenerationEvents.createdAt, windowStart)
        )
      )

    if ((row?.count ?? 0) >= ACTOR_GENERATION_LIMIT) {
      throw new Error("Actor image generation limit reached. Try again later.")
    }

    await tx.insert(aiVideoActorGenerationEvents).values({
      id: uuid(),
      userId,
      createdAt: currentTime,
    })
  })
}

function actorImageStoragePath(
  userId: string,
  actorId: string,
  mimeType: string
) {
  return `actors/${userId}/${actorId}/${uuid()}.${extensionForMimeType(mimeType)}`
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg"
  if (mimeType === "image/webp") return "webp"
  return "png"
}

type OpenAiImageResponse = {
  data?: { b64_json?: string }[]
}

type GeminiGenerateResponse = {
  candidates?: {
    content?: {
      parts?: GeminiPart[]
    }
  }[]
}

type GeminiPart = {
  inlineData?: {
    data?: string
    mimeType?: string
  }
  inline_data?: {
    data?: string
    mime_type?: string
  }
}

function findGeneratedImage(payload: GeminiGenerateResponse) {
  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const image = part.inlineData ?? part.inline_data
      const data = image?.data
      if (data) {
        return {
          data,
          mimeType: image?.mimeType ?? image?.mime_type,
        }
      }
    }
  }
  return null
}
