import * as React from "react"
import { Loader2Icon, MicIcon } from "lucide-react"
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
  getAiToolErrorMessage,
  loadVoiceDefaults,
  loadVoices,
  readAloud,
  rememberVoice,
  type Voice,
} from "@/lib/api/video/ai-tools"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import {
  CAPTION_ANIMATIONS,
  DEFAULT_CAPTION_ANIMATION,
  resolveCaptionAnimation,
  type CaptionAnimationId,
} from "@/lib/video/caption-animations"
import { CAPTION_DEFAULTS, captionClipName } from "@/lib/video/captions"
import { editorId } from "@/lib/video/timeline-utils"
import {
  createDefaultVoiceSettings,
  VOICE_MODELS,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  VOICE_TEXT_MAX,
  type VoiceModelId,
} from "@/lib/video/voice"
import { useEditorRuntime } from "@/components/video-editor/editor-store"

/**
 * Having something read aloud.
 *
 * What comes back is the sound and the words as they are said, so both go on
 * the timeline together: the voice on its own lane and the captions above it,
 * already lined up. One action, so one press of undo removes the lot.
 */
export function VoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch } = useEditorRuntime()
  const [script, setScript] = React.useState("")
  const [voices, setVoices] = React.useState<Voice[] | null>(null)
  const [voiceId, setVoiceId] = React.useState("")
  const [modelId, setModelId] = React.useState<VoiceModelId>(
    "eleven_multilingual_v2"
  )
  const [speed, setSpeed] = React.useState(1)
  const [entrance, setEntrance] = React.useState<CaptionAnimationId>(
    DEFAULT_CAPTION_ANIMATION
  )
  const [speaking, setSpeaking] = React.useState(false)
  const [voicesRefused, setVoicesRefused] = React.useState(false)
  // Nothing to keep in step: it is fetching exactly while the window is open,
  // no voices are in hand, and nothing has gone wrong yet.
  const loadingVoices = open && voices === null && !voicesRefused

  // The voices are asked for when the window opens, not before: it is a call
  // to somebody else's server, and most sessions never open this at all. The
  // remembered choice comes back at the same time, so the window opens on the
  // voice this app usually speaks in.
  React.useEffect(() => {
    if (!open || voices !== null) return
    let active = true
    Promise.all([loadVoices(), loadVoiceDefaults().catch(() => null)])
      .then(([loaded, remembered]) => {
        if (!active) return
        setVoices(loaded)
        const known = remembered
          ? loaded.some((voice) => voice.id === remembered.voiceId)
          : false
        setVoiceId((current) => {
          if (current) return current
          return known && remembered ? remembered.voiceId : (loaded[0]?.id ?? "")
        })
        if (known && remembered) {
          setModelId(remembered.modelId)
          setSpeed(remembered.speed)
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
  }, [open, voices])

  async function speak() {
    setSpeaking(true)
    try {
      const result = await readAloud({
        voiceId,
        modelId,
        text: script,
        settings: { ...createDefaultVoiceSettings(), speed },
      })
      dispatch({
        type: "INSERT_VOICEOVER",
        audio: {
          id: editorId(),
          kind: "audio",
          name: result.name,
          mediaId: result.mediaId,
          url: result.url,
          startMs: 0,
          durationMs: result.durationMs,
          trimStartMs: 0,
          sourceDurationMs: result.durationMs,
        },
        captions: result.captions.map((line) => ({
          id: editorId(),
          kind: "text" as const,
          name: captionClipName(line.text),
          text: line.text,
          fontId: "inter" as const,
          animation: entrance,
          startMs: line.startMs,
          durationMs: line.endMs - line.startMs,
          trimStartMs: 0,
          fontSize: CAPTION_DEFAULTS.fontSize,
          color: CAPTION_DEFAULTS.color,
          highlightColor: CAPTION_DEFAULTS.backgroundColor,
          x: CAPTION_DEFAULTS.x,
          y: CAPTION_DEFAULTS.y,
        })),
      })
      dismissErrorToast()
      toast.success(
        `Read aloud, with ${result.captions.length} ${plural(result.captions.length, "caption", "captions")}. Undo removes it.`
      )
      onOpenChange(false)
      setScript("")
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
      })
      toast.success("This is the voice this app speaks in now.")
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    }
  }

  const ready = !!script.trim() && !!voiceId && !speaking

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
            <CardContent>
              <Textarea
                id="voice-script"
                aria-label="What to say"
                rows={1}
                value={script}
                maxLength={VOICE_TEXT_MAX}
                placeholder="Type or paste the script…"
                onChange={(event) => setScript(event.target.value)}
              />
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
                        {voice.description ? ` — ${voice.description}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quality is an ElevenLabs choice; the other voices have one
                  setting and asking about it would be noise. */}
              {voices?.find((one) => one.id === voiceId)?.speaker !==
              "openai" ? (
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

              <div className="grid gap-2">
                <Label htmlFor="voice-entrance">How the words arrive</Label>
                <Select
                  value={entrance}
                  onValueChange={(next) =>
                    setEntrance(resolveCaptionAnimation(next))
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
          <Button type="button" disabled={!ready} onClick={() => void speak()}>
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
