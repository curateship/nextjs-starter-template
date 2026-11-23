import type { RoomFileChoices } from "@/lib/api/pomodoro/rooms"
import type { BackgroundReference } from "@/lib/pomodoro/background-catalog"
import type { MediaCatalog } from "@/lib/pomodoro/catalog"
import { catalogTags } from "@/lib/pomodoro/media-pool"
import { creditLabel } from "@/lib/pomodoro/shared-media"
import type { SoundReference } from "@/lib/pomodoro/sound-catalog"

/**
 * What Host a room's cards offer for each half of a room's pair, with what
 * each card draws and plays. The cards themselves are
 * `src/components/pomodoro/room-media-picker.tsx`.
 */

export type RoomMediaKind = "sound" | "background"

export type ChoiceGroup = "mixes" | "catalogue" | "own" | "saved"

export type RoomMediaChoice = {
  /** What the room stores: "shuffle", "tags:rain", "curated:cafe", "media:<id>". */
  value: string
  label: string
  /** The smaller line under the name. */
  detail: string
  group: ChoiceGroup
  /** A Pro item this person cannot use: pressing it leads to the plans page. */
  locked: boolean
  pro: boolean
  /** A background's picture: one still, or up to four for a mix. */
  stills: string[]
  /** What a sound card previews. Null for a mix, which has no one sound. */
  sound: SoundReference | null
  /** What a background card plays while pointed at. Null for a mix. */
  background: BackgroundReference | null
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

function fileDetail(file: RoomFileChoices["sounds"][number]) {
  return file.own ? "Your upload" : `Saved, ${creditLabel(file.credit ?? { handle: null })}`
}

/**
 * Every pick Host a room offers for one half of the pair, in the order the
 * picker draws them: the mixes, the catalogue, then the host's own shared
 * files and the files they saved.
 */
export function roomMediaChoices(
  kind: RoomMediaKind,
  catalog: MediaCatalog,
  files: RoomFileChoices | null,
  canUsePremiumMedia: boolean
): RoomMediaChoice[] {
  const blank = { locked: false, pro: false, stills: [], sound: null, background: null }
  if (kind === "sound") {
    return [
      {
        ...blank,
        value: "shuffle",
        label: "Shuffle every sound",
        detail: count(catalog.sounds.length, "sound"),
        group: "mixes",
      },
      ...catalogTags(catalog.sounds).map(({ tag, count: tagged }) => ({
        ...blank,
        value: `tags:${tag}`,
        label: `Only ${tag} sounds`,
        detail: count(tagged, "sound"),
        group: "mixes" as const,
      })),
      ...catalog.sounds.map((sound) => ({
        ...blank,
        value: `curated:${sound.key}`,
        label: sound.label,
        detail: sound.hint,
        group: "catalogue" as const,
        pro: sound.locked,
        locked: sound.locked && !canUsePremiumMedia,
        sound: {
          type: "curated" as const,
          key: sound.key,
          url: sound.fileUrl,
          label: sound.label,
          volume: sound.volume,
        },
      })),
      ...(files?.sounds ?? []).map((file) => ({
        ...blank,
        value: file.value,
        label: file.label,
        detail: fileDetail(file),
        group: file.own ? ("own" as const) : ("saved" as const),
        sound: {
          type: "media" as const,
          mediaId: file.mediaId,
          mediaUrl: file.url,
          label: file.label,
        },
      })),
    ]
  }
  const stillsOf = (themes: MediaCatalog["themes"]) =>
    themes.slice(0, 4).map((theme) => theme.stillUrl)
  return [
    {
      ...blank,
      value: "shuffle",
      label: "Shuffle every background",
      detail: count(catalog.themes.length, "background"),
      group: "mixes",
      stills: stillsOf(catalog.themes),
    },
    ...catalogTags(catalog.themes).map(({ tag, count: tagged }) => ({
      ...blank,
      value: `tags:${tag}`,
      label: `Only ${tag} backgrounds`,
      detail: count(tagged, "background"),
      group: "mixes" as const,
      stills: stillsOf(catalog.themes.filter((theme) => theme.tags.includes(tag))),
    })),
    ...catalog.themes.map((scene) => ({
      ...blank,
      value: `scene:${scene.key}`,
      label: scene.label,
      detail: scene.hint,
      group: "catalogue" as const,
      pro: scene.locked,
      locked: scene.locked && !canUsePremiumMedia,
      stills: [scene.stillUrl],
      background: {
        type: "scene" as const,
        key: scene.key,
        stillUrl: scene.stillUrl,
        videoUrl: scene.videoUrl,
      },
    })),
    ...(files?.backgrounds ?? []).map((file) => ({
      ...blank,
      value: file.value,
      label: file.label,
      detail: fileDetail(file),
      group: file.own ? ("own" as const) : ("saved" as const),
      // A picture is its own still; a clip without one shows its first frame.
      stills: file.stillUrl ? [file.stillUrl] : file.kind === "image" ? [file.url] : [],
      background: {
        type: "media" as const,
        mediaId: file.mediaId,
        mediaKind: file.kind === "video" ? ("video" as const) : ("image" as const),
        mediaUrl: file.url,
        credit: file.credit,
      },
    })),
  ]
}

/**
 * The pick as the field draws it. A value the lists do not hold (a house
 * preset's file that has since gone private) still reads as picked, by name
 * only, so the field never claims nothing was chosen.
 */
export function findRoomMediaChoice(
  kind: RoomMediaKind,
  choices: RoomMediaChoice[],
  value: string
): RoomMediaChoice | null {
  if (!value) return null
  return (
    choices.find((choice) => choice.value === value) ?? {
      value,
      label: kind === "sound" ? "A shared sound" : "A shared background",
      detail: "",
      group: "saved",
      locked: false,
      pro: false,
      stills: [],
      sound: null,
      background: null,
    }
  )
}
