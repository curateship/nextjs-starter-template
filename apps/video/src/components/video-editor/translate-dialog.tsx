import * as React from "react"
import { CaptionsIcon, LanguagesIcon, Loader2Icon, MicIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getAiToolErrorMessage,
  loadVoiceDefaults,
  loadVoices,
  speakTranslation,
  translateCaptionLines,
  writeCaptions,
  type AiToolsAvailability,
  type CaptionsResult,
  type Voice,
} from "@/lib/api/video/ai-tools"
import { AiChoiceField } from "@/components/video-editor/ai-choice-field"
import {
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { useSavedCaptionLook } from "@/components/video-editor/use-saved-caption-look"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import { captionClipStyle, type CaptionLook } from "@/lib/video/caption-look"
import { captionClipWordTimes } from "@/lib/video/caption-words"
import { captionClipName } from "@/lib/video/captions"
import { editorId, formatClock } from "@/lib/video/timeline-utils"
import {
  DEFAULT_TRANSLATE_LANGUAGE,
  TRANSLATE_LANGUAGES,
  TRANSLATE_LINE_MAX,
  TRANSLATE_NO_VOICE_MESSAGE,
  TRANSLATE_NOTHING_TO_SAY_MESSAGE,
  TRANSLATE_ORIGINAL_VOLUME,
  TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE,
  translationScript,
  type TranslateLanguage,
} from "@/lib/video/translate"
import { VOICE_TEXT_MAX } from "@/lib/video/voice"

/**
 * The project's talking, in another language.
 *
 * The talking is written down once, when the window first translates, and
 * kept while it stays open, so trying a second language pays for the
 * translation only. The translation is shown line by line to read and correct
 * before anything touches the timeline. Then it goes on as captions, or is read
 * aloud over the original with the original turned down. Either one is a single
 * press of undo.
 */

type TranslatedLine = {
  startMs: number
  endMs: number
  original: string
  text: string
}

type Busy = "translating" | "speaking"

export function TranslateDialog({
  open,
  onOpenChange,
  available,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  available: AiToolsAvailability | null
}) {
  const { projectId, dispatch, saveNow } = useEditorRuntime()
  const [look] = useSavedCaptionLook(open)
  const [language, setLanguage] = React.useState<TranslateLanguage>(
    DEFAULT_TRANSLATE_LANGUAGE
  )
  const [transcript, setTranscript] = React.useState<CaptionsResult | null>(
    null
  )
  const [lines, setLines] = React.useState<TranslatedLine[] | null>(null)
  const [translatedTo, setTranslatedTo] =
    React.useState<TranslateLanguage | null>(null)
  const [busy, setBusy] = React.useState<Busy | null>(null)
  const [voices, setVoices] = React.useState<Voice[] | null>(null)
  const [voiceId, setVoiceId] = React.useState("")
  // True once the voices came back, or came back as "no key".
  const [voicesAnswered, setVoicesAnswered] = React.useState(false)

  // Every opening starts clean: the timeline may have changed since.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setTranscript(null)
      setLines(null)
      setTranslatedTo(null)
    }
  }

  // Only ElevenLabs voices: the multilingual model is theirs. Asked for once a
  // translation is in hand, since until then nobody needs a voice. With an
  // ElevenLabs key the server hands back its voices or fails, so an answer
  // with none of theirs means that key is not saved. That also covers the
  // answer about keys never arriving.
  const translated = lines !== null
  const keyMissing =
    available?.voice === false ||
    (voices !== null && !voices.length && voicesAnswered)
  React.useEffect(() => {
    if (!open || !translated || available?.voice === false || voices !== null)
      return
    let active = true
    Promise.all([loadVoices(), loadVoiceDefaults().catch(() => null)])
      .then(([loaded, remembered]) => {
        if (!active) return
        const theirs = loaded.filter((voice) => voice.speaker === "elevenlabs")
        setVoices(theirs)
        setVoicesAnswered(true)
        const known = theirs.some((voice) => voice.id === remembered?.voiceId)
        setVoiceId(
          known && remembered ? remembered.voiceId : (theirs[0]?.id ?? "")
        )
      })
      .catch((error) => {
        if (!active) return
        setVoices([])
        // No voice key at all comes back as the missing-key sentence, which
        // the voice card already shows, so only other trouble is toasted.
        const noKey =
          error instanceof Error &&
          error.message === ELEVENLABS_KEY_MISSING_MESSAGE
        setVoicesAnswered(noKey)
        if (!noKey) showErrorToast(getAiToolErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [open, translated, available?.voice, voices])

  function close() {
    onOpenChange(false)
  }

  async function translate() {
    setBusy("translating")
    try {
      let heard = transcript
      if (!heard) {
        // The server reads the saved timeline, so anything still waiting to
        // be sent goes first.
        await saveNow()
        heard = await writeCaptions(projectId)
        setTranscript(heard)
      }
      const words = await translateCaptionLines(
        language,
        heard.captions.map((line) => line.text)
      )
      setLines(
        heard.captions.map((line, index) => ({
          startMs: line.startMs,
          endMs: line.endMs,
          original: line.text,
          text: words[index] ?? "",
        }))
      )
      setTranslatedTo(language)
      dismissErrorToast()
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function editLine(index: number, text: string) {
    setLines(
      (current) =>
        current &&
        current.map((line, at) => (at === index ? { ...line, text } : line))
    )
  }

  function addCaptions() {
    if (!lines || !look) return
    const captions = lines
      .filter((line) => line.text.trim())
      .map((line) =>
        captionClip(look, {
          text: line.text.trim(),
          startMs: line.startMs,
          durationMs: line.endMs - line.startMs,
        })
      )
    if (!captions.length) {
      showErrorToast(TRANSLATE_NOTHING_TO_SAY_MESSAGE)
      return
    }
    dispatch({ type: "INSERT_CAPTIONS", captions })
    dismissErrorToast()
    toast.success(
      `${captions.length} ${plural(captions.length, "caption", "captions")} in ${translatedTo} added. Undo takes them all back off.`
    )
    close()
  }

  async function speak() {
    if (!lines || !look || !transcript) return
    if (keyMissing) {
      showErrorToast(ELEVENLABS_KEY_MISSING_MESSAGE)
      return
    }
    const script = translationScript(lines)
    if (!script) {
      showErrorToast(TRANSLATE_NOTHING_TO_SAY_MESSAGE)
      return
    }
    if (script.length > VOICE_TEXT_MAX) {
      showErrorToast(TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE)
      return
    }
    if (!voiceId) {
      showErrorToast(TRANSLATE_NO_VOICE_MESSAGE)
      return
    }

    setBusy("speaking")
    try {
      const said = await speakTranslation(script, voiceId)
      // The new voice starts where the original talking starts, and its
      // captions follow it rather than the original's times.
      const startsAtMs = lines[0].startMs
      dispatch({
        type: "INSERT_VOICEOVER",
        audio: {
          id: editorId(),
          kind: "audio",
          name: said.name,
          mediaId: said.mediaId,
          url: said.url,
          startMs: startsAtMs,
          durationMs: said.durationMs,
          trimStartMs: 0,
          sourceDurationMs: said.durationMs,
        },
        captions: said.captions.map((line) => ({
          ...captionClip(look, {
            text: line.text,
            startMs: startsAtMs + line.startMs,
            durationMs: line.endMs - line.startMs,
          }),
          wordTimes: captionClipWordTimes(line),
          activeWordColor: captionClipStyle(look).activeWordColor,
        })),
        quieten: {
          clipId: transcript.source.clipId,
          volume: TRANSLATE_ORIGINAL_VOLUME,
        },
      })
      dismissErrorToast()
      toast.success(
        `Read aloud in ${translatedTo}, with the original turned down to ${Math.round(TRANSLATE_ORIGINAL_VOLUME * 100)}%. Undo puts it back.`
      )
      close()
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const changedLanguage = translated && translatedTo !== language

  return (
    <FormDialog
      open={open}
      // A translation has been paid for, so a stray click outside asks first.
      dirty={translated}
      busy={busy !== null}
      onClose={close}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Another language</DialogTitle>
            <DialogDescription>
              The talking on this project, translated. Read it and correct it
              here before it goes on the timeline.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Into</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="translate-language">Language</Label>
                  <Select
                    value={language}
                    onValueChange={(next) =>
                      setLanguage(next as TranslateLanguage)
                    }
                  >
                    <SelectTrigger
                      id="translate-language"
                      className="w-full sm:w-56"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSLATE_LANGUAGES.map((one) => (
                        <SelectItem key={one} value={one}>
                          {one}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {translated ? null : (
                  <>
                    <AiChoiceField kind="transcriber" available={available} />
                    <AiChoiceField kind="writer" available={available} />
                  </>
                )}
              </CardContent>
            </Card>

            {lines ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>
                    In {translatedTo}, {lines.length}{" "}
                    {plural(lines.length, "line", "lines")}
                  </CardTitle>
                  <CardDescription>
                    Each line keeps the time of the one it came from. Correct
                    any of them before using it.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {lines.map((line, index) => (
                    <div key={`${line.startMs}-${index}`} className="grid gap-2">
                      <Label
                        htmlFor={`translate-line-${index}`}
                        className="flex min-w-0 gap-2 font-normal text-muted-foreground"
                      >
                        <span className="shrink-0 tabular-nums">
                          {formatClock(line.startMs)}
                        </span>
                        <span className="truncate">{line.original}</span>
                      </Label>
                      <Input
                        id={`translate-line-${index}`}
                        value={line.text}
                        maxLength={TRANSLATE_LINE_MAX}
                        disabled={busy !== null}
                        onChange={(event) =>
                          editLine(index, event.target.value)
                        }
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {lines ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Read aloud in</CardTitle>
                  <CardDescription>
                    The voice goes on a lane of its own from where the talking
                    starts, with its own captions. The original stays and is
                    turned down to{" "}
                    {Math.round(TRANSLATE_ORIGINAL_VOLUME * 100)}%.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {!keyMissing ? (
                    <div className="grid gap-2">
                      <Label htmlFor="translate-voice">Voice</Label>
                      <Select
                        value={voiceId}
                        onValueChange={setVoiceId}
                        disabled={!voices?.length}
                      >
                        <SelectTrigger id="translate-voice" className="w-full">
                          <SelectValue
                            placeholder={
                              voices === null ? "Fetching voices…" : "No voices"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(voices ?? []).map((voice) => (
                            <SelectItem key={voice.id} value={voice.id}>
                              {voice.name}
                              {voice.description
                                ? ` — ${voice.description}`
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {ELEVENLABS_KEY_MISSING_MESSAGE}.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            {translated && !changedLanguage ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null || !look}
                  onClick={addCaptions}
                >
                  <CaptionsIcon />
                  Add captions
                </Button>
                <Button
                  type="button"
                  disabled={busy !== null || !look}
                  onClick={() => void speak()}
                >
                  {busy === "speaking" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <MicIcon />
                  )}
                  {busy === "speaking" ? "Reading…" : "Read it aloud"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={busy !== null}
                onClick={() => void translate()}
              >
                {busy === "translating" ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <LanguagesIcon />
                )}
                {busy === "translating"
                  ? transcript
                    ? "Translating…"
                    : "Listening…"
                  : changedLanguage
                    ? `Translate into ${language}`
                    : "Translate"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** One caption in the saved look, lit word by word only when told when. */
function captionClip(
  look: CaptionLook,
  line: { text: string; startMs: number; durationMs: number }
): EditorClip {
  return {
    id: editorId(),
    kind: "text",
    name: captionClipName(line.text),
    text: line.text,
    startMs: line.startMs,
    durationMs: line.durationMs,
    trimStartMs: 0,
    ...captionClipStyle(look),
    // A translated line has no word times of its own, so it draws plain.
    activeWordColor: undefined,
  }
}
