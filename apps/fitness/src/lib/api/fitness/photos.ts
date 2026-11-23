import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import {
  PHOTO_MAX_BYTES,
  PHOTO_SLOTS,
  createPhotoSession,
  deletePhotoSession,
  listPhotoSessions,
  removePhoto,
  savePhoto,
  updatePhotoSession,
} from "@/server/fitness/photos"
import { preferencesFor } from "@/server/fitness/profile"
import { R2StorageNotConfiguredError } from "@/server/media/storage"

export type { PhotoSession, PhotoSlot } from "@/server/fitness/photos"

const id = z.string().min(1).max(36)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const cm = z.number().min(0).max(400).nullable()

const sessionFields = z.object({
  day,
  bodyweightKg: z.number().min(20).max(400).nullable(),
  chestCm: cm,
  waistCm: cm,
  hipsCm: cm,
  armCm: cm,
  thighCm: cm,
  note: z.string().max(1000),
})

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ personId: id.optional() }))
  .handler(async ({ data, context }) => {
    const personId = data.personId ?? context.user.id
    return {
      personId,
      sessions: await listPhotoSessions(context.user.id, personId),
      preferences: await preferencesFor(personId),
    }
  })

export function loadPhotoSessions(personId?: string) {
  return listFn({ data: { personId } })
}

const sessionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), input: sessionFields }),
      z.object({ action: z.literal("update"), sessionId: id, input: sessionFields.partial() }),
      z.object({ action: z.literal("delete"), sessionId: id }),
      z.object({ action: z.literal("removePhoto"), sessionId: id, slot: z.enum(PHOTO_SLOTS) }),
    ])
  )
  .handler(async ({ data, context }) => {
    const user = context.user.id
    switch (data.action) {
      case "create":
        return createPhotoSession(user, data.input)
      case "update":
        return updatePhotoSession(user, data.sessionId, data.input)
      case "delete":
        await deletePhotoSession(user, data.sessionId)
        return null
      case "removePhoto":
        return removePhoto(user, data.sessionId, data.slot)
    }
  })

export function changePhotoSession(data: Parameters<typeof sessionFn>[0]["data"]) {
  return sessionFn({ data })
}

/** One photo into a slot. Reading it back goes through `/api/fitness/photos/...`, which checks who asks. */
const uploadFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const file = data.get("file")
    if (!(file instanceof File)) throw new Error(FITNESS_ERRORS.photoType)
    return {
      sessionId: id.parse(data.get("sessionId")),
      slot: z.enum(PHOTO_SLOTS).parse(data.get("slot")),
      file,
    }
  })
  .handler(async ({ data, context }) => {
    if (data.file.size > PHOTO_MAX_BYTES) throw new Error(FITNESS_ERRORS.photoTooBig)
    await enforceRateLimit(`fitness-photo:${context.user.id}`, { maxAttempts: 60, windowSeconds: 10 * 60 })
    try {
      return await savePhoto(context.user.id, {
        sessionId: data.sessionId,
        slot: data.slot,
        mimeType: data.file.type,
        data: new Uint8Array(await data.file.arrayBuffer()),
      })
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) throw new Error(FITNESS_ERRORS.storageOff)
      throw error
    }
  })

export function uploadPhoto(sessionId: string, slot: (typeof PHOTO_SLOTS)[number], file: File) {
  const form = new FormData()
  form.append("sessionId", sessionId)
  form.append("slot", slot)
  form.append("file", file)
  return uploadFn({ data: form })
}
