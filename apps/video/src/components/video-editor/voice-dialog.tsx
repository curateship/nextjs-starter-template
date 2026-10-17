import * as React from "react"
import { ListChecksIcon, Loader2Icon, MicIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  checkVoiceScript,
  getAiToolErrorMessage,
  loadVoiceDefaults,
  loadVoices,
  readAloud,
  rememberVoice,
  type AiToolsAvailability,
  type ScriptCheck,
  type Voice,
} from "@/lib/api/video/ai-tools"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import {
  CAPTION_ANIMATIONS,
  resolveCaptionAnimation,
} from "@/lib/video/caption-animations"
import { DEFAULT_CAPTION_LOOK, type CaptionLook } from "@/lib/video/caption-look"
import { SCRIPT_CHECK_NO_TEXT_MESSAGE } from "@/lib/video/script-check"
import {
  voiceoverClips,
  voiceoverRefusal,
} from "@/lib/video/saved-voiceovers"
import {
  createDefaultVoiceSettings,
  VOICE_MODELS,
  VOICE_SPEED_MAX,
  VOICE_NO_TEXT_MESSAGE,
  VOICE_NO_VOICE_MESSAGE,
  VOICE_SPEED_MIN,
  VOICE_TEXT_MAX,
  type VoiceModelId,
} from "@/lib/video/voice"
import {
  countPauses,
  followsDirections,
  hasTags,
  pauseMark,
  pauseSecondsTotal,
  spokenScript,
  VOICE_PAUSE_SECONDS,
  VOICE_TAG_EXAMPLES,
  voicePausesRefusal,
} from "@/lib/video/voice-direction"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import {
  ScriptCheckList,
  ScriptFigures,
} from "@/components/video-editor/script-check-results"

/**
 * Having something read aloud.
 *
 * What comes back is the sound and the words as they are said, so both go on
 * the timeline together: the voice on its own lane and the captions above it,
 * already lined up. One action, so one press of undo removes the lot.
 *
 * Before it is read, the script can be checked: how long it runs is always
 * shown under the box, and "Check it" reads it against a short checklist.
 * Checking is never required to read aloud.
 *
 * The script can carry directions: a tag such as [whispering] before a
 * phrase, and pauses from the pause button. Both are turned into what the
 * chosen model understands on the server (`voice-direction.ts`); the run
 * length and the check only ever see the words that are said.
 */
export function VoiceDialog({
  open,
  onOpenChange,
  available,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which writer would check the script, for the price shown. */
  available: AiToolsAvailability | null
}) {
  const { store, dispatch, projectId } = useEditorRuntime()
  const [script, setScript] = React.useState("")
  const [voices, setVoices] = React.useState<Voice[] | null>(null)
  const [voiceId, setVoiceId] = React.useState("")
  const [modelId, setModelId] = React.useState<VoiceModelId>(
    "eleven_multilingual_v2"
  )
  const [speed, setSpeed] = React.useState(1)
  const [stability, setStability] = React.useState(
    () => createDefaultVoiceSettings().stability
  )
  const [style, setStyle] = React.useState(
    () => createDefaultVoiceSettings().styleExaggeration
  )
  const [pauseLength, setPauseLength] = React.useState("1")
  const scriptRef = React.useRef<HTMLTextAreaElement>(null)
  // The remembered voice is put in place on the first open only. Later opens
  // fetch the list again, so a voice made in the Voices panel since shows up,
  // without undoing what was picked in this session.
  const rememberedApplied = React.useRef(false)
  // The captions that come with the voice take the standard look. Only the
  // entrance is offered here; the rest can be changed per caption afterwards.
  const [look, setLook] = React.useState<CaptionLook>(DEFAULT_CAPTION_LOOK)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setLook(DEFAULT_CAPTION_LOOK)
  }
  const [speaking, setSpeaking] = React.useState(false)
  const [voicesRefused, setVoicesRefused] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  // The last check, with the script and speed it was made on, so an edit
  // since can be pointed out instead of the old answer passing as current.
  const [checked, setChecked] = React.useState<{
    script: string
    speed: number
    result: ScriptCheck
  } | null>(null)
  // Nothing to keep in step: it is fetching exactly while the window is open,
  // no voices are in hand, and nothing has gone wrong yet.
  const loadingVoices = open && voices === null && !voicesRefused

  // The voices are asked for when the window opens, not before: it is a call
  // to somebody else's server, and most sessions never open this at all. The
  // remembered choice comes back at the same time, so the window opens on the
  // voice this app usually speaks in.
  React.useEffect(() => {
    if (!open) return
    let active = true
    Promise.all([loadVoices(), loadVoiceDefaults().catch(() => null)])
      .then(([loaded, remembered]) => {
        if (!active) return
        setVoices(loaded)
        setVoicesRefused(false)
        if (rememberedApplied.current) {
          // Keep the pick, unless that voice has since been deleted.
          setVoiceId((current) =>
            loaded.some((voice) => voice.id === current)
              ? current
              : (loaded[0]?.id ?? "")
          )
          return
        }
        rememberedApplied.current = true
        const known = remembered
          ? loaded.some((voice) => voice.id === remembered.voiceId)
          : false
        setVoiceId((current) => {
          if (current) return current
          return known && remembered ? remembered.voiceId : (loaded[0]?.id ?? "")
        })
        if (known && remembered) {
          const start = createDefaultVoiceSettings()
          setModelId(remembered.modelId)
          setSpeed(remembered.speed)
          setStability(remembered.stability ?? start.stability)
          setStyle(remembered.styleExaggeration ?? start.styleExaggeration)
        }
      })
      .catch((error) => {
        if (!active) return
        setVoicesRefused(true)
        showErrorToast(getAiToolErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [open])

  const chosen = voices?.find((one) => one.id === voiceId)
  const isOpenAi = chosen?.speaker === "openai"
  const directed = !isOpenAi && followsDirections(modelId)
  const spoken = spokenScript(script)
  const pauses = countPauses(script)
  const pauseTotal = pauseSecondsTotal(script)
  const pausesRefusal = voicePausesRefusal(script)
  const tagsDropped = hasTags(script) && !directed

  /** Puts a pause where the cursor is, with a space either side. */
  function addPause() {
    const box = scriptRef.current
    const start = box?.selectionStart ?? script.length
    const end = box?.selectionEnd ?? script.length
    const before = script.slice(0, start)
    const after = script.slice(end)
    const mark = pauseMark(Number(pauseLength))
    const insert =
      (before && !/\s$/.test(before) ? " " : "") +
      mark +
      (after && !/^\s/.test(after) ? " " : "")
    const next = before + insert + after
    if (next.length > VOICE_TEXT_MAX) {
      showErrorToast(
        `The script is at its ${VOICE_TEXT_MAX.toLocaleString()} character limit, so there is no room for a pause.`
      )
      return
    }
    setScript(next)
    const caret = before.length + insert.length
    requestAnimationFrame(() => {
      box?.focus()
      box?.setSelectionRange(caret, caret)
    })
  }

  async function check() {
    if (!spoken) {
      showErrorToast(SCRIPT_CHECK_NO_TEXT_MESSAGE)
      return
    }
    setChecking(true)
    try {
      // The checklist is about the words, so the directions stay out of it.
      const result = await checkVoiceScript(spoken, speed, projectId)
      dismissErrorToast()
      setChecked({ script, speed, result })
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setChecking(false)
    }
  }

  async function speak() {
    if (!spoken) {
      showErrorToast(VOICE_NO_TEXT_MESSAGE)
      return
    }
    if (pausesRefusal) {
      showErrorToast(pausesRefusal)
      return
    }
    const voice = voices?.find((one) => one.id === voiceId)
    if (!voice) {
      showErrorToast(VOICE_NO_VOICE_MESSAGE)
      return
    }
    setSpeaking(true)
    try {
      const result = await readAloud({
        voiceId,
        voiceName: voice.name,
        modelId,
        text: script,
        projectId,
        settings: {
          ...createDefaultVoiceSettings(),
          speed,
          stability,
          styleExaggeration: style,
        },
      })
      const refusal = voiceoverRefusal(
        store.getSnapshot().state.tracks,
        result.captions
      )
      if (refusal) {
        // It was read and paid for, so say where it went.
        showErrorToast(`${refusal} The voiceover is saved in the Voices panel.`)
        return
      }
      dispatch({ type: "INSERT_VOICEOVER", ...voiceoverClips(result, 0, look) })
      dismissErrorToast()
      toast.success(
        `Read aloud, with ${result.captions.length} ${plural(result.captions.length, "caption", "captions")}. Undo removes it.`
      )
      onOpenChange(false)
      setScript("")
      setChecked(null)
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setSpeaking(false)
    }
  }

  async function remember() {
    const voice = voices?.find((one) => one.id === voiceId)
    if (!voice) return
    try {
      await rememberVoice({
        speaker: voice.speaker,
        voiceId: voice.id,
        voiceName: voice.name,
        modelId,
        speed,
        stability,
        styleExaggeration: style,
      })
      toast.success("This is the voice this app speaks in now.")
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Read this aloud</DialogTitle>
          <DialogDescription>
            The voice goes on its own lane, with the words above it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>What to say</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Textarea
                ref={scriptRef}
                id="voice-script"
                aria-label="What to say"
                aria-invalid={pausesRefusal ? true : undefined}
                rows={1}
                value={script}
                maxLength={VOICE_TEXT_MAX}
                placeholder="Type or paste the script…"
                onChange={(event) => setScript(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Select value={pauseLength} onValueChange={setPauseLength}>
                  <SelectTrigger
                    aria-label="How long the pause is"
                    className="w-auto"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_PAUSE_SECONDS.map((seconds) => (
                      <SelectItem key={seconds} value={String(seconds)}>
                        {seconds} {seconds === 1 ? "second" : "seconds"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={addPause}>
                  <PlusIcon />
                  Add a pause
                </Button>
              </div>
              <div className="grid gap-1 text-sm text-muted-foreground">
                <p>
                  Write {VOICE_TAG_EXAMPLES.join(", ")} or another word in
                  square brackets before a phrase to direct how it is said.
                </p>
                {pauses ? (
                  <p className="tabular-nums">
                    {pauses} {plural(pauses, "pause", "pauses")},{" "}
                    {pauseTotal} {plural(pauseTotal, "second", "seconds")} in
                    all
                    {directed
                      ? ". Eleven v3 and v4 take a pause as a beat and time it themselves."
                      : "."}
                  </p>
                ) : null}
                {pausesRefusal ? (
                  <p className="text-destructive">{pausesRefusal}</p>
                ) : null}
                {tagsDropped ? (
                  <p>
                    {isOpenAi
                      ? "OpenAI voices do not follow tags, so they are left out when it is read."
                      : "Only Eleven v3 and v4 follow tags. With this quality they are left out when it is read."}
                  </p>
                ) : null}
              </div>
              <ScriptFigures
                script={spoken}
                speed={speed}
                available={available}
              />
              {checked ? (
                <ScriptCheckList
                  result={checked.result}
                  stale={checked.script !== script || checked.speed !== speed}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>How it sounds</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="voice-who">Voice</Label>
                <Select
                  value={voiceId}
                  onValueChange={setVoiceId}
                  disabled={!voices?.length}
                >
                  <SelectTrigger id="voice-who" className="w-full">
                    <SelectValue
                      placeholder={
                        loadingVoices ? "Fetching voices…" : "No voices"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(voices ?? []).map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name}
                        {voice.yours ? " (yours)" : ""}
                        {voice.description ? ` — ${voice.description}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {available?.voice && voices && !voices.some((one) => one.yours) ? (
                  <p className="text-sm text-muted-foreground">
                    Make a voice of your own in the Voices panel on the left.
                  </p>
                ) : null}
              </div>

              {/* Quality is an ElevenLabs choice; the other voices have one
                  setting and asking about it would be noise. */}
              {!isOpenAi ? (
              <div className="grid gap-2">
                <Label htmlFor="voice-model">Quality</Label>
                <Select
                  value={modelId}
                  onValueChange={(next) => setModelId(next as VoiceModelId)}
                >
                  <SelectTrigger id="voice-model" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label} — {model.note}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              ) : null}

              <div className="grid gap-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor="voice-speed">Speed</Label>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {speed.toFixed(2)}×
                  </span>
                </div>
                <Slider
                  id="voice-speed"
                  min={VOICE_SPEED_MIN}
                  max={VOICE_SPEED_MAX}
                  step={0.05}
                  value={[speed]}
                  onValueChange={([next]) => setSpeed(next)}
                />
              </div>

              {/* ElevenLabs' stability and style. OpenAI has neither. */}
              {!isOpenAi ? (
                <>
                  <div className="grid gap-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <FieldLabel
                        htmlFor="voice-steadiness"
                        hint="Low is livelier and changes from one read to the next. High is even and flat. Eleven v3 and v4 take only low, middle or high, so they round it."
                      >
                        Steadiness
                      </FieldLabel>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {stability.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      id="voice-steadiness"
                      min={0}
                      max={1}
                      step={0.05}
                      value={[stability]}
                      onValueChange={([next]) => setStability(next)}
                    />
                  </div>
                  <div className="grid gap-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <Label htmlFor="voice-expressiveness">
                        Expressiveness
                      </Label>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {style.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      id="voice-expressiveness"
                      aria-describedby="voice-expressiveness-warning"
                      min={0}
                      max={1}
                      step={0.05}
                      value={[style]}
                      onValueChange={([next]) => setStyle(next)}
                    />
                    <p
                      id="voice-expressiveness-warning"
                      className="text-sm text-muted-foreground"
                    >
                      How much it acts. ElevenLabs says more of it is "more
                      prone to hallucinations": words or sounds that were not
                      in the script.
                    </p>
                  </div>
                </>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="voice-entrance">How the words arrive</Label>
                <Select
                  value={look.animation}
                  onValueChange={(next) =>
                    setLook((current) => ({
                      ...current,
                      animation: resolveCaptionAnimation(next),
                    }))
                  }
                >
                  <SelectTrigger id="voice-entrance" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAPTION_ANIMATIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label} — {option.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            disabled={!voiceId}
            onClick={() => void remember()}
            title="Open on this voice next time"
          >
            Make this the usual voice
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={checking}
            onClick={() => void check()}
          >
            {checking ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <ListChecksIcon />
            )}
            {checking ? "Checking…" : "Check it"}
          </Button>
          {/* Waiting on the voices is loading, not idle. */}
          <Button
            type="button"
            disabled={speaking || loadingVoices}
            onClick={() => void speak()}
          >
            {speaking ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <MicIcon />
            )}
            {speaking ? "Reading…" : "Read it aloud"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
