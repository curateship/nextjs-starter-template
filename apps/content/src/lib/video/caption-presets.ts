import { DEFAULT_CAPTION_LOOK, type CaptionLook } from "@/lib/video/caption-look"

/**
 * Ready looks picked by name instead of set field by field. Picking one fills
 * every field of the caption look; each field stays changeable afterwards.
 * A preset never changes the platform, which is about where the video is
 * going rather than how the words look.
 */

type PresetLook = Omit<CaptionLook, "platform">

export const CAPTION_PRESETS = [
  {
    id: "plain",
    label: "Plain",
    description: "White words on a black box, as captions have always been",
    look: withoutPlatform(DEFAULT_CAPTION_LOOK),
  },
  {
    id: "karaoke",
    label: "Karaoke",
    description: "Three words at a time, each lit up yellow as it is said",
    look: {
      ...withoutPlatform(DEFAULT_CAPTION_LOOK),
      fontSize: 76,
      boxed: false,
      strokeColor: "#000000",
      strokeWidth: 3,
      wordHighlight: true,
      wordColor: "#facc15",
      wordsPerCaption: 3,
      y: 0.72,
    },
  },
  {
    id: "bold",
    label: "Bold",
    description: "Heavy capitals with a yellow outline that pop in",
    look: {
      ...withoutPlatform(DEFAULT_CAPTION_LOOK),
      fontId: "anton",
      fontSize: 96,
      capitals: true,
      boxed: false,
      strokeColor: "#facc15",
      strokeWidth: 5,
      animation: "pop",
      y: 0.72,
    },
  },
] as const satisfies readonly {
  id: string
  label: string
  description: string
  look: PresetLook
}[]

export type CaptionPresetId = (typeof CAPTION_PRESETS)[number]["id"]

function withoutPlatform(look: CaptionLook): PresetLook {
  const { platform: _platform, ...rest } = look
  return rest
}

/**
 * The look as it draws: a colour for an outline, box or lit word that is
 * switched off draws nothing, so it does not stop a look matching a preset.
 */
function asDrawn(look: PresetLook) {
  return {
    ...look,
    strokeColor: look.strokeWidth > 0 ? look.strokeColor : null,
    boxColor: look.boxed ? look.boxColor : null,
    wordColor: look.wordHighlight ? look.wordColor : null,
  }
}

/** The look with a preset's fields put in, keeping the platform it had. */
export function applyCaptionPreset(
  look: CaptionLook,
  presetId: CaptionPresetId
): CaptionLook {
  const preset = CAPTION_PRESETS.find((one) => one.id === presetId)
  if (!preset) throw new Error(`Unknown caption preset: ${presetId}`)
  return { ...preset.look, platform: look.platform }
}

/** The preset this look still matches field for field, or null once changed. */
export function matchingCaptionPreset(
  look: CaptionLook
): CaptionPresetId | null {
  const fields = asDrawn(withoutPlatform(look))
  const keys = Object.keys(fields) as (keyof PresetLook)[]
  return (
    CAPTION_PRESETS.find((preset) => {
      const drawn = asDrawn(preset.look)
      return keys.every((key) => drawn[key] === fields[key])
    })?.id ?? null
  )
}
