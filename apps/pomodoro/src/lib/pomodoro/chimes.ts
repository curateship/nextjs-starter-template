/**
 * The completion chimes, picked separately for a focus ending and a break
 * ending. See `workspace/docs/completion-chimes.md`.
 *
 * Every chime is drawn by the browser from a few tones, the way the original
 * two-tone chime always was, so there is no file to fetch and nothing that
 * can fail to load at the moment it matters. Browser-safe: no server imports.
 */

/** One tone: when it starts after the chime does, its pitch, and its length. */
export type ChimeTone = {
  offset: number
  frequency: number
  /** Seconds the tone takes to fade out. */
  decay: number
  wave: OscillatorType
  /** Peak loudness, 0 to 1. Kept low: a chime is a tap on the shoulder. */
  gain: number
}

export const CHIMES = [
  {
    id: "two-tone",
    label: "Two-tone",
    hint: "The original: two clear notes going up.",
    tones: [
      { offset: 0, frequency: 659.26, decay: 0.9, wave: "sine", gain: 0.22 },
      { offset: 0.22, frequency: 987.77, decay: 0.9, wave: "sine", gain: 0.22 },
    ],
  },
  {
    id: "soft-gong",
    label: "Soft gong",
    hint: "One low, long note with a quiet shimmer over it.",
    tones: [
      { offset: 0, frequency: 196, decay: 2.6, wave: "sine", gain: 0.3 },
      { offset: 0, frequency: 392.5, decay: 1.8, wave: "sine", gain: 0.08 },
      { offset: 0, frequency: 588, decay: 1.2, wave: "sine", gain: 0.04 },
    ],
  },
  {
    id: "bright-ding",
    label: "Bright ding",
    hint: "One short, high note.",
    tones: [
      { offset: 0, frequency: 1318.51, decay: 0.6, wave: "triangle", gain: 0.2 },
      { offset: 0, frequency: 2637, decay: 0.25, wave: "sine", gain: 0.04 },
    ],
  },
  {
    id: "rising",
    label: "Rising",
    hint: "Three notes stepping up, like a doorbell.",
    tones: [
      { offset: 0, frequency: 523.25, decay: 0.5, wave: "sine", gain: 0.18 },
      { offset: 0.16, frequency: 659.26, decay: 0.5, wave: "sine", gain: 0.18 },
      { offset: 0.32, frequency: 783.99, decay: 0.8, wave: "sine", gain: 0.18 },
    ],
  },
  {
    id: "none",
    label: "Silent",
    hint: "No sound. The notification still appears if it is allowed.",
    tones: [],
  },
] as const satisfies readonly {
  id: string
  label: string
  hint: string
  tones: readonly ChimeTone[]
}[]

export type ChimeId = (typeof CHIMES)[number]["id"]

export const CHIME_IDS = CHIMES.map((chime) => chime.id) as [
  ChimeId,
  ...ChimeId[],
]

/** Both moments start on the original chime, as before there was a choice. */
export const DEFAULT_CHIME: ChimeId = "two-tone"

/** A saved value read back: anything unknown is the default, never an error. */
export function normalizeChime(value: unknown): ChimeId {
  return CHIMES.some((chime) => chime.id === value)
    ? (value as ChimeId)
    : DEFAULT_CHIME
}

export function findChime(id: ChimeId) {
  return CHIMES.find((chime) => chime.id === id) ?? CHIMES[0]
}
