import * as React from "react"

import { FieldLabel, InspectorCard } from "@/components/broadcasts/inspector-fields"
import { ImageUpload } from "@/components/shared/image-upload"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import {
  useEditorRuntime,
  useEditorSelector,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { loadSoundEffects } from "@/lib/api/video/sound-effects"
import { showErrorToast } from "@/lib/toast/error-toast"
import { findStockSound, STOCK_SOUNDS, stockSoundUrl } from "@/lib/video/stock-sounds"
import { editorId, loadMediaDurationMs } from "@/lib/video/timeline-utils"
import type { MediaItem } from "@/server/media/library"
import {
  CAPTION_ANIMATIONS,
  resolveCaptionAnimation,
} from "@/lib/video/caption-animations"
import { shapeDesignFrame } from "@/lib/video/shapes"
import {
  fitSocialBox,
  LINK_TEXT_MAX,
  SOCIAL_NAME_MAX,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  SOCIAL_TEXT_MAX,
  SUBSCRIBE_PRESS_MS,
  socialPlatform,
  type SocialKind,
  type SocialPlatform,
} from "@/lib/video/social-stickers"

/**
 * The settings of a social sticker (social-stickers.md): its look, its words,
 * the name and picture on it, and how it arrives. Fades and timing are the
 * shape's own cards, drawn after these by the inspector.
 */
export function SocialStickerCards({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  const aspect = useEditorSelector((state) => state.aspect)
  const guest = useProjectGuest() !== null
  const kind = clip.shape as SocialKind

  function patch(next: Partial<EditorClip>, transient = false) {
    dispatch({ type: "UPDATE_CLIP", clipId: clip.id, patch: next, transient })
  }

  // New words or a new name change the sticker's height, so the box keeps its
  // width and grows or shrinks to the sticker's new shape.
  // Typing is one Undo per pause (`transient`); a pick from a list is one Undo.
  function patchWords(next: Partial<EditorClip>, transient = true) {
    const [across, down] = aspect.split(":").map(Number)
    const frame = shapeDesignFrame(across / down)
    patch({ ...next, ...fitSocialBox({ ...clip, ...next }, frame) }, transient)
  }

  const hasPlatform = kind === "comment" || kind === "subscribe"
  const hasPerson = kind !== "link-in-bio"

  return (
    <>
      <InspectorCard
        title={clip.name}
        description="Drag it on the preview, or drag a dot to make it bigger or smaller."
      >
        {hasPlatform ? (
          <div className="grid gap-2.5">
            <FieldLabel htmlFor="social-platform">
              {kind === "comment" ? "Which app's comment" : "Which app's button"}
            </FieldLabel>
            <Select
              value={socialPlatform(clip)}
              onValueChange={(value) => patchWords({ socialPlatform: value as SocialPlatform }, false)}
            >
              <SelectTrigger id="social-platform" className="w-0 min-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOCIAL_PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {SOCIAL_PLATFORM_LABELS[platform]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {kind === "comment" ? (
          <div className="grid gap-2.5">
            <FieldLabel htmlFor="social-text">
              The comment
            </FieldLabel>
            {/* Takes the panel's width and wraps, never widening the panel to
                fit a long comment on one line. */}
            <Textarea
              id="social-text"
              className="w-0 min-w-full"
              rows={1}
              maxLength={SOCIAL_TEXT_MAX}
              value={clip.text ?? ""}
              onChange={(event) => patchWords({ text: event.target.value })}
            />
          </div>
        ) : null}

        {kind === "subscribe" ? <PressSoundField sticker={clip} guest={guest} /> : null}

        {kind === "link-in-bio" ? (
          <>
            <div className="grid gap-2.5">
              <FieldLabel htmlFor="social-link-text">Words on it</FieldLabel>
              <Input
                id="social-link-text"
                maxLength={LINK_TEXT_MAX}
                value={clip.text ?? ""}
                onChange={(event) => patch({ text: event.target.value }, true)}
              />
            </div>
            <div className="grid gap-2.5">
              <FieldLabel htmlFor="social-arrow">Arrow</FieldLabel>
              <Select
                value={clip.pointsUp ? "up" : "down"}
                onValueChange={(value) => patch({ pointsUp: value === "up" || undefined })}
              >
                <SelectTrigger id="social-arrow" className="w-0 min-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="down">Points down</SelectItem>
                  <SelectItem value="up">Points up</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}
      </InspectorCard>

      {hasPerson ? (
        <InspectorCard
          title="Who it's from"
          description="Starts as your own name and profile picture."
        >
          <div className="grid gap-2.5">
            <FieldLabel htmlFor="social-name">Name</FieldLabel>
            <Input
              id="social-name"
              maxLength={SOCIAL_NAME_MAX}
              value={clip.socialName ?? ""}
              onChange={(event) => patchWords({ socialName: event.target.value })}
            />
          </div>
          {guest ? null : (
            <ImageUpload
              label="Picture"
              aspect="square"
              emptyLabel="Add a picture"
              hint="Without one, the sticker shows the name's first letter."
              className="max-w-24"
              value={clip.pictureUrl ?? ""}
              onChange={(pictureUrl) => patch({ pictureUrl: pictureUrl || undefined })}
            />
          )}
        </InspectorCard>
      ) : null}

      <InspectorCard title="How it arrives" description="What it does the moment it appears.">
        <div className="grid gap-2.5">
          <FieldLabel htmlFor="social-animation">Entrance</FieldLabel>
          <Select
            value={resolveCaptionAnimation(clip.animation)}
            onValueChange={(animation) => patch({ animation: resolveCaptionAnimation(animation) })}
          >
            <SelectTrigger id="social-animation" className="w-0 min-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAPTION_ANIMATIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label} - {option.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </InspectorCard>
    </>
  )
}

/** The picker's value for no sound, and the starts of a starter's and an own sound's values. */
const NO_SOUND = "none"
const STOCK = "stock:"
const OWN = "own:"

/**
 * The sound the Subscribe button's press makes (social-stickers.md): none, one
 * of the 30 starter sounds, or one of your own from the Sounds panel. The
 * sound is a clip of its own on a lane of its own, linked to the sticker by
 * `pressFor`, so choosing another swaps that clip in place, choosing none
 * deletes it, and choosing one when there is none lays it at the press. Each
 * is one Undo. A guest has the starter sounds only, as in the Sounds panel.
 */
function PressSoundField({ sticker, guest }: { sticker: EditorClip; guest: boolean }) {
  const { dispatch } = useEditorRuntime()
  const press = useEditorSelector((state) =>
    state.tracks.flatMap((track) => track.clips).find((one) => one.pressFor === sticker.id) ?? null
  )
  const [own, setOwn] = React.useState<MediaItem[]>([])
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (guest) return
    let live = true
    loadSoundEffects()
      .then((files) => live && setOwn(files))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [guest])

  const value = !press
    ? NO_SOUND
    : press.stockSound
      ? `${STOCK}${press.stockSound}`
      : `${OWN}${press.mediaId ?? ""}`

  async function choose(next: string) {
    if (next === value) return
    if (next === NO_SOUND) {
      if (press) dispatch({ type: "DELETE_CLIP", clipId: press.id })
      return
    }
    let sound: Partial<EditorClip>
    if (next.startsWith(STOCK)) {
      const stock = findStockSound(next.slice(STOCK.length))
      if (!stock) return
      sound = {
        name: `${stock.label} (Subscribe)`,
        stockSound: stock.id,
        mediaId: undefined,
        url: stockSoundUrl(stock.id),
        sourceDurationMs: stock.durationMs,
        durationMs: stock.durationMs,
      }
    } else {
      const file = own.find((one) => one.id === next.slice(OWN.length))
      if (!file) return
      setBusy(true)
      try {
        const lengthMs = await loadMediaDurationMs(file.url, "audio")
        sound = {
          name: `${file.original_name} (Subscribe)`,
          stockSound: undefined,
          mediaId: file.id,
          url: file.url,
          sourceDurationMs: lengthMs,
          durationMs: lengthMs,
        }
      } catch {
        showErrorToast("That sound could not be read. Its file may have been deleted.")
        return
      } finally {
        setBusy(false)
      }
    }
    if (press) {
      dispatch({ type: "UPDATE_CLIP", clipId: press.id, patch: { ...sound, trimStartMs: 0 } })
      return
    }
    dispatch({
      type: "ADD_CLIP_TO_NEW_TRACK",
      atMs: sticker.startMs + SUBSCRIBE_PRESS_MS,
      clip: {
        id: editorId(),
        kind: "audio",
        name: sound.name ?? "Click",
        pressFor: sticker.id,
        trimStartMs: 0,
        startMs: 0,
        durationMs: sound.durationMs ?? 0,
        ...sound,
      },
    })
    // A new clip is picked when it lands; the sticker's settings stay open.
    dispatch({ type: "SELECT_CLIP", clipId: sticker.id })
  }

  return (
    <div className="grid gap-2.5">
      <FieldLabel htmlFor="social-press-sound">Click sound</FieldLabel>
      <Select value={value} onValueChange={(next) => void choose(next)} disabled={busy}>
        <SelectTrigger id="social-press-sound" className="w-0 min-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_SOUND}>No sound</SelectItem>
          {STOCK_SOUNDS.map((stock) => (
            <SelectItem key={stock.id} value={`${STOCK}${stock.id}`}>
              {stock.label}
            </SelectItem>
          ))}
          {own.map((file) => (
            <SelectItem key={file.id} value={`${OWN}${file.id}`}>
              Yours: {file.original_name}
            </SelectItem>
          ))}
          {press && !press.stockSound && !own.some((file) => file.id === press.mediaId) ? (
            <SelectItem value={value}>{press.name}</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  )
}
