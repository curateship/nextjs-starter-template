import { and, desc, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media-storage"
import {
  aiVideoActors,
  aiVideoMedia,
  type AiVideoActor,
  type AiVideoMedia,
} from "@/server/schema"
import type { ActorStatus } from "@/lib/actor-models"

export type ActorItem = {
  id: string
  name: string
  prompt: string
  status: ActorStatus
  model: string
  tags: string[]
  image_url: string
  image_mime_type: string
  reference_media_id: string | null
  reference_media_url: string | null
  created_at: string
  updated_at: string
}

export type ActorListResponse = {
  actors: ActorItem[]
}

export async function listOwnedActors(
  userId: string
): Promise<ActorListResponse> {
  const rows = await db
    .select({
      actor: aiVideoActors,
      referenceMedia: aiVideoMedia,
    })
    .from(aiVideoActors)
    .leftJoin(aiVideoMedia, eq(aiVideoActors.referenceMediaId, aiVideoMedia.id))
    .where(eq(aiVideoActors.userId, userId))
    .orderBy(desc(aiVideoActors.createdAt))

  return {
    actors: rows.map((row) =>
      serializeActor(row.actor, row.referenceMedia ?? null)
    ),
  }
}

export async function getOwnedActor(userId: string, actorId: string) {
  const [row] = await db
    .select()
    .from(aiVideoActors)
    .where(and(eq(aiVideoActors.id, actorId), eq(aiVideoActors.userId, userId)))
    .limit(1)

  if (!row) {
    throw new Error("Actor not found")
  }

  return row
}

export function normalizeActorTags(value: string) {
  const seen = new Set<string>()
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false
      seen.add(tag)
      return true
    })
}

export function cleanActorName(value: string) {
  const name = value.trim()
  if (!name) {
    throw new Error("Actor name is required")
  }
  return name.slice(0, 255)
}

export function cleanActorPrompt(value: string) {
  const prompt = value.trim()
  if (!prompt) {
    throw new Error("Prompt is required")
  }
  return prompt.slice(0, 5000)
}

export function serializeActor(
  row: AiVideoActor,
  referenceMedia?: AiVideoMedia | null
): ActorItem {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    status: row.status as ActorStatus,
    model: row.model,
    tags: parseActorTags(row.tags),
    image_url: getPublicMediaUrl(row.imageStoragePath),
    image_mime_type: row.imageMimeType,
    reference_media_id: row.referenceMediaId,
    reference_media_url: referenceMedia
      ? getPublicMediaUrl(referenceMedia.storagePath)
      : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function parseActorTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((tag): tag is string => typeof tag === "string")
}
