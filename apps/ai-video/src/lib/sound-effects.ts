export const SOUND_EFFECTS = [
  {
    id: "pop",
    label: "Pop",
    fileName: "pop.wav",
    durationMs: 240,
  },
  {
    id: "whoosh",
    label: "Whoosh",
    fileName: "whoosh.wav",
    durationMs: 550,
  },
  {
    id: "ding",
    label: "Ding",
    fileName: "ding.wav",
    durationMs: 680,
  },
  {
    id: "impact",
    label: "Impact",
    fileName: "impact.wav",
    durationMs: 480,
  },
  {
    id: "click",
    label: "Click",
    fileName: "click.wav",
    durationMs: 90,
  },
] as const

export const SOUND_EFFECT_IDS = SOUND_EFFECTS.map((effect) => effect.id) as [
  SoundEffectId,
  ...SoundEffectId[],
]

export type SoundEffectId = (typeof SOUND_EFFECTS)[number]["id"]

export function soundEffectUrl(fileName: string) {
  return `/sound-effects/${fileName}`
}

export function getSoundEffect(id: string | undefined) {
  return SOUND_EFFECTS.find((effect) => effect.id === id) ?? null
}
