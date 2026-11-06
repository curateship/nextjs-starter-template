import * as React from "react"
import {
  Loader2Icon,
  PlusIcon,
  RotateCwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

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
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BriefsContext, useBriefs, type BriefsValue } from "@/components/video-editor/briefs-context"
import { useCaptionSettings } from "@/components/video-editor/caption-settings-context"
import { useEditorLock, useEditorRuntime, useEditorSelector } from "@/components/video-editor/editor-store"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import { useProjectSettings } from "@/components/video-editor/project-settings-context"
import { ScriptCheckList } from "@/components/video-editor/script-check-results"
import { LengthCounter } from "@/components/video-assets/length-counter"
import {
  getBriefErrorMessage,
  listBriefs,
  retryBriefScene,
  saveBriefScenes,
  settleBriefScenes,
  startBrief,
  type BriefItem,
} from "@/lib/api/video/briefs"
import { remakeChangedScenes } from "@/lib/api/video/templates"
import { plural } from "@/lib/format/plural"
import { IMAGE_MODELS } from "@/lib/video/asset-factories"
import {
  BRIEF_BUSY_MESSAGE,
  BRIEF_NO_SCENES_MESSAGE,
  BRIEF_SCENES_MAX,
  SCENE_PICTURE_MAX,
  SCENE_SECONDS_MAX,
  SCENE_WORDS_MAX,
  landBriefScenes,
  platformFor,
  scenePictureCents,
  sceneVoiceCents,
  totalSeconds,
  type SceneDraft,
} from "@/lib/video/brief"
import { formatCents, isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { makingCents, templateCaptions } from "@/lib/video/templates"
import { showErrorToast } from "@/lib/toast/error-toast"
import { editorId } from "@/lib/video/timeline-utils"
import { formatDate } from "@/lib/format/format-time"

/**
 * Brief to video (`workspace/docs/brief-to-video.md`): the storyboard a
 * template's brief turns into, and the part of the editor that lays made
 * scenes on the timeline. The Templates panel writes the brief
 * (`workspace/docs/templates.md`). The provider keeps the project's briefs, asks again while
 * scenes are being made, and lands each made scene as one Undo step. The
 * background worker lands them instead whenever no editor has the project
 * open, so closing the tab never stops a brief.
 */

/** How often the editor asks again while a brief is being made. */
const BRIEF_RECHECK_MS = 5000
/** How long after the last storyboard edit it is kept. */
const BRIEF_SAVE_DELAY_MS = 700

function waiting(brief: BriefItem) {
  return brief.status === "making" || brief.scenes.some((scene) => scene.state === "made")
}

/** A price in dollars. A short voice line costs a fraction of a cent, which "$0.00" would hide. */
function dollars(cents: number) {
  return cents > 0 && cents < 1 ? "under $0.01" : formatCents(cents)
}

function useReportError() {
  const { openSettings } = useProjectSettings()
  return React.useCallback(
    (error: unknown) => {
      const message = getBriefErrorMessage(error)
      showErrorToast(
        message,
        isProjectSpendLimitMessage(message) ? { label: "Raise limit", onClick: openSettings } : undefined
      )
    },
    [openSettings]
  )
}

/** A guest sent from Project uses no AI (`project-guests.md`), so for a guest there are no briefs. */
export function BriefsProvider({ children }: { children: React.ReactNode }) {
  if (useProjectGuest()) return children
  return <OwnerBriefs>{children}</OwnerBriefs>
}

function OwnerBriefs({ children }: { children: React.ReactNode }) {
  const { store, dispatch, videoId } = useEditorRuntime()
  const captionSettings = useCaptionSettings()
  const aspect = useEditorSelector((state) => state.aspect)
  const { refreshSpend } = useProjectSettings()
  const lock = useEditorLock()
  const [briefs, setBriefs] = React.useState<BriefItem[] | null>(null)
  // Landings this window has started, so a later answer that still lists the
  // same scenes as waiting never lays them twice.
  const landing = React.useRef(new Set<string>())

  React.useEffect(() => {
    let active = true
    listBriefs(videoId)
      .then((loaded) => {
        if (active) setBriefs(loaded.briefs)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [videoId])

  // While a brief is being made, or has made scenes waiting to land, ask again.
  const busy = briefs?.some(waiting) ?? false
  React.useEffect(() => {
    if (!busy) return
    let active = true
    const timer = setInterval(() => {
      listBriefs(videoId)
        .then((loaded) => {
          if (active) setBriefs(loaded.briefs)
        })
        .catch(() => undefined)
    }, BRIEF_RECHECK_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [busy, videoId])

  // Made scenes land here when this window can save. The server is told
  // first, so the worker cannot lay the same scenes in the same moment; only
  // then do they go on the timeline, as one Undo step. A read-only window
  // leaves them to the worker.
  React.useEffect(() => {
    if (lock || !briefs) return
    for (const brief of briefs) {
      if (!brief.landing || !brief.scenes.some((scene) => scene.state === "made")) continue
      // A template's captions: its own look, or none when it switched them off.
      const captions = templateCaptions(brief.template?.fields, captionSettings, aspect)
      const landed = landBriefScenes(
        store.getSnapshot().state.tracks,
        { scenes: brief.scenes, landing: brief.landing },
        editorId,
        captions
      )
      if (!landed?.placed.length) continue
      const key = `${brief.id}:${landed.placed.join(",")}`
      if (landing.current.has(key)) continue
      landing.current.add(key)
      const placed = new Set(landed.placed)
      const musicLane =
        landed.landing.music?.laid && !brief.landing.music?.laid ? landed.landing.music.lane : undefined
      settleBriefScenes({ briefId: brief.id, sceneIds: landed.placed, lanes: landed.landing.lanes, musicLane })
        .then(({ settled }) => {
          if (!settled) return
          dispatch({
            type: "LAND_BRIEF_SCENES",
            scenes: brief.scenes,
            landing: landed.landing,
            captions,
          })
          setBriefs((current) =>
            current?.map((item) =>
              item.id === brief.id
                ? {
                    ...item,
                    landing: landed.landing,
                    scenes: item.scenes.map((scene) =>
                      placed.has(scene.id) ? { ...scene, state: "placed" as const } : scene
                    ),
                  }
                : item
            ) ?? null
          )
          store.refreshMediaShelf()
          refreshSpend()
          const numbers = brief.scenes.flatMap((scene, index) => (placed.has(scene.id) ? [index + 1] : []))
          toast.success(
            numbers.length === 1
              ? `Scene ${numbers[0]} is on the timeline. Undo takes it off.`
              : `Scenes ${numbers[0]} to ${numbers.at(-1)} are on the timeline. Undo takes them off.`
          )
        })
        .catch(() => {
          // Asked again on the next answer.
          landing.current.delete(key)
        })
    }
  }, [briefs, lock, store, dispatch, refreshSpend, captionSettings, aspect])

  const value = React.useMemo<BriefsValue>(
    () => ({
      briefs,
      replace: (brief) =>
        setBriefs((current) => [brief, ...(current ?? []).filter((item) => item.id !== brief.id)]),
    }),
    [briefs]
  )

  return <BriefsContext.Provider value={value}>{children}</BriefsContext.Provider>
}

/** "Scene 3 failed." and what that left, for a brief that stopped. */
function stoppedLine(brief: BriefItem) {
  const failed = brief.scenes.findIndex((scene) => scene.state === "failed")
  const later = brief.scenes.length - failed - 1
  const waiting = later ? " The scenes after it wait for it." : ""
  return failed > 0
    ? `Scene ${failed + 1} failed. The scenes before it are on the timeline.${waiting}`
    : `Scene 1 failed, so nothing is on the timeline yet.${waiting}`
}

type DraftScene = SceneDraft & { id: string }

function sceneProblem(scene: DraftScene) {
  if (!scene.words.trim()) return "words"
  if (!scene.picture.trim()) return "picture"
  return null
}

const STATE_TEXT = {
  draft: "",
  queued: "Waiting",
  made: "Made, landing",
  placed: "On the timeline",
  failed: "Failed",
} as const

/**
 * The storyboard: every scene's words, picture direction and seconds, each
 * one's price, and the total. Edits are kept 700ms after typing stops. Once
 * Make it is pressed it shows where each scene is up to instead. Once every
 * scene is on the timeline, a scene's words can be changed and only the
 * changed scenes are read again (templates.md, part 35).
 *
 * Opened from the Templates panel's "This video" card.
 */
export function BriefStoryboard({
  brief,
  briefs,
  onPick,
  onClose,
}: {
  brief: BriefItem
  briefs: BriefItem[]
  onPick: (briefId: string) => void
  onClose: () => void
}) {
  const { store, saveNow, clock, dispatch } = useEditorRuntime()
  const captionSettings = useCaptionSettings()
  const aspect = useEditorSelector((state) => state.aspect)
  const { refreshSpend } = useProjectSettings()
  const context = useBriefs()
  const reportError = useReportError()
  const editable = brief.status === "draft"
  const done = brief.status === "done" && !!brief.landing
  const [scenes, setScenes] = React.useState<DraftScene[]>(() =>
    brief.scenes.map(({ id, words, picture, seconds, person }) => ({
      id,
      words,
      picture,
      seconds,
      ...(person ? { person } : {}),
    }))
  )
  const [edited, setEdited] = React.useState(false)
  const [invalid, setInvalid] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [retrying, setRetrying] = React.useState<string | null>(null)
  const [redoing, setRedoing] = React.useState(false)
  // Words changed on a made video, by scene, before Make changed scenes again.
  const [rewords, setRewords] = React.useState<Record<string, string>>({})

  // Edits are kept a moment after typing stops, so the storyboard reopens as
  // it was left. A scene with no words or no picture direction waits.
  const replace = context?.replace
  React.useEffect(() => {
    if (!edited || !editable || scenes.some(sceneProblem)) return
    const timer = setTimeout(() => {
      saveBriefScenes(brief.id, scenes)
        .then((saved) => replace?.(saved))
        .catch((error: unknown) => {
          // Make it was pressed meanwhile, and carried these same scenes.
          if (getBriefErrorMessage(error) !== BRIEF_BUSY_MESSAGE) reportError(error)
        })
    }, BRIEF_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [scenes, edited, editable, brief.id, replace, reportError])

  function change(id: string, patch: Partial<SceneDraft>) {
    setEdited(true)
    setInvalid(null)
    setScenes((current) => current.map((scene) => (scene.id === id ? { ...scene, ...patch } : scene)))
  }

  function remove(id: string) {
    if (scenes.length <= 1) {
      showErrorToast(BRIEF_NO_SCENES_MESSAGE)
      return
    }
    setEdited(true)
    setScenes((current) => current.filter((scene) => scene.id !== id))
  }

  function add() {
    if (scenes.length >= BRIEF_SCENES_MAX) {
      showErrorToast(`A brief holds up to ${BRIEF_SCENES_MAX} scenes.`)
      return
    }
    setEdited(true)
    setScenes((current) => [...current, { id: editorId(), words: "", picture: "", seconds: 4 }])
  }

  async function make() {
    const broken = scenes.find(sceneProblem)
    if (broken) {
      setInvalid(broken.id)
      showErrorToast(
        `Scene ${scenes.indexOf(broken) + 1} needs ${sceneProblem(broken) === "words" ? "words to say" : "a picture direction"}.`
      )
      return
    }
    if (store.refuseIfLocked()) return
    setStarting(true)
    try {
      // Where scene one goes is worked out from the saved timeline.
      await saveNow()
      const started = await startBrief({ briefId: brief.id, scenes, playheadMs: clock.getTime() })
      context?.replace(started)
      toast.success(
        `Making ${started.scenes.length} ${plural(started.scenes.length, "scene", "scenes")}. Each one lands on the timeline when it is ready, and it carries on if you close the tab.`
      )
      onClose()
    } catch (error) {
      reportError(error)
    } finally {
      setStarting(false)
    }
  }

  async function retry(sceneId: string) {
    if (store.refuseIfLocked()) return
    setRetrying(sceneId)
    try {
      context?.replace(await retryBriefScene(brief.id, sceneId))
      refreshSpend()
    } catch (error) {
      reportError(error)
    } finally {
      setRetrying(null)
    }
  }

  const changedScenes = brief.scenes.filter((scene) => {
    const words = rewords[scene.id]
    return words !== undefined && words.trim() && words.trim() !== scene.words
  })

  async function redo() {
    if (!changedScenes.length || !brief.landing) {
      showErrorToast("Nothing changed: edit a scene's words first.")
      return
    }
    if (store.refuseIfLocked()) return
    setRedoing(true)
    try {
      const answer = await remakeChangedScenes(
        brief.id,
        changedScenes.map((scene) => ({ id: scene.id, words: rewords[scene.id].trim() }))
      )
      dispatch({
        type: "RELAY_BRIEF_SCENES",
        landing: brief.landing,
        changes: answer.changed,
        captions: templateCaptions(brief.template?.fields, captionSettings, aspect),
      })
      context?.replace(answer.brief)
      store.refreshMediaShelf()
      refreshSpend()
      setRewords({})
      toast.success(
        `${answer.changed.length} ${plural(answer.changed.length, "scene was", "scenes were")} read again and swapped in. Undo puts the old ${plural(answer.changed.length, "one", "ones")} back.`
      )
    } catch (error) {
      reportError(error)
    } finally {
      setRedoing(false)
    }
  }

  const fields = brief.template?.fields ?? null
  const shownScenes = editable ? scenes : brief.scenes
  const price = makingCents(shownScenes, brief.voice, brief.picture_model, fields)
  const totalCents = price.total
  const seconds = totalSeconds(shownScenes)
  const pictureCents = scenePictureCents(brief.picture_model)
  const platform = platformFor(brief.platform)
  const pictureModel = IMAGE_MODELS.find((item) => item.id === brief.picture_model)?.label ?? brief.picture_model
  const making = brief.status === "making"
  const firstWaiting = making ? brief.scenes.findIndex((scene) => scene.state === "queued") : -1
  const fromScript = brief.source?.kind === "script"
  const redoCents = changedScenes.reduce((sum, scene) => sum + sceneVoiceCents(brief.voice, rewords[scene.id]), 0)
  const overCap = editable && fields?.spendCapCents ? totalCents > fields.spendCapCents : false

  // The storyboard saves itself as it is typed, so only words changed on a
  // finished scene, not yet made again, are lost by closing.
  return (
    <FormDialog open dirty={changedScenes.length > 0} busy={starting || redoing} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{brief.title}</DialogTitle>
            <DialogDescription>
              {editable
                ? "Nothing has been made or charged for the scenes yet. Change anything, then press Make it."
                : done
                  ? "Every scene is on the timeline. Change a scene's words below and only that scene is read again."
                  : brief.status === "stopped"
                    ? stoppedLine(brief)
                    : "The scenes are being made one after another. Each lands on the timeline when it is ready."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{brief.template ? `From the ${brief.template.name} template` : "The brief"}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {briefs.length > 1 ? (
                  <div className="grid gap-2">
                    <Label htmlFor="brief-pick">Storyboard</Label>
                    <Select
                      value={brief.id}
                      onValueChange={(next) => {
                        if (next) onPick(next)
                      }}
                    >
                      <SelectTrigger id="brief-pick" className="w-full sm:w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {briefs.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.title}, {formatDate(item.created_at)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {/* A brief from the old window had no script box, only what it was about. */}
                {!brief.source ? (
                  <p className="text-sm [overflow-wrap:anywhere]">{brief.about}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {fromScript ? "Your script, " : `${brief.length_seconds} seconds asked, `}on {platform.label}
                  {brief.audience ? `, for ${brief.audience.toLowerCase()}` : ""}. Read by {brief.voice.name}, pictures
                  by {pictureModel}.
                </p>
                <p className="text-sm text-muted-foreground">
                  {fromScript
                    ? `Your words run about ${Math.round(seconds)} seconds read aloud. The reading decides the real length.`
                    : `The scenes add up to ${Math.round(seconds)} seconds, against the ${brief.length_seconds} asked. The reading decides the real length.`}
                </p>
                {fields ? <TemplateExtrasLine brief={brief} /> : null}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Script check</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {brief.check ? (
                  <>
                    {edited ? (
                      <p className="text-sm text-muted-foreground">
                        The words have changed since this check, which was made on the
                        script as it was written.
                      </p>
                    ) : null}
                    <ScriptCheckList result={brief.check} stale={false} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The script could not be checked: {brief.check_error ?? "no reason was given"}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {shownScenes.length} {plural(shownScenes.length, "scene", "scenes")}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {editable
                  ? scenes.map((scene, index) => (
                      <EditableScene
                        key={scene.id}
                        scene={scene}
                        number={index + 1}
                        invalid={invalid === scene.id ? sceneProblem(scene) : null}
                        pictureCents={pictureCents}
                        voiceCents={sceneVoiceCents(brief.voice, scene.words)}
                        disabled={starting}
                        onChange={(patch) => change(scene.id, patch)}
                        onRemove={() => remove(scene.id)}
                      />
                    ))
                  : brief.scenes.map((scene, index) => (
                      <section key={scene.id} className="grid gap-2 rounded-lg border p-3" aria-label={`Scene ${index + 1}`}>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">Scene {index + 1}</span>
                          <span className="flex items-center gap-1.5 text-muted-foreground" role="status">
                            {index === firstWaiting ? (
                              <>
                                <Loader2Icon aria-hidden className="size-3.5 motion-safe:animate-spin" />
                                Making
                              </>
                            ) : (
                              STATE_TEXT[scene.state]
                            )}
                          </span>
                        </div>
                        {done && scene.voice ? (
                          <div className="grid gap-2">
                            <Label htmlFor={`brief-reword-${scene.id}`} className="sr-only">
                              Scene {index + 1}&apos;s words
                            </Label>
                            <Textarea
                              id={`brief-reword-${scene.id}`}
                              rows={1}
                              maxLength={SCENE_WORDS_MAX}
                              value={rewords[scene.id] ?? scene.words}
                              disabled={redoing}
                              onChange={(event) => {
                                const value = event.target.value
                                setRewords((current) => ({ ...current, [scene.id]: value }))
                              }}
                            />
                            <LengthCounter length={(rewords[scene.id] ?? scene.words).length} max={SCENE_WORDS_MAX} />
                          </div>
                        ) : (
                          <p className="text-sm [overflow-wrap:anywhere]">{scene.words}</p>
                        )}
                        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                          Picture: {scene.picture}
                        </p>
                        {scene.state === "failed" ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 flex-1 text-sm text-destructive [overflow-wrap:anywhere]">
                              {scene.error ?? "It could not be made."}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={retrying !== null}
                              onClick={() => void retry(scene.id)}
                            >
                              {retrying === scene.id ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
                              Try again
                            </Button>
                          </div>
                        ) : null}
                      </section>
                    ))}
                {editable ? (
                  <Button type="button" variant="outline" className="justify-self-start" disabled={starting} onClick={add}>
                    <PlusIcon />
                    Add a scene
                  </Button>
                ) : null}
                <p className="text-sm font-medium tabular-nums">
                  {editable ? "Making them costs" : "Making them cost about"} {dollars(totalCents)}:{" "}
                  {shownScenes.length} {plural(shownScenes.length, "picture", "pictures")} at{" "}
                  {formatCents(pictureCents)} and the voice by the character
                  {price.total > price.thisVideo
                    ? `, with ${dollars(price.total - price.thisVideo)} of it for the language copies`
                    : ""}
                  .
                </p>
                {overCap && fields?.spendCapCents ? (
                  <p className="text-sm text-destructive">
                    That is over this template&apos;s cap of {formatCents(fields.spendCapCents)} a video, so Make it
                    will refuse. Cut some scenes or raise the cap in the template.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={starting || redoing} onClick={requestClose}>
              Done
            </Button>
            {editable ? (
              <Button type="button" disabled={starting} onClick={() => void make()}>
                {starting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                Make it · {dollars(totalCents)}
              </Button>
            ) : null}
            {done ? (
              <Button type="button" disabled={redoing} onClick={() => void redo()}>
                {redoing ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
                {changedScenes.length
                  ? `Make ${changedScenes.length} changed ${plural(changedScenes.length, "scene", "scenes")} again · ${dollars(redoCents)}`
                  : "Make changed scenes again"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** What a template adds to a brief: music, intro and outro, languages, the status, and how it finished. */
function TemplateExtrasLine({ brief }: { brief: BriefItem }) {
  const fields = brief.template?.fields
  if (!fields) return null
  const lines: string[] = []
  if (!fields.captions.on) lines.push("No captions.")
  if (fields.music.kind === "ai") lines.push(`AI music: "${fields.music.mood}".`)
  if (fields.music.kind === "track") lines.push(`Music: ${fields.music.name}.`)
  if (brief.landing?.musicError) lines.push(`The music could not be had: ${brief.landing.musicError}`)
  if (fields.introMediaId || fields.outroMediaId) lines.push("The template's own intro and outro go round every export.")
  if (fields.languages.length) lines.push(`Copies in ${fields.languages.join(", ")} once it is made.`)
  if (brief.finish?.state === "done") {
    const failed = brief.finish.languages.filter((one) => one.error)
    for (const one of failed) lines.push(`The ${one.language} copy could not be started: ${one.error}`)
  }
  if (!lines.length) return null
  return <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{lines.join(" ")}</p>
}

function EditableScene({
  scene,
  number,
  invalid,
  pictureCents,
  voiceCents,
  disabled,
  onChange,
  onRemove,
}: {
  scene: DraftScene
  number: number
  invalid: "words" | "picture" | null
  pictureCents: number
  voiceCents: number
  disabled: boolean
  onChange: (patch: Partial<SceneDraft>) => void
  onRemove: () => void
}) {
  const id = `brief-scene-${scene.id}`
  return (
    <section className="grid gap-3 rounded-lg border p-3" aria-label={`Scene ${number}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Scene {number}</span>
        <span className="flex-1 text-sm text-muted-foreground tabular-nums">
          Picture {formatCents(pictureCents)} · Voice {dollars(voiceCents)}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove scene ${number}`}
              disabled={disabled}
              onClick={onRemove}
            >
              <Trash2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove this scene</TooltipContent>
        </Tooltip>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-words`}>Words</Label>
        <Textarea
          id={`${id}-words`}
          rows={1}
          maxLength={SCENE_WORDS_MAX}
          value={scene.words}
          disabled={disabled}
          aria-invalid={invalid === "words" || undefined}
          onChange={(event) => onChange({ words: event.target.value })}
        />
        <LengthCounter length={scene.words.length} max={SCENE_WORDS_MAX} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-picture`}>Picture</Label>
        <Textarea
          id={`${id}-picture`}
          rows={1}
          maxLength={SCENE_PICTURE_MAX}
          value={scene.picture}
          disabled={disabled}
          aria-invalid={invalid === "picture" || undefined}
          onChange={(event) => onChange({ picture: event.target.value })}
        />
        <LengthCounter length={scene.picture.length} max={SCENE_PICTURE_MAX} />
      </div>
      <NumberField
        id={`${id}-seconds`}
        label="Seconds"
        value={scene.seconds}
        min={1}
        max={SCENE_SECONDS_MAX}
        disabled={disabled}
        className="sm:max-w-40"
        onChange={(seconds) => onChange({ seconds })}
      />
    </section>
  )
}
