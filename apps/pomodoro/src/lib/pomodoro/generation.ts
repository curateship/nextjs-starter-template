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

/**
 * The style pills beside the background prompt (task 06, part 6). The words
 * go inside the prompt frame (`backgroundPrompt` in
 * `src/server/pomodoro/generation-providers.ts`), after the locked camera and
 * no-text rules, so a style can never talk the frame out of them.
 */
export const GENERATION_STYLES = [
  {
    key: "anime",
    label: "Anime",
    words: "Anime style, hand-drawn animation look, soft cel shading.",
  },
  {
    key: "watercolour",
    label: "Watercolour",
    words: "Watercolour painting style, soft washes of colour, paper texture.",
  },
  {
    key: "film",
    label: "Real film",
    words: "Photographic, shot on 35mm film, natural light, gentle grain.",
  },
  {
    key: "pixel",
    label: "Pixel art",
    words: "Pixel art style, 16-bit, crisp pixels, limited palette.",
  },
] as const

export type GenerationStyleKey = (typeof GENERATION_STYLES)[number]["key"]

export const GENERATION_STYLE_KEYS = GENERATION_STYLES.map(
  (style) => style.key
) as [GenerationStyleKey, ...GenerationStyleKey[]]

export function generationStyle(key: string | null | undefined) {
  return GENERATION_STYLES.find((style) => style.key === key) ?? null
}

/**
 * How long one request of each kind typically takes the worker, for the
 * waiting line's "about 4 minutes" (task 06, part 5). A guide, not a promise:
 * a Veo render can run longer.
 */
export const TYPICAL_SECONDS: Record<GenerationKind, number> = {
  background: 120,
  soundscape: 30,
}

/**
 * Where a waiting request stands: "2 ahead of you, about 4 minutes", or "Next
 * in line" when nothing is ahead of it. `seconds` is the typical time of the
 * requests ahead, added up.
 */
export function describeQueuePlace(ahead: number, seconds: number) {
  if (ahead <= 0) return "Next in line"
  const minutes = Math.round(seconds / 60)
  const wait =
    seconds < 60
      ? "under a minute"
      : minutes <= 1
        ? "about a minute"
        : `about ${minutes} minutes`
  return `${ahead} ahead of you, ${wait}`
}

/**
 * How long an AI soundscape comes back (task 06, part 2): the 30 seconds the
 * provider makes, crossfaded into itself until it runs two minutes, so
 * shuffle no longer moves on every 30 seconds. The provider is still asked
 * for 30 seconds, so the cost does not change.
 */
export const SOUNDSCAPE_LOOP_SECONDS = 120

/**
 * "3 of 5 left this month", or the honest version when there are none.
 * Bought credits (task 07) are counted apart, because they do not come back
 * on the first: "None left this month, 5 bought left".
 */
export function describeCreditsLeft(left: number, limit: number, bought = 0) {
  if (limit === 0) return "AI generation is a Pro perk."
  const extra = bought > 0 ? `, ${bought} bought left` : ""
  if (left <= 0)
    return bought > 0
      ? `None left this month${extra}`
      : `None left this month. You get ${limit} on the first.`
  // A counter in the card's corner, not a sentence, so no full stop.
  return `${left} of ${limit} left this month${extra}`
}
