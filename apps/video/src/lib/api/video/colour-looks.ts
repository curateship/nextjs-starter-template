import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  COLOUR_LOOK_NAME_MAX,
  COLOUR_LOOK_NAME_MESSAGE,
  COLOUR_LOOKS_FULL_MESSAGE,
  type SavedColourLook,
} from "@/lib/video/colour-looks"
import { FILM_LOOK_IDS } from "@/lib/video/film-looks"
import { userGet, userPost } from "@/server/guards"
import { deleteColourLook, listColourLooks, saveColourLook } from "@/server/video/colour-looks"

/** A person's own colour looks (colour-looks.md), kept per person. */

const KNOWN_MESSAGES = new Set([COLOUR_LOOK_NAME_MESSAGE, COLOUR_LOOKS_FULL_MESSAGE])

export function getColourLookErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "Your looks could not be changed."
}

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => listColourLooks(context.user.id))

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      name: z.string().max(COLOUR_LOOK_NAME_MAX * 2),
      look: z.enum(FILM_LOOK_IDS).nullable(),
      brightness: z.number().finite(),
      contrast: z.number().finite(),
      saturation: z.number().finite(),
    })
  )
  .handler(({ data, context }) => saveColourLook(context.user.id, data))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(({ data, context }) => deleteColourLook(context.user.id, data.id))

export function loadColourLooks(): Promise<SavedColourLook[]> {
  return listFn()
}

export function saveOwnColourLook(look: Omit<SavedColourLook, "id">): Promise<SavedColourLook> {
  return saveFn({ data: look })
}

export function deleteOwnColourLook(id: string) {
  return deleteFn({ data: { id } })
}
