import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ElevenLabsVoice, VoiceoverResult } from "@/server/elevenlabs"
import {
  VOICE_MODEL_IDS,
  voiceDefaultsSchema,
  voiceSettingsSchema,
  type VoiceDefaults,
  type VoiceModelId,
  type VoiceSettings,
} from "@/lib/voice-settings"

export type { ElevenLabsVoice, VoiceoverResult }

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : ""
}

export function getVoiceLoadErrorMessage(error: unknown) {
  const message = getErrorMessage(error)
  if (
    message === "ElevenLabs is not configured" ||
    message === "Secret encryption is not configured" ||
    message === "Stored secret could not be decrypted" ||
    message === "Stored secret is not encrypted" ||
    message.startsWith("Voice list failed")
  ) {
    return mapVoiceConfigError(message)
  }
  return "Could not load ElevenLabs voices."
}

export function getVoiceGenerationErrorMessage(error: unknown) {
  const message = getErrorMessage(error)
  // Surface stable, client-safe messages verbatim: the "not configured" hint
  // and provider HTTP failures (which carry a status + reason suffix).
  if (
    message === "API usage limit reached. Try again next month." ||
    message === "ElevenLabs is not configured" ||
    message === "Secret encryption is not configured" ||
    message === "Stored secret could not be decrypted" ||
    message === "Stored secret is not encrypted" ||
    message.startsWith("Voiceover generation failed")
  ) {
    return mapVoiceConfigError(message)
  }
  return "Could not generate the voiceover."
}

function mapVoiceConfigError(message: string) {
  if (message === "Secret encryption is not configured") {
    return "AI provider key storage is not configured."
  }
  if (message === "Stored secret could not be decrypted") {
    return "Saved ElevenLabs API key could not be decrypted."
  }
  if (message === "Stored secret is not encrypted") {
    return "Saved ElevenLabs API key must be re-saved."
  }
  return message
}

const listVoicesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    voices: ElevenLabsVoice[]
    defaults: VoiceDefaults | null
  }> => {
    const { listVoicesForCurrentUser } = await import("@/server/elevenlabs")
    return listVoicesForCurrentUser()
  }
)

const generateVoiceoverFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      // Letters/digits only — the id lands in the ElevenLabs URL path, so
      // this blocks path/query injection against the API key's account.
      voiceId: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
      text: z.string().min(1).max(5000),
      modelId: z.enum(VOICE_MODEL_IDS),
      voiceSettings: voiceSettingsSchema.optional(),
    })
  )
  .handler(async ({ data }): Promise<VoiceoverResult> => {
    const { generateVoiceoverForCurrentUser } = await import(
      "@/server/elevenlabs"
    )
    return generateVoiceoverForCurrentUser(
      data.voiceId,
      data.text,
      data.modelId,
      data.voiceSettings
    )
  })

const saveVoiceDefaultsFn = createServerFn({ method: "POST" })
  .inputValidator(voiceDefaultsSchema)
  .handler(async ({ data }): Promise<void> => {
    const { saveVoiceDefaultsForCurrentUser } = await import(
      "@/server/elevenlabs"
    )
    return saveVoiceDefaultsForCurrentUser(data)
  })

export function listElevenLabsVoices() {
  return listVoicesFn()
}

export function generateVoiceover(input: {
  voiceId: string
  text: string
  modelId: VoiceModelId
  voiceSettings?: VoiceSettings
}) {
  return generateVoiceoverFn({ data: input })
}

export function saveVoiceDefaults(defaults: VoiceDefaults) {
  return saveVoiceDefaultsFn({ data: defaults })
}
