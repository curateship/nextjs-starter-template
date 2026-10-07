/**
 * What AI generation offers, in one browser-safe file: the two kinds, the
 * prompts suggested under the box, and the wording the panel uses. The server
 * reads the same limits, so the number a member is shown is the number they
 * get.
 */

export type GenerationKind = "background" | "soundscape"

/** The shortest and longest prompt, matched by the box and by the validator. */
export const PROMPT_MIN_LENGTH = 5
export const PROMPT_MAX_LENGTH = 500

/**
 * Which picker each kind belongs in. A generated background becomes an upload
 * of purpose "background", so it lands in the same grid as one the member
 * uploaded and every screen after this point treats the two the same.
 */
export const GENERATION_PURPOSE = {
  background: "background",
  soundscape: "sound",
} as const

/**
 * What each kind is made with, and how long it is. The provider requests read
 * this, and so does the spend meter (`src/server/pomodoro/generation-spend.ts`),
 * so the seconds that are priced are always the seconds that were asked for.
 * Both models are priced per second in the shell's list,
 * `src/lib/ai/ai-models.ts`.
 */
export const GENERATION_MODELS = {
  background: {
    provider: "gemini",
    model: "veo-3.1-lite-generate-preview",
    seconds: 8,
  },
  soundscape: {
    provider: "elevenlabs",
    model: "eleven_text_to_sound_v2",
    seconds: 30,
  },
} as const

export const GENERATION_COPY: Record<
  GenerationKind,
  {
    title: string
    description: string
    placeholder: string
    suggestions: readonly string[]
    /** Said to a member when no provider is set up. Operator wording lives in admin. */
    notSwitchedOn: string
  }
> = {
  background: {
    title: "Generate your own",
    description:
      "Describe a scene and I'll make an animated background for you. It sits behind every screen.",
    placeholder: "A cozy cabin desk at dawn, snow falling outside the window…",
    suggestions: [
      "Tokyo street in the rain at night",
      "Sunlit library with dust motes",
      "Spaceship window over Earth",
    ],
    notSwitchedOn: "AI backgrounds are not switched on yet.",
  },
  soundscape: {
    title: "Generate your own",
    description:
      "Describe a soundscape and I'll mix an ambient loop for you. It plays and pauses with the timer like the rest.",
    placeholder: "Distant thunder with a crackling fire and soft wind…",
    suggestions: [
      "Rain on a tent in the mountains",
      "Quiet café with jazz in the background",
      "Ocean waves at midnight",
    ],
    notSwitchedOn: "AI soundscapes are not switched on yet.",
  },
}

/** "3 of 5 left this month", or the honest version when there are none. */
export function describeCreditsLeft(left: number, limit: number) {
  if (limit === 0) return "AI generation is a Pro perk."
  if (left <= 0) return `None left this month. You get ${limit} on the first.`
  // A counter in the card's corner, not a sentence, so no full stop.
  return `${left} of ${limit} left this month`
}
