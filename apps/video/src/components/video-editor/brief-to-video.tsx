import * as React from "react"
import {
  FileTextIcon,
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
import { Input } from "@/components/ui/input"
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
import { useEditorLock, useEditorRuntime } from "@/components/video-editor/editor-store"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import { useProjectSettings } from "@/components/video-editor/project-settings-context"
import { ScriptCheckList } from "@/components/video-editor/script-check-results"
import {
  getAiToolErrorMessage,
  loadVoiceDefaults,
  loadVoices,
  type AiToolsAvailability,
  type Voice,
} from "@/lib/api/video/ai-tools"
import {
  getBriefErrorMessage,
  listBriefs,
  retryBriefScene,
  saveBriefScenes,
  settleBriefScenes,
  startBrief,
  writeBrief,
  type BriefItem,
} from "@/lib/api/video/briefs"
import { plural } from "@/lib/format/plural"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import {
  briefScriptCostCents,
  formatAiEstimate,
  withEstimate,
} from "@/lib/video/ai-estimates"
import { WRITERS } from "@/lib/video/ai-choices"
import { IMAGE_MODELS, type GeminiImageModelId } from "@/lib/video/asset-factories"
import {
  BRIEF_ABOUT_MAX,
  BRIEF_AUDIENCE_MAX,
  BRIEF_BUSY_MESSAGE,
  BRIEF_DEFAULT_PICTURE_MODEL,
  BRIEF_NO_ABOUT_MESSAGE,
  BRIEF_NO_SCENES_MESSAGE,
  BRIEF_PLATFORMS,
  BRIEF_SCENES_MAX,
  SCENE_PICTURE_MAX,
  SCENE_SECONDS_MAX,
  SCENE_WORDS_MAX,
  briefLengthRange,
  landBriefScenes,
  platformFor,
  scenePictureCents,
  sceneVoiceCents,
  storyboardCents,
  totalSeconds,
  type BriefPlatform,
  type BriefVoice,
  type SceneDraft,
} from "@/lib/video/brief"
import { formatCents, isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { showErrorToast } from "@/lib/toast/error-toast"
import { editorId } from "@/lib/video/timeline-utils"
import {
  createDefaultVoiceSettings,
  VOICE_MODELS,
  type VoiceModelId,
} from "@/lib/video/voice"

/**
 * Brief to video (`workspace/docs/brief-to-video.md`): the brief window, the
 * storyboard it turns into, and the part of the editor that lays made scenes
 * on the timeline. The provider keeps the project's briefs, asks again while
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
  const { store, dispatch, projectId } = useEditorRuntime()
  const { refreshSpend } = useProjectSettings()
  const lock = useEditorLock()
  const [briefs, setBriefs] = React.useState<BriefItem[] | null>(null)
  // Landings this window has started, so a later answer that still lists the
  // same scenes as waiting never lays them twice.
  const landing = React.useRef(new Set<string>())

  React.useEffect(() => {
    let active = true
    listBriefs(projectId)
      .then((loaded) => {
        if (active) setBriefs(loaded.briefs)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [projectId])

  // While a brief is being made, or has made scenes waiting to land, ask again.
  const busy = briefs?.some(waiting) ?? false
  React.useEffect(() => {
    if (!busy) return
    let active = true
    const timer = setInterval(() => {
      listBriefs(projectId)
        .then((loaded) => {
          if (active) setBriefs(loaded.briefs)
        })
        .catch(() => undefined)
    }, BRIEF_RECHECK_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [busy, projectId])

  // Made scenes land here when this window can save. The server is told
  // first, so the worker cannot lay the same scenes in the same moment; only
  // then do they go on the timeline, as one Undo step. A read-only window
  // leaves them to the worker.
  React.useEffect(() => {
    if (lock || !briefs) return
    for (const brief of briefs) {
      if (!brief.landing || !brief.scenes.some((scene) => scene.state === "made")) continue
      const landed = landBriefScenes(
        store.getSnapshot().state.tracks,
        { scenes: brief.scenes, landing: brief.landing },
        editorId
      )
      if (!landed?.placed.length) continue
      const key = `${brief.id}:${landed.placed.join(",")}`
      if (landing.current.has(key)) continue
      landing.current.add(key)
      const placed = new Set(landed.placed)
      settleBriefScenes({ briefId: brief.id, sceneIds: landed.placed, lanes: landed.landing.lanes })
        .then(({ settled }) => {
          if (!settled) return
          dispatch({ type: "LAND_BRIEF_SCENES", scenes: brief.scenes, landing: landed.landing })
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
  }, [briefs, lock, store, dispatch, refreshSpend])

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

/**
 * The Brief window. It opens on the newest brief's storyboard when the
 * project has one, and on a new brief otherwise.
 */
export function BriefDialog({
  open,
  onOpenChange,
  available,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  available: AiToolsAvailability | null
}) {
  const briefs = useBriefs()
  const [view, setView] = React.useState<{ briefId: string } | "new" | null>(null)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setView(null)
  }
  if (!briefs || !open) return null
  const shown =
    view === "new"
      ? null
      : (briefs.briefs?.find((brief) => brief.id === view?.briefId) ?? briefs.briefs?.[0] ?? null)

  if (!shown) {
    return (
      <NewBriefDialog
        available={available}
        onClose={() => onOpenChange(false)}
        onWritten={(brief) => {
          briefs.replace(brief)
          setView({ briefId: brief.id })
        }}
      />
    )
  }
  return (
    <StoryboardDialog
      key={shown.id}
      brief={shown}
      briefs={briefs.briefs ?? []}
      onPick={(briefId) => setView({ briefId })}
      onNew={() => setView("new")}
      onClose={() => onOpenChange(false)}
    />
  )
}

/** The voice list, opened on the voice this app usually speaks in. */
function useBriefVoices() {
  const [voices, setVoices] = React.useState<Voice[] | null>(null)
  const [refused, setRefused] = React.useState(false)
  const [voiceId, setVoiceId] = React.useState("")
  const [modelId, setModelId] = React.useState<VoiceModelId>("eleven_multilingual_v2")
  const [settings, setSettings] = React.useState(createDefaultVoiceSettings)

  React.useEffect(() => {
    let active = true
    Promise.all([loadVoices(), loadVoiceDefaults().catch(() => null)])
      .then(([loaded, remembered]) => {
        if (!active) return
        setVoices(loaded)
        const known = remembered && loaded.some((voice) => voice.id === remembered.voiceId)
        setVoiceId(known ? remembered.voiceId : (loaded[0]?.id ?? ""))
        if (known) {
          const start = createDefaultVoiceSettings()
          setModelId(remembered.modelId)
          setSettings({
            ...start,
            speed: remembered.speed,
            stability: remembered.stability ?? start.stability,
            styleExaggeration: remembered.styleExaggeration ?? start.styleExaggeration,
          })
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        setRefused(true)
        showErrorToast(getAiToolErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [])

  const chosen = voices?.find((voice) => voice.id === voiceId)
  const voice: BriefVoice | null = chosen
    ? { id: chosen.id, name: chosen.name, speaker: chosen.speaker, modelId, settings }
    : null
  return { voices, loading: voices === null && !refused, voiceId, setVoiceId, modelId, setModelId, voice }
}

function NewBriefDialog({
  available,
  onClose,
  onWritten,
}: {
  available: AiToolsAvailability | null
  onClose: () => void
  onWritten: (brief: BriefItem) => void
}) {
  const { projectId } = useEditorRuntime()
  const { project, refreshSpend } = useProjectSettings()
  const reportError = useReportError()
  const voices = useBriefVoices()
  const [about, setAbout] = React.useState("")
  const [audience, setAudience] = React.useState("")
  const [platform, setPlatform] = React.useState<BriefPlatform>("shorts")
  const [lengthSeconds, setLengthSeconds] = React.useState(45)
  const [pictureModel, setPictureModel] = React.useState<GeminiImageModelId>(BRIEF_DEFAULT_PICTURE_MODEL)
  const [aboutInvalid, setAboutInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const range = briefLengthRange(platform)
  const writer = WRITERS.find((one) => one.id === available?.writer)
  const scriptCents = writer
    ? briefScriptCostCents({
        writer: writer.id,
        lengthSeconds,
        briefCharacters: about.length + audience.length,
      })
    : null
  const isOpenAi = voices.voice?.speaker === "openai"

  async function submit() {
    if (!about.trim()) {
      setAboutInvalid(true)
      showErrorToast(BRIEF_NO_ABOUT_MESSAGE)
      return
    }
    if (!voices.voice) {
      showErrorToast("Pick a voice first")
      return
    }
    setBusy(true)
    try {
      const brief = await writeBrief({
        projectId,
        about: about.trim(),
        audience: audience.trim(),
        lengthSeconds,
        platform,
        voice: voices.voice,
        pictureModel,
      })
      refreshSpend()
      onWritten(brief)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open dirty={!!about.trim() || !!audience.trim()} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Brief to video</DialogTitle>
            <DialogDescription>
              The script is written and cut into scenes first. Every scene&apos;s
              price shows on the storyboard before anything is made.
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
                  <CardTitle>The brief</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="brief-about">What it is about</Label>
                    <Textarea
                      id="brief-about"
                      rows={1}
                      maxLength={BRIEF_ABOUT_MAX}
                      value={about}
                      disabled={busy}
                      aria-invalid={aboutInvalid || undefined}
                      placeholder="Why bread goes stale, and how to stop it"
                      onChange={(event) => {
                        setAbout(event.target.value)
                        setAboutInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="brief-audience">Who it is for</Label>
                    <Input
                      id="brief-audience"
                      maxLength={BRIEF_AUDIENCE_MAX}
                      value={audience}
                      disabled={busy}
                      placeholder="Home bakers"
                      onChange={(event) => setAudience(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="brief-platform">Platform</Label>
                      <Select
                        value={platform}
                        disabled={busy}
                        onValueChange={(next) => {
                          if (!next) return
                          const picked = next as BriefPlatform
                          setPlatform(picked)
                          setLengthSeconds((current) => Math.min(current, briefLengthRange(picked).max))
                        }}
                      >
                        <SelectTrigger id="brief-platform" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BRIEF_PLATFORMS.map((one) => (
                            <SelectItem key={one.id} value={one.id}>
                              {one.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <NumberField
                      id="brief-length"
                      label="Length in seconds"
                      hint={`${range.min} to ${range.max.toLocaleString()} seconds on ${platformFor(platform).label}.`}
                      value={lengthSeconds}
                      min={range.min}
                      max={range.max}
                      disabled={busy}
                      onChange={setLengthSeconds}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>How it is made</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="brief-voice">Voice</Label>
                    <Select
                      value={voices.voiceId}
                      onValueChange={(next) => {
                        if (next) voices.setVoiceId(next)
                      }}
                      disabled={busy || !voices.voices?.length}
                    >
                      <SelectTrigger id="brief-voice" className="w-full">
                        <SelectValue placeholder={voices.loading ? "Fetching voices…" : "No voices"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(voices.voices ?? []).map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                            {voice.yours ? " (yours)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!isOpenAi ? (
                    <div className="grid gap-2">
                      <Label htmlFor="brief-voice-model">Voice quality</Label>
                      <Select
                        value={voices.modelId}
                        disabled={busy}
                        onValueChange={(next) => {
                          if (next) voices.setModelId(next as VoiceModelId)
                        }}
                      >
                        <SelectTrigger id="brief-voice-model" className="w-full">
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
                  <div className="grid gap-2">
                    <Label htmlFor="brief-picture-model">Picture model</Label>
                    <Select
                      value={pictureModel}
                      disabled={busy}
                      onValueChange={(next) => {
                        if (next) setPictureModel(next as GeminiImageModelId)
                      }}
                    >
                      <SelectTrigger id="brief-picture-model" className="w-full sm:w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMAGE_MODELS.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label} · {formatCents(aiUnitCostCents(item.id, 1))} a picture
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {project.look?.style
                      ? `Every picture is made in the project's look: "${project.look.style}".`
                      : "This project has no look, so each picture follows its own direction. Set one in the project's Settings to keep every scene alike."}
                  </p>
                </CardContent>
              </Card>
              <p className="text-sm text-muted-foreground">
                {writer
                  ? `Writing the script and checking it costs ${formatAiEstimate(scriptCents ?? 0)} with ${writer.label}.`
                  : available
                    ? "Writing the script needs a Gemini, OpenAI or Anthropic key in Settings → AI."
                    : null}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || voices.loading}>
                {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                {busy ? "Writing…" : withEstimate("Write the script", scriptCents)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
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
 * Make it is pressed it shows where each scene is up to instead.
 */
function StoryboardDialog({
  brief,
  briefs,
  onPick,
  onNew,
  onClose,
}: {
  brief: BriefItem
  briefs: BriefItem[]
  onPick: (briefId: string) => void
  onNew: () => void
  onClose: () => void
}) {
  const { store, saveNow, clock } = useEditorRuntime()
  const { refreshSpend } = useProjectSettings()
  const context = useBriefs()
  const reportError = useReportError()
  const editable = brief.status === "draft"
  const [scenes, setScenes] = React.useState<DraftScene[]>(() =>
    brief.scenes.map(({ id, words, picture, seconds }) => ({ id, words, picture, seconds }))
  )
  const [edited, setEdited] = React.useState(false)
  const [invalid, setInvalid] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [retrying, setRetrying] = React.useState<string | null>(null)

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

  const shownScenes = editable ? scenes : brief.scenes
  const totalCents = storyboardCents(shownScenes, brief.voice, brief.picture_model)
  const seconds = totalSeconds(shownScenes)
  const pictureCents = scenePictureCents(brief.picture_model)
  const platform = platformFor(brief.platform)
  const pictureModel = IMAGE_MODELS.find((item) => item.id === brief.picture_model)?.label ?? brief.picture_model
  const making = brief.status === "making"
  const firstWaiting = making ? brief.scenes.findIndex((scene) => scene.state === "queued") : -1

  return (
    <FormDialog open dirty={false} busy={starting} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{brief.title}</DialogTitle>
            <DialogDescription>
              {editable
                ? "Nothing has been made or charged for the scenes yet. Change anything, then press Make it."
                : brief.status === "done"
                  ? "Every scene is on the timeline. Right-click a scene's picture or voice there to make it again."
                  : brief.status === "stopped"
                    ? stoppedLine(brief)
                    : "The scenes are being made one after another. Each lands on the timeline when it is ready."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The brief</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {briefs.length > 1 ? (
                  <div className="grid gap-2">
                    <Label htmlFor="brief-pick">Brief</Label>
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
                            {item.title}, {new Date(item.created_at).toLocaleDateString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <p className="text-sm [overflow-wrap:anywhere]">{brief.about}</p>
                <p className="text-sm text-muted-foreground">
                  {brief.length_seconds} seconds on {platform.label}
                  {brief.audience ? `, for ${brief.audience.toLowerCase()}` : ""}. Read by{" "}
                  {brief.voice.name}, pictures by {pictureModel}.
                </p>
                <p className="text-sm text-muted-foreground">
                  The scenes add up to {Math.round(seconds)} seconds, against the{" "}
                  {brief.length_seconds} asked. The reading decides the real length.
                </p>
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
                        <p className="text-sm [overflow-wrap:anywhere]">{scene.words}</p>
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
                  {formatCents(pictureCents)} and the voice by the character.
                </p>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            {!making ? (
              <Button type="button" variant="ghost" className="mr-auto" disabled={starting} onClick={onNew}>
                <FileTextIcon />
                New brief
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled={starting} onClick={requestClose}>
              Done
            </Button>
            {editable ? (
              <Button type="button" disabled={starting} onClick={() => void make()}>
                {starting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                Make it · {dollars(totalCents)}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
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
