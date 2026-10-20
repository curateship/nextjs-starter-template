import * as React from "react"
import { FilmIcon, Loader2Icon, RotateCwIcon, XIcon } from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { toast } from "sonner"

import { InspectorCard } from "@/components/broadcasts/inspector-fields"
import {
  CONTEXT_MENU_CONTENT_CLASS,
  CONTEXT_MENU_ITEM_CLASS,
} from "@/components/shared/editor-media-context-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  findClip,
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { useMovingStills } from "@/components/video-editor/moving-stills-context"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import { useProjectSettings } from "@/components/video-editor/project-settings-context"
import {
  RemakeClipsContext,
  useRemakeClips,
  type RemakeClipsValue,
} from "@/components/video-editor/remake-clips-context"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import {
  getAiToolErrorMessage,
  loadVoices,
  remakeVoiceLine,
  type Voice,
} from "@/lib/api/video/ai-tools"
import { getFirstFrameErrorMessage, remakeFirstFrame } from "@/lib/api/video/first-frames"
import { voiceCostCents } from "@/lib/video/ai-estimates"
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  shotCostCents,
  type GeminiImageModelId,
} from "@/lib/video/asset-factories"
import {
  isMovingOrigin,
  isPictureOrigin,
  isVoiceOrigin,
  type ClipOrigin,
  type PictureOrigin,
  type VoiceOrigin,
} from "@/lib/video/clip-origin"
import { stillRefusal, stillShotLengths } from "@/lib/video/moving-still"
import { formatCents, isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import {
  landVoiceLine,
  OPENAI_VOICE_MODEL,
  REMAKE_VOICE_NO_ROOM_MESSAGE,
} from "@/lib/video/remake-clip"
import { TRANSLATE_VOICE_MODEL } from "@/lib/video/translate"
import {
  VOICE_MODEL_IDS,
  VOICE_MODELS,
  VOICE_NO_TEXT_MESSAGE,
  VOICE_NO_VOICE_MESSAGE,
  VOICE_TEXT_MAX,
  type VoiceModelId,
} from "@/lib/video/voice"
import { spokenScript, voicePausesRefusal } from "@/lib/video/voice-direction"
import { showErrorToast } from "@/lib/toast/error-toast"
import { editorId, formatClock } from "@/lib/video/timeline-utils"

/**
 * Make it again on a clip the AI made (`workspace/docs/regenerate-a-scene.md`).
 * A picture and a voice line are made inside the request and swapped in at
 * once, as one Undo step. A moving clip goes through Make it move's job
 * (moving-stills.tsx), which swaps it when the new shot arrives.
 */

function onTimeline(store: ReturnType<typeof useEditorRuntime>["store"], clipId: string) {
  return findClip(store.getSnapshot().state.tracks, clipId)?.clip
}

function seconds(ms: number) {
  return (ms / 1000).toFixed(1)
}

/** A price in dollars. A short voice line costs a fraction of a cent, which "$0.00" would hide. */
function dollars(cents: number) {
  return cents > 0 && cents < 1 ? "under $0.01" : formatCents(cents)
}

/** What one more reading costs with this voice and model. */
function voiceLineCents(origin: VoiceOrigin, voice: Pick<Voice, "speaker">, modelId: string, text: string) {
  const model =
    voice.speaker === "openai"
      ? OPENAI_VOICE_MODEL
      : origin.tool === "translate"
        ? TRANSLATE_VOICE_MODEL
        : modelId
  return voiceCostCents(model, text.length)
}

/** What making this clip once more costs at the choices it was made with. */
function remakeCents(clip: EditorClip, origin: ClipOrigin) {
  if (isPictureOrigin(origin)) return aiUnitCostCents(origin.model, 1)
  if (isMovingOrigin(origin)) return shotCostCents(stillShotLengths(clip.durationMs)[0])
  return voiceLineCents(origin, origin.voice, origin.model, origin.prompt)
}

function useReportError() {
  const { openSettings } = useProjectSettings()
  return React.useCallback(
    (message: string) => {
      showErrorToast(
        message,
        isProjectSpendLimitMessage(message)
          ? { label: "Raise limit", onClick: openSettings }
          : undefined
      )
    },
    [openSettings]
  )
}

/** A guest sent from Project uses no AI (`project-guests.md`), so for a guest there is nothing here. */
export function RemakeClipsProvider({ children }: { children: React.ReactNode }) {
  if (useProjectGuest()) return children
  return <OwnerRemakeClips>{children}</OwnerRemakeClips>
}

type Editing =
  | { clip: EditorClip; origin: PictureOrigin }
  | { clip: EditorClip; origin: VoiceOrigin }

function OwnerRemakeClips({ children }: { children: React.ReactNode }) {
  const { store } = useEditorRuntime()
  const stills = useMovingStills()
  const [editing, setEditing] = React.useState<Editing | null>(null)

  const value = React.useMemo<RemakeClipsValue>(
    () => ({
      open: (clipId) => {
        if (store.refuseIfLocked()) return
        const clip = onTimeline(store, clipId)
        const origin = clip?.origin
        if (!clip || !origin) return
        if (isMovingOrigin(origin)) {
          stills?.open(clipId)
          return
        }
        if (isPictureOrigin(origin) && clip.kind === "image") setEditing({ clip, origin })
        if (isVoiceOrigin(origin) && clip.kind === "audio") setEditing({ clip, origin })
      },
    }),
    [store, stills]
  )

  return (
    <RemakeClipsContext.Provider value={value}>
      {children}
      {editing && isPictureOrigin(editing.origin) ? (
        <RemakePictureDialog
          key={editing.clip.id}
          clip={editing.clip}
          origin={editing.origin}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing && isVoiceOrigin(editing.origin) ? (
        <RemakeVoiceDialog
          key={editing.clip.id}
          clip={editing.clip}
          origin={editing.origin}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </RemakeClipsContext.Provider>
  )
}

/**
 * Make it again on a picture: its direction and the picture model, with the
 * same actor, sheet pictures and extras, and the price on the button.
 */
function RemakePictureDialog({
  clip,
  origin,
  onClose,
}: {
  clip: EditorClip
  origin: PictureOrigin
  onClose: () => void
}) {
  const { store, dispatch, projectId, saveNow } = useEditorRuntime()
  const { project, refreshSpend } = useProjectSettings()
  const reportError = useReportError()
  const startModel =
    IMAGE_MODELS.find((item) => item.id === origin.model)?.id ?? DEFAULT_IMAGE_MODEL
  const [prompt, setPrompt] = React.useState(origin.prompt)
  const [model, setModel] = React.useState<GeminiImageModelId>(startModel)
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const cents = aiUnitCostCents(model, 1)
  const dirty = prompt !== origin.prompt || model !== startModel

  async function submit() {
    const direction = prompt.trim()
    if (!direction) {
      setInvalid(true)
      showErrorToast("Write what the picture shows.")
      return
    }
    setBusy(true)
    try {
      // The server reads the clip off the saved timeline.
      await saveNow()
      const frame = await remakeFirstFrame({ projectId, clipId: clip.id, prompt: direction, model })
      refreshSpend()
      // A scene's picture lands on the Media panel rather than the AI clip panel.
      if (origin.tool === "brief") store.refreshMediaShelf()
      if (!onTimeline(store, clip.id)) {
        toast(
          origin.tool === "brief"
            ? "The picture was deleted meanwhile. The new one is in the Media panel."
            : "The picture was deleted meanwhile. The new one is with the first frames in the AI clip panel."
        )
        onClose()
        return
      }
      dispatch({
        type: "UPDATE_CLIP",
        clipId: clip.id,
        patch: {
          mediaId: frame.image.id,
          url: frame.image.url,
          name: frame.image.original_name,
          origin: frame.origin,
        },
      })
      toast.success("Made again. Undo brings the old picture back.")
      onClose()
    } catch (error) {
      reportError(getFirstFrameErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Make it again</DialogTitle>
            <DialogDescription>
              The new picture takes this one&apos;s place on the timeline and
              nothing else moves.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The picture</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {clip.url ? (
                    <div className="grid place-items-center overflow-hidden rounded-lg bg-muted">
                      <img
                        src={clip.url}
                        alt={clip.name}
                        draggable={false}
                        className="block max-h-48 w-auto object-contain"
                      />
                    </div>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {seconds(clip.durationMs)} seconds from {formatClock(clip.startMs)}.
                    The new picture keeps this clip&apos;s length, fit, colour and
                    slow move.
                  </p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The recipe</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid min-w-0 gap-2">
                    <Label htmlFor="remake-picture-direction">Direction</Label>
                    <Textarea
                      id="remake-picture-direction"
                      rows={1}
                      maxLength={5000}
                      value={prompt}
                      disabled={busy}
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setPrompt(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="remake-picture-model">Model</Label>
                    <Select
                      value={model}
                      onValueChange={(next) => setModel(next as GeminiImageModelId)}
                      disabled={busy}
                    >
                      <SelectTrigger id="remake-picture-model" className="w-full sm:w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMAGE_MODELS.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label} · {formatCents(aiUnitCostCents(item.id, 1))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {origin.tool === "brief"
                      ? project.look?.style
                        ? `Sent with it: the project's style line, "${project.look.style}".`
                        : "It is made from the direction alone, as it was for the brief."
                      : `Sent with it: the actor's pictures and the extras it was made with${
                          project.look?.style
                            ? `, and the project's style line, "${project.look.style}"`
                            : ""
                        }.`}
                  </p>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
                Make it again · {formatCents(cents)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * Make it again on a voice line: its script, the voice, and the model where
 * the voice has models to choose between. It keeps the settings it was read
 * with. The window says how long it runs now, because a new reading can come
 * out longer.
 */
function RemakeVoiceDialog({
  clip,
  origin,
  onClose,
}: {
  clip: EditorClip
  origin: VoiceOrigin
  onClose: () => void
}) {
  const { store, dispatch, projectId, saveNow } = useEditorRuntime()
  const { refreshSpend } = useProjectSettings()
  const reportError = useReportError()
  const startModel =
    VOICE_MODEL_IDS.find((id) => id === origin.model) ?? "eleven_multilingual_v2"
  const [script, setScript] = React.useState(origin.prompt)
  const [voices, setVoices] = React.useState<Voice[] | null>(null)
  const [voicesRefused, setVoicesRefused] = React.useState(false)
  const [voiceId, setVoiceId] = React.useState(origin.voice.id)
  const [modelId, setModelId] = React.useState<VoiceModelId>(startModel)
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Another language speaks through ElevenLabs alone, so only its voices fit.
  React.useEffect(() => {
    let active = true
    loadVoices()
      .then((loaded) => {
        if (!active) return
        setVoices(
          origin.tool === "translate"
            ? loaded.filter((voice) => voice.speaker === "elevenlabs")
            : loaded
        )
      })
      .catch((error: unknown) => {
        if (!active) return
        setVoicesRefused(true)
        showErrorToast(getAiToolErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [origin.tool])

  const chosen = voices?.find((voice) => voice.id === voiceId)
  const originalGone = voices !== null && !voices.some((voice) => voice.id === origin.voice.id)
  const speaker = chosen?.speaker ?? origin.voice.speaker
  const offersModels = speaker === "elevenlabs" && origin.tool !== "translate"
  const cents = voiceLineCents(origin, { speaker }, modelId, script)
  const dirty = script !== origin.prompt || voiceId !== origin.voice.id || modelId !== startModel
  const words = store
    .getSnapshot()
    .state.tracks.some((track) =>
      track.clips.some((other) => other.kind === "text" && other.spokenBy === clip.id)
    )

  async function submit() {
    if (!spokenScript(script)) {
      setInvalid(true)
      showErrorToast(VOICE_NO_TEXT_MESSAGE)
      return
    }
    const pauses = voicePausesRefusal(script)
    if (pauses) {
      setInvalid(true)
      showErrorToast(pauses)
      return
    }
    if (!chosen) {
      showErrorToast(VOICE_NO_VOICE_MESSAGE)
      return
    }
    setBusy(true)
    try {
      // The server reads the line off the saved timeline.
      await saveNow()
      const line = await remakeVoiceLine({
        projectId,
        clipId: clip.id,
        voiceId: chosen.id,
        voiceName: chosen.name,
        modelId: origin.tool === "translate" ? TRANSLATE_VOICE_MODEL : modelId,
        text: script,
      })
      refreshSpend()
      const landed = landVoiceLine(store.getSnapshot().state.tracks, {
        clipId: clip.id,
        line,
        newId: editorId,
      })
      if (!landed) {
        // It was read and paid for, so say where it went.
        showErrorToast(
          onTimeline(store, clip.id)
            ? REMAKE_VOICE_NO_ROOM_MESSAGE
            : "The voice line was deleted meanwhile. The new reading is in the Voices panel."
        )
        return
      }
      dispatch({ type: "REMAKE_VOICE_LINE", clipId: clip.id, line })
      toast.success(
        landed.newLane
          ? "Read again. It ran longer than the room after it, so it is on a lane of its own. Undo brings the old line back."
          : "Read again. Undo brings the old line back."
      )
      onClose()
    } catch (error) {
      reportError(getAiToolErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Make it again</DialogTitle>
            <DialogDescription>
              The new reading starts where this one starts, and nothing else
              moves.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>What it says</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Textarea
                    id="remake-voice-script"
                    aria-label="What it says"
                    rows={1}
                    maxLength={VOICE_TEXT_MAX}
                    value={script}
                    disabled={busy}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => {
                      setScript(event.target.value)
                      setInvalid(false)
                    }}
                  />
                  <p className="text-sm text-muted-foreground">
                    {origin.tool === "hook"
                      ? "The opening words on screen change to the new line."
                      : words
                        ? "Its captions are replaced with the new reading's, in the same look."
                        : "It has no captions, so none are added."}
                  </p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>How it sounds</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="remake-voice-who">Voice</Label>
                    {/* The value never changes while the list loads: a Select
                        in a form whose value went from empty to a voice as
                        the list arrived handed an empty pick back up, which
                        blanked the voice (seen 20 Oct 2026). An empty pick
                        is passed over for the same reason. */}
                    <Select
                      value={voiceId}
                      onValueChange={(next) => {
                        if (next) setVoiceId(next)
                      }}
                      disabled={busy || !voices?.length}
                    >
                      <SelectTrigger id="remake-voice-who" className="w-full">
                        <SelectValue
                          placeholder={
                            voices === null && !voicesRefused
                              ? "Fetching voices…"
                              : "Pick a voice"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(voices ?? []).map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                            {voice.yours ? " (yours)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {originalGone ? (
                      <p className="text-sm text-muted-foreground">
                        {origin.voice.name}, the voice it was read with, is no
                        longer there. Pick another.
                      </p>
                    ) : null}
                  </div>
                  {offersModels ? (
                    <div className="grid gap-2">
                      <Label htmlFor="remake-voice-model">Quality</Label>
                      <Select
                        value={modelId}
                        onValueChange={(next) => setModelId(next as VoiceModelId)}
                        disabled={busy}
                      >
                        <SelectTrigger id="remake-voice-model" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VOICE_MODELS.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label}, {model.note.toLowerCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <p role="note" className="text-sm text-muted-foreground">
                    It runs {seconds(clip.durationMs)} seconds now. A new reading
                    can come out longer. Then the clip grows, and if the next clip
                    on its lane is in the way, it moves to a lane of its own at
                    the same start.
                  </p>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || (voices === null && !voicesRefused)}>
                {busy ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
                Make it again · {dollars(cents)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The right-click menu on a timeline clip: Make it move on a picture, Make
 * it again on anything the AI made, and Try again or Clear after a failed
 * shot. A clip with none of those gets no menu. Outside the editor itself,
 * such as the History preview, every clip is drawn without one.
 */
export function ClipContextMenu({
  clip,
  children,
}: {
  clip: EditorClip
  children: React.ReactElement
}) {
  const stills = useMovingStills()
  const remake = useRemakeClips()
  const shot = stills?.shotFor(clip.id)
  const failed = shot?.status === "error" ? shot : null
  const canMove = !!stills && clip.kind === "image"
  const canRemake = !!remake && !!clip.origin
  if (!canMove && !canRemake && !failed) return children
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          className={CONTEXT_MENU_CONTENT_CLASS}
          // The menu sits in a portal, but React still hands its presses up
          // to the timeline, which would take the pointer for scrubbing and
          // leave the item never chosen.
          onPointerDown={(event) => event.stopPropagation()}
        >
          {canMove ? (
            <ContextMenuPrimitive.Item
              className={CONTEXT_MENU_ITEM_CLASS}
              onSelect={() => stills.open(clip.id)}
            >
              <FilmIcon />
              Make it move…
            </ContextMenuPrimitive.Item>
          ) : null}
          {canRemake ? (
            <ContextMenuPrimitive.Item
              className={CONTEXT_MENU_ITEM_CLASS}
              onSelect={() => remake.open(clip.id)}
            >
              <RotateCwIcon />
              Make it again…
            </ContextMenuPrimitive.Item>
          ) : null}
          {failed && stills ? (
            <>
              <ContextMenuPrimitive.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onSelect={() => stills.retry(failed)}
              >
                <RotateCwIcon />
                Try again
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onSelect={() => stills.clear(failed)}
              >
                <XIcon />
                Clear the failed try
              </ContextMenuPrimitive.Item>
            </>
          ) : null}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}

/**
 * The inspector's way in, beside the right-click menu (Tyler, 20 Oct 2026):
 * on any clip the AI made, the price of making it once more and a button
 * for the same window. A moving clip being made again says so instead, and
 * a failed try gives the reason with Try again and Clear.
 */
export function RemakeCard({ clip }: { clip: EditorClip }) {
  const remake = useRemakeClips()
  const stills = useMovingStills()
  const origin = clip.origin
  if (!remake || !origin) return null
  const moving = isMovingOrigin(origin)
  const shot = moving ? stills?.shotFor(clip.id) : undefined

  if (stills && shot?.status === "error") {
    return (
      <InspectorCard
        title="Make it again"
        description={`Couldn't make it again. ${shot.error_message ?? "The shot could not be made."}`}
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => stills.retry(shot)}>
            <RotateCwIcon />
            Try again
          </Button>
          <Button type="button" variant="ghost" className="flex-1" onClick={() => stills.clear(shot)}>
            <XIcon />
            Clear the failed try
          </Button>
        </div>
      </InspectorCard>
    )
  }
  if (shot) {
    return (
      <InspectorCard
        title="Make it again"
        description="It takes a few minutes, and the new shot takes this clip's place by itself."
      >
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          <Loader2Icon aria-hidden className="size-4 motion-safe:animate-spin" />
          Making it again
        </p>
      </InspectorCard>
    )
  }
  const refusal = moving ? stillRefusal(clip) : null
  if (refusal) {
    return (
      <InspectorCard title="Make it again">
        <p className="text-sm leading-relaxed text-muted-foreground">{refusal}</p>
      </InspectorCard>
    )
  }
  const price = dollars(remakeCents(clip, origin))
  const description = isPictureOrigin(origin)
    ? origin.tool === "brief"
      ? `Makes this scene's picture again from its direction, for ${price}.`
      : `Makes this picture again from its words, with the same actor and extras, for ${price}.`
    : moving
      ? `Google makes this shot again from the picture it started on, from ${price}.`
      : `Reads this line again from its script, for ${price}.`
  return (
    <InspectorCard title="Make it again" description={description}>
      <Button type="button" variant="outline" className="w-full" onClick={() => remake.open(clip.id)}>
        <RotateCwIcon />
        Make it again…
      </Button>
    </InspectorCard>
  )
}
