import * as React from "react"
import { Loader2Icon, SplitIcon } from "lucide-react"
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
import {
  getAiToolErrorMessage,
  loadVoiceDefaults,
  loadVoices,
  rewriteOpeningLine,
  speakHook,
  type AiToolsAvailability,
  type HookVariants,
  type Voice,
} from "@/lib/api/video/ai-tools"
import { AiChoiceField } from "@/components/video-editor/ai-choice-field"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  findHook,
  HOOK_SPOKEN_WINDOW_MS,
  spreadHookAcross,
} from "@/lib/video/hooks"
import type { TranscriberId, WriterId } from "@/lib/video/ai-choices"
import {
  formatAiEstimate,
  hookCostCents,
  voiceCostCents,
  withEstimate,
} from "@/lib/video/ai-estimates"
import { sourceSpanMs } from "@/lib/video/clip-playback"
import { hasSavedWords } from "@/lib/video/transcripts"
import { useSavedTranscripts } from "@/components/video-editor/use-saved-transcripts"
import {
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import { editorId } from "@/lib/video/timeline-utils"
import { VOICE_NO_VOICE_MESSAGE } from "@/lib/video/voice"
import { cn } from "@/lib/utils"

/**
 * Another way to open.
 *
 * The first few seconds decide whether the rest gets watched, so this offers
 * three other ways of saying the line the video opens with. Nothing changes
 * until one is picked, and one press of undo puts the old words back.
 */
export function HookDialog({
  open,
  onOpenChange,
  available,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  available: AiToolsAvailability | null
}) {
  const { projectId, dispatch, saveNow } = useEditorRuntime()
  const tracks = useEditorSelector((state) => state.tracks)
  const [answer, setAnswer] = React.useState<HookVariants | null>(null)
  const [thinking, setThinking] = React.useState(false)
  const [saying, setSaying] = React.useState<string | null>(null)
  const [voices, setVoices] = React.useState<Voice[] | null>(null)
  const [voiceId, setVoiceId] = React.useState("")
  // The model the remembered voice reads with, which is what the server
  // reads a spoken hook with too.
  const [voiceModel, setVoiceModel] = React.useState<string | null>(null)
  const [pickedWriter, setPickedWriter] = React.useState<
    WriterId | undefined
  >()

  // Only fetched when the opening line is actually spoken — otherwise this is
  // a question about a voice nobody needs.
  const spoken = !!answer?.hook.spokenBy
  React.useEffect(() => {
    if (!spoken || voices !== null) return
    let active = true
    Promise.all([loadVoices(), loadVoiceDefaults().catch(() => null)])
      .then(([loaded, remembered]) => {
        if (!active) return
        setVoices(loaded)
        setVoiceModel(remembered?.modelId ?? null)
        const known = loaded.some((one) => one.id === remembered?.voiceId)
        setVoiceId(
          known && remembered ? remembered.voiceId : (loaded[0]?.id ?? "")
        )
      })
      .catch(() => {
        if (active) setVoices([])
      })
    return () => {
      active = false
    }
  }, [spoken, voices])

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setAnswer(null)
      setPickedWriter(undefined)
    }
  }

  // The price before the press, from the same opening the server will find:
  // the writer's share, plus writing down the spoken opening first when
  // nothing is on screen and the file's words are not saved.
  const opening = findHook(tracks)
  const spokenClip = opening?.spokenBy
    ? tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === opening.spokenBy?.clipId)
    : undefined
  const listensFirst = !!opening && !opening.text && !!spokenClip?.mediaId
  const { saved } = useSavedTranscripts(
    listensFirst && spokenClip?.mediaId ? [spokenClip.mediaId] : [],
    open
  )
  const writer = pickedWriter ?? (available?.writer as WriterId | null)
  const transcriber = available?.transcriber as TranscriberId | null
  const priceCents =
    opening && writer
      ? hookCostCents({
          writer,
          // A spoken opening is about fourteen words before it is heard.
          lineCharacters: opening.text.length || 80,
          listen:
            listensFirst && spokenClip?.mediaId && transcriber
              ? {
                  transcriber,
                  soundMs: Math.min(
                    sourceSpanMs(spokenClip),
                    HOOK_SPOKEN_WINDOW_MS
                  ),
                  saved: hasSavedWords(saved, spokenClip.mediaId, transcriber),
                }
              : undefined,
        })
      : null

  /** What saying one line aloud costs with the voice picked. */
  function sayingCents(line: string) {
    const speaker = voices?.find((one) => one.id === voiceId)
    if (!speaker) return null
    const model =
      speaker.speaker === "openai"
        ? "gpt-4o-mini-tts"
        : (voiceModel ?? "eleven_multilingual_v2")
    return voiceCostCents(model, line.length)
  }

  async function think() {
    setThinking(true)
    try {
      // The server reads the saved timeline, so anything still waiting to be
      // sent goes first.
      await saveNow()
      const result = await rewriteOpeningLine(projectId)
      dismissErrorToast()
      setAnswer(result)
      if (!result.variants.length) {
        toast.success("It could not better that line.")
      }
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setThinking(false)
    }
  }

  async function use(line: string) {
    if (!answer) return
    const voice = answer.hook.spokenBy

    // Words only: the screen is the whole hook.
    if (!voice) {
      dispatch({
        type: "REWRITE_HOOK",
        lines: spreadHookAcross(answer.hook.clipIds, line),
      })
      toast.success("The opening line is changed. Undo puts the old one back.")
      onOpenChange(false)
      return
    }

    // Spoken: say the new line out loud and put it where the old one was, or
    // the video would say one thing while the screen said another.
    // How long the words are on screen for — what the footage is quietened for.
    const onScreenIds = new Set(answer.hook.clipIds)
    const hookEndsMs = tracks
      .flatMap((track) => track.clips)
      .filter((clip) => onScreenIds.has(clip.id))
      .reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0)

    const speaker = voices?.find((one) => one.id === voiceId)
    if (!speaker) {
      showErrorToast(VOICE_NO_VOICE_MESSAGE)
      return
    }

    setSaying(line)
    try {
      const said = await speakHook(line, speaker, projectId)
      const spokenLength = said.durationMs || voice.durationMs
      dispatch({
        type: "REWRITE_HOOK",
        lines: spreadHookAcross(answer.hook.clipIds, line),
        spoken:
          voice.kind === "audio"
            ? {
                how: "swap",
                clipId: voice.clipId,
                media: {
                  mediaId: said.mediaId,
                  url: said.url,
                  name: said.name,
                  durationMs: spokenLength,
                  trimStartMs: 0,
                  sourceDurationMs: spokenLength,
                },
              }
            : {
                how: "quieten",
                clipId: voice.clipId,
                // The footage goes quiet for as long as the old line was on
                // screen, or as long as the new one takes — whichever is
                // longer, so neither is talked over.
                untilMs: Math.max(hookEndsMs, spokenLength),
                voice: {
                  id: editorId(),
                  kind: "audio",
                  name: said.name,
                  mediaId: said.mediaId,
                  url: said.url,
                  startMs: 0,
                  durationMs: spokenLength,
                  trimStartMs: 0,
                  sourceDurationMs: spokenLength,
                },
              },
      })
      dismissErrorToast()
      toast.success(
        voice.kind === "audio"
          ? "The opening line is changed and said in the new words. Undo puts it back."
          : "The opening is quietened and the new line said over it. Undo puts it back."
      )
      onOpenChange(false)
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setSaying(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Another way to open</DialogTitle>
          <DialogDescription>
            The first few seconds decide whether the rest gets watched.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {answer ? (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>It opens with</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <p className="text-sm text-muted-foreground">
                    “{answer.hook.text}”
                  </p>
                  {!answer.hook.spokenBy ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing is spoken over this opening, so only the words on
                      screen change.
                    </p>
                  ) : null}
                  {answer.hook.spokenBy ? (
                    <div className="grid gap-2">
                      <Label htmlFor="hook-voice">Said in</Label>
                      <Select
                        value={voiceId}
                        onValueChange={setVoiceId}
                        disabled={!voices?.length}
                      >
                        <SelectTrigger id="hook-voice" className="w-full">
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
                              {voice.description ? ` — ${voice.description}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        {answer.hook.spokenBy?.kind === "audio"
                          ? "This line is spoken, so picking one says it aloud in these words and swaps the sound too."
                          : "The footage says this out loud. Picking one quietens just the opening of it and says the new line over the top. The rest keeps its sound, and undo puts it all back."}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>
                    {answer.variants.length
                      ? "Pick one to use it"
                      : "Nothing better came back"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {answer.variants.map((line) => {
                    const cents = answer.hook.spokenBy ? sayingCents(line) : null
                    return (
                    <button
                      key={line}
                      type="button"
                      disabled={!!saying}
                      onClick={() => void use(line)}
                      className={cn(
                        "rounded-lg border border-foreground/10 p-3 text-left text-sm transition-colors",
                        "hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      {saying === line ? "Saying it aloud…" : line}
                      {cents !== null && saying !== line ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · read aloud {formatAiEstimate(cents)}
                        </span>
                      ) : null}
                    </button>
                    )
                  })}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card size="sm">
              <CardHeader>
                <CardTitle>How it works</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  It reads whatever the video says on screen in its first few
                  seconds and offers three other ways of saying it. Picking one
                  replaces those words; undo puts them back.
                </p>
                <AiChoiceField
                  kind="writer"
                  available={available}
                  onChanged={(id) => setPickedWriter(id as WriterId)}
                />
              </CardContent>
            </Card>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={thinking}
            onClick={() => void think()}
          >
            {thinking ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SplitIcon />
            )}
            {thinking
              ? "Thinking…"
              : withEstimate(answer ? "Try again" : "Show me three", priceCents)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
