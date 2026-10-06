import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  createVoice,
  deleteVoices,
  listVoices,
  updateVoice,
  type VoiceView,
} from "@/server/social/voices"

import { createErrorMessage } from "../error-message"

export type { VoiceView }

/**
 * The Voices dashboard's endpoints. Every one is admin-only and scoped to the
 * signed-in person.
 */

export const getVoiceErrorMessage = createErrorMessage(
  {
    "needs a name": "Give the voice a name first.",
    "does not exist": "That voice is not there any more. Refresh the list.",
  },
  "That did not work. Please try again."
)

const voiceInput = z.object({
  name: z.string().max(120),
  voice: z.string().max(4_000).default(""),
  product: z.string().max(4_000).default(""),
  commentRules: z.string().max(4_000).default(""),
})

export type VoiceFormInput = z.input<typeof voiceInput>

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<VoiceView[]> => listVoices(context.user.id))

export function loadVoices() {
  return listFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).nullable(), voice: voiceInput }))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    if (data.id) {
      await updateVoice(context.user.id, data.id, data.voice)
      return { id: data.id }
    }
    return { id: await createVoice(context.user.id, data.voice) }
  })

export function saveVoice(id: string | null, voice: VoiceFormInput) {
  return saveFn({ data: { id, voice } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }))
  .handler(async ({ context, data }) => deleteVoices(context.user.id, data.ids))

export function removeVoices(ids: string[]) {
  return deleteFn({ data: { ids } })
}
