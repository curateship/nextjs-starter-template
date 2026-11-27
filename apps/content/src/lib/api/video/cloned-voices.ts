import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { AI_KEY_MISSING_MESSAGES } from "@/lib/video/ai-providers"
import {
  isVoiceCloneMessage,
  VOICE_CLONE_TOO_OFTEN_MESSAGE,
  VOICE_SAMPLE_MISSING_MESSAGE,
} from "@/lib/video/voice-clone"
import { userGet, userPost } from "@/server/guards"
import {
  deleteClonedVoice,
  listClonedVoices,
  makeClonedVoice,
  type ClonedVoice,
} from "@/server/video/cloned-voices"

export type { ClonedVoice }

/**
 * Voices of your own, in the Voices panel. Each belongs to whoever made it:
 * the list, the delete and every read with one are checked against the
 * signed-in person.
 */

export function getVoiceCloneErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ""
  if (isVoiceCloneMessage(message)) return message
  if (message.includes("RATE_LIMITED")) return VOICE_CLONE_TOO_OFTEN_MESSAGE
  if (AI_KEY_MISSING_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "That did not work. Try again in a moment."
}

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listClonedVoices(context.user.id))

export function loadClonedVoices() {
  return listFn()
}

const makeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const sample = data.get("sample")
    if (!(sample instanceof File)) throw new Error(VOICE_SAMPLE_MISSING_MESSAGE)
    return { name: data.get("name")?.toString() ?? "", sample }
  })
  .handler(async ({ data, context }) => {
    return makeClonedVoice(context.user.id, {
      name: data.name,
      sample: {
        bytes: new Uint8Array(await data.sample.arrayBuffer()),
        type: data.sample.type,
        name: data.sample.name,
      },
    })
  })

/** Send a sample to ElevenLabs and keep the voice it makes. */
export function makeOwnVoice(name: string, sample: File) {
  const form = new FormData()
  form.append("name", name)
  form.append("sample", sample)
  return makeFn({ data: form })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    await deleteClonedVoice(context.user.id, data.id)
  })

/** Delete a voice here and at ElevenLabs. */
export function deleteOwnVoice(id: string) {
  return deleteFn({ data: { id } })
}
