import { and, eq, gte, lt, sql } from "drizzle-orm"

import { ACTOR_MODEL, type ActorPayload } from "@/lib/actor-models"
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
import { getOwnedMedia } from "@/server/media"
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
    return serializeActor(created, referenceMedia)
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
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
        name: cleanActorName(data.name),
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

async function resolveReferenceMedia(userId: string, mediaId?: string | null) {
  if (!mediaId) return null
  const media = await getOwnedMedia(userId, mediaId)
  if (media.fileType !== "image") {
    throw new Error("Reference media must be an image")
  }
  return media
}

async function generateActorImage(
  prompt: string,
  model: string,
  referenceMedia: Awaited<ReturnType<typeof resolveReferenceMedia>>
) {
  if (model !== ACTOR_MODEL) {
    throw new Error("Unsupported actor model")
  }

  const apiKey = process.env.AI_VIDEO_GEMINI_API_KEY
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
    throw new Error("Image generation failed")
  }

  const payload = (await response.json()) as GeminiGenerateResponse
  const generated = findGeneratedImage(payload)
  if (!generated) {
    throw new Error("Image generation did not return an image")
  }

  const mimeType = generated.mimeType || "image/png"
  if (!ACTOR_GENERATION_MIME_TYPES.has(mimeType)) {
    throw new Error("Image generation returned an invalid file type")
  }

  if (
    Math.floor((generated.data.length * 3) / 4) >
    ACTOR_GENERATION_MAX_BYTES
  ) {
    throw new Error("Image generation returned an image that is too large")
  }

  const bytes = Buffer.from(generated.data, "base64")
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
