import { createServerFn } from "@tanstack/react-start"

import { aiGenerationShown } from "@/server/pomodoro/app-settings"

/**
 * Whether members see AI backgrounds and soundscapes: the admin's switch in
 * Settings → AI generation. Open to anyone, because `/plans` is drawn for
 * guests too. See `workspace/docs/ai-generation.md`.
 */
const readAiGenerationFn = createServerFn({ method: "GET" }).handler(async () => ({
  shown: await aiGenerationShown(),
}))

export const readAiGeneration = () => readAiGenerationFn()
