import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { tryVoice } from "@/server/social/ai-tasks"
import { recentFinds } from "@/server/social/keywords"
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
    "no longer saved": "That post is not saved any more. Pick another.",
    "key saved": "Add an AI provider key in Settings before trying a voice.",
    AI_LIMIT_REACHED: "This month's AI allowance is used up.",
  },
  "That did not work. Please try again."
)

const voiceInput = z.object({
  name: z.string().max(120),
  voice: z.string().max(4_000).default(""),
  commentRules: z.string().max(4_000).default(""),
})

export type VoiceFormInput = z.input<typeof voiceInput>

const tryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      voiceId: z.string().min(1),
      findId: z.string().min(1),
      voice: z.string().max(4_000).optional(),
      commentRules: z.string().max(4_000).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<string[]> => tryVoice(context.user.id, data))

const postsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => recentFinds(context.user.id))

/** The newest posts found, to try a voice out on. */
export function loadTryPosts() {
  return postsFn()
}

/**
 * Two drafts in this voice for a post already found, with the words in the
 * window even before they are saved. Nothing is stored or sent.
 */
export function tryVoiceOn(data: { voiceId: string; findId: string; voice?: string; commentRules?: string }) {
  return tryFn({ data })
}

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
