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

export const GENERATION_COPY: Record<
  GenerationKind,
  {
    title: string
    description: string
    placeholder: string
    suggestions: readonly string[]
  }
> = {
  background: {
    title: "Generate your own",
    description:
      "Describe a scene and AI will make an animated background for you.",
    placeholder: "A cozy cabin desk at dawn, snow falling outside the window…",
    suggestions: [
      "Tokyo street in the rain at night",
      "Sunlit library with dust motes",
      "Spaceship window over Earth",
    ],
  },
  soundscape: {
    title: "Generate your own",
    description:
      "Describe a soundscape and AI will mix an ambient loop for you.",
    placeholder: "Distant thunder with a crackling fire and soft wind…",
    suggestions: [
      "Rain on a tent in the mountains",
      "Quiet café with jazz in the background",
      "Ocean waves at midnight",
    ],
  },
}

/** "3 of 5 left this month", or the honest version when there are none. */
export function describeCreditsLeft(left: number, limit: number) {
  if (limit === 0) return "AI generation is a Pro perk."
  if (left <= 0) return `None left this month. You get ${limit} on the first.`
  return `${left} of ${limit} left this month.`
}
