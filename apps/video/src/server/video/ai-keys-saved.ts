import type { AiKeysSaved } from "@/lib/video/ai-choices"
import { getAiKey } from "@/server/ai/keys"

/**
 * Which of the studio's AI providers have a key saved right now. Asked fresh
 * every time, so a key removed in Settings stops being used on the next press
 * rather than the next deploy.
 */
export async function getAiKeysSaved(): Promise<AiKeysSaved> {
  const [gemini, openai, anthropic] = await Promise.all([
    getAiKey("gemini"),
    getAiKey("openai"),
    getAiKey("anthropic"),
  ])
  return { gemini: !!gemini, openai: !!openai, anthropic: !!anthropic }
}
