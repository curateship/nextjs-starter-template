import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CaptionsIcon,
  CheckIcon,
  LanguagesIcon,
  Loader2Icon,
  MicIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getAiToolErrorMessage,
  loadVoiceDefaults,
  loadVoices,
  makeLanguageCopyOf,
  speakTranslation,
  translateCaptionLines,
  writeCaptions,
  type AiToolsAvailability,
  type CaptionsResult,
  type LanguageCopyResult,
  type Voice,
} from "@/lib/api/video/ai-tools"
import { AiChoiceField } from "@/components/video-editor/ai-choice-field"
import { useCaptionPlacement } from "@/components/video-editor/caption-settings-context"
import {
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import { useSavedTranscripts } from "@/components/video-editor/use-saved-transcripts"
import type { TranscriberId, WriterId } from "@/lib/video/ai-choices"
import {
  translateCostCents,
  voiceCostCents,
  withEstimate,
} from "@/lib/video/ai-estimates"
import { sourceSpanMs } from "@/lib/video/clip-playback"
import { hasSavedWords } from "@/lib/video/transcripts"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import { captionTextClips } from "@/lib/video/caption-look"
import { findCaptionSource } from "@/lib/video/captions"
import { formatCents } from "@/lib/video/project-spend"
import { voiceoverRefusal } from "@/lib/video/saved-voiceovers"
import { editorId, formatClock } from "@/lib/video/timeline-utils"
import {
  capitalsLocale,
  DEFAULT_TRANSLATE_LANGUAGE,
  TRANSLATE_LANGUAGES,
  TRANSLATE_LANGUAGES_AT_ONCE,
  TRANSLATE_LINE_MAX,
  TRANSLATE_LINES_MAX,
  TRANSLATE_NO_VOICE_MESSAGE,
  TRANSLATE_TOO_MANY_LANGUAGES_MESSAGE,
  TRANSLATE_TOO_MANY_LINES_MESSAGE,
  TRANSLATE_VOICE_MODEL,
  TRANSLATE_NOTHING_TO_SAY_MESSAGE,
  TRANSLATE_ORIGINAL_VOLUME,
  TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE,
  translationScript,
  unreadLanguagesMessage,
  type TranslateLanguage,
} from "@/lib/video/translate"
import { VOICE_TEXT_MAX } from "@/lib/video/voice"

/**
 * The project's talking, in another language, or in several at once.
 *
 * The talking is written down once, when the window first translates, and
 * kept while it stays open, so each extra language pays for its translation
 * only. Every translation is shown line by line to read and correct before
 * anything is made.
 *
 * One language works on this project: it goes on as captions, or is read
 * aloud over the original with the original turned down. Either one is a
 * single press of undo. Several languages never touch this project: each gets
 * a tab to read, and Make all makes each one a copy of the project with its
 * own voice and captions, and queues the copy's export
 * (workspace/docs/another-language.md).
 */

type TranslatedLine = {
  startMs: number
  endMs: number
  original: string
  text: string
}

type Busy = "translating" | "speaking" | "making"

/** Where a long press has got to, for its button. */
type Progress = { language: TranslateLanguage; at: number; of: number }

/** What Make all did with one language. */
type Outcome =
  | { language: TranslateLanguage; made: LanguageCopyResult }
  | { language: TranslateLanguage; problem: string }

type Translations = Partial<Record<TranslateLanguage, TranslatedLine[]>>

/** "Spanish, Portuguese and Hindi". */
function listLanguages(languages: TranslateLanguage[]) {
  if (languages.length < 2) return languages.join("")
  return `${languages.slice(0, -1).join(", ")} and ${languages.at(-1)}`
}

export function TranslateDialog({
  open,
  onOpenChange,
  available,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  available: AiToolsAvailability | null
}) {
  const { projectId, store, dispatch, saveNow } = useEditorRuntime()
  const captionPlacement = useCaptionPlacement()
  const [picked, setPicked] = React.useState<TranslateLanguage[]>([
    DEFAULT_TRANSLATE_LANGUAGE,
  ])
  const [transcript, setTranscript] = React.useState<CaptionsResult | null>(
    null
  )
  const [translations, setTranslations] = React.useState<Translations>({})
  // The language whose lines one-language mode shows: the last one translated.
  const [shown, setShown] = React.useState<TranslateLanguage | null>(null)
  const [tab, setTab] = React.useState<TranslateLanguage | null>(null)
  const [opened, setOpened] = React.useState<Set<TranslateLanguage>>(new Set())
  const [outcomes, setOutcomes] = React.useState<Outcome[] | null>(null)
  const [busy, setBusy] = React.useState<Busy | null>(null)
  const [progress, setProgress] = React.useState<Progress | null>(null)
  const [voices, setVoices] = React.useState<Voice[] | null>(null)
  const [voiceId, setVoiceId] = React.useState("")
  // True once the voices came back, or came back as "no key".
  const [voicesAnswered, setVoicesAnswered] = React.useState(false)
  const [pickedTranscriber, setPickedTranscriber] = React.useState<
    TranscriberId | undefined
  >()
  const [pickedWriter, setPickedWriter] = React.useState<
    WriterId | undefined
  >()

  // Every opening starts clean: the timeline may have changed since.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setPicked([DEFAULT_TRANSLATE_LANGUAGE])
      setTranscript(null)
      setTranslations({})
      setShown(null)
      setTab(null)
      setOpened(new Set())
      setOutcomes(null)
      setPickedTranscriber(undefined)
      setPickedWriter(undefined)
    }
  }

  const several = picked.length > 1
  const ready = picked.filter((language) => translations[language])
  const missing = picked.filter((language) => !translations[language])
  const translated = Object.keys(translations).length > 0
  // One language works on this project, and only on the one ticked. Its
  // lines show once translated; until then the last translation stays in
  // view, as it always did, with its buttons hidden.
  const single = picked.length === 1 ? picked[0] : null
  const actOn = single && translations[single] ? single : null
  const onScreen = actOn ?? shown
  const lines = onScreen ? (translations[onScreen] ?? null) : null
  const activeTab = tab && ready.includes(tab) ? tab : (ready[0] ?? null)

  // The price before the press. Before anything is written down it is a
  // guess from how long the talking runs; once the lines are in the window
  // it is worked out from them, and writing down is not paid for again.
  const tracks = useEditorSelector((state) => state.tracks)
  const source = findCaptionSource(tracks)
  const mediaId = source?.clip.mediaId
  const { saved } = useSavedTranscripts(
    mediaId && !transcript ? [mediaId] : [],
    open
  )
  const transcriber =
    pickedTranscriber ?? (available?.transcriber as TranscriberId | null)
  const writer = pickedWriter ?? (available?.writer as WriterId | null)
  const savedRow = saved.find((row) => row.mediaId === mediaId)
  const linesCharacters = transcript?.captions.reduce(
    (sum, line) => sum + line.text.length,
    0
  )
  const talkMs = source ? sourceSpanMs(source.clip) : 0
  const listen =
    !transcript && source && mediaId && transcriber
      ? {
          transcriber,
          fileSoundMs:
            savedRow?.durationMs ??
            source.clip.sourceDurationMs ??
            sourceSpanMs(source.clip),
          saved: hasSavedWords(saved, mediaId, transcriber),
        }
      : undefined
  const canPrice = !!writer && (!!transcript || !!listen)
  // One language's translation, without writing the talking down.
  const translateOneCents =
    canPrice && writer
      ? translateCostCents({ writer, linesCharacters, talkMs })
      : null
  const listenCents =
    canPrice && writer && listen
      ? translateCostCents({ writer, linesCharacters, talkMs, listen }) -
        (translateOneCents ?? 0)
      : 0
  const translateCents =
    translateOneCents === null
      ? null
      : listenCents + translateOneCents * Math.max(1, missing.length)
  // A translation runs about a seventh longer than what was said.
  const voiceGuessCents = voiceCostCents(
    TRANSLATE_VOICE_MODEL,
    (linesCharacters ?? (talkMs / 60_000) * 900) * 1.15
  )
  const perLanguageCents =
    translateOneCents === null ? null : translateOneCents + voiceGuessCents
  const readAloudCents = lines
    ? voiceCostCents(TRANSLATE_VOICE_MODEL, translationScript(lines).length)
    : null
  const makeAllCents = ready.reduce(
    (sum, language) =>
      sum +
      voiceCostCents(
        TRANSLATE_VOICE_MODEL,
        translationScript(translations[language] ?? []).length
      ),
    0
  )

  // Only ElevenLabs voices: the multilingual model is theirs. Asked for once a
  // translation is in hand, since until then nobody needs a voice. With an
  // ElevenLabs key the server hands back its voices or fails, so an answer
  // with none of theirs means that key is not saved. That also covers the
  // answer about keys never arriving.
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

  function pick(language: TranslateLanguage, on: boolean) {
    if (on && picked.length >= TRANSLATE_LANGUAGES_AT_ONCE) {
      showErrorToast(`${TRANSLATE_TOO_MANY_LANGUAGES_MESSAGE}.`)
      return
    }
    setPicked((current) =>
      on
        ? [...current, language]
        : current.filter((one) => one !== language)
    )
  }

  // Opening a tab is reading it, which is what Make all waits for. The tab on
  // screen counts as open, including the first one, shown without a click.
  const isRead = (language: TranslateLanguage) =>
    opened.has(language) || language === activeTab

  function openTab(language: TranslateLanguage) {
    setTab(language)
    setOpened((current) => {
      const next = new Set(current).add(language)
      if (activeTab) next.add(activeTab)
      return next
    })
  }

  async function translate() {
    if (!missing.length) {
      showErrorToast("Tick at least one language.")
      return
    }
    setBusy("translating")
    const failed: string[] = []
    try {
      let heard = transcript
      if (!heard) {
        // The server reads the saved timeline, so anything still waiting to
        // be sent goes first.
        await saveNow()
        heard = await writeCaptions(projectId)
        setTranscript(heard)
      }
      if (heard.captions.length > TRANSLATE_LINES_MAX) {
        showErrorToast(TRANSLATE_TOO_MANY_LINES_MESSAGE)
        return
      }
      let first: TranslateLanguage | null = null
      for (const [index, language] of missing.entries()) {
        setProgress({ language, at: index + 1, of: missing.length })
        try {
          const words = await translateCaptionLines(
            language,
            heard.captions.map((line) => line.text),
            projectId
          )
          const done = heard.captions.map((line, at) => ({
            startMs: line.startMs,
            endMs: line.endMs,
            original: line.text,
            text: words[at] ?? "",
          }))
          setTranslations((current) => ({ ...current, [language]: done }))
          setShown(language)
          first ??= language
        } catch (error) {
          failed.push(`${language}: ${getAiToolErrorMessage(error)}`)
        }
      }
      if (first && !activeTab) setTab(first)
      if (failed.length) showErrorToast(failed.join(". "))
      else dismissErrorToast()
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setProgress(null)
      setBusy(null)
    }
  }

  function editLine(language: TranslateLanguage, index: number, text: string) {
    setTranslations((current) => {
      const lines = current[language]
      if (!lines) return current
      return {
        ...current,
        [language]: lines.map((line, at) =>
          at === index ? { ...line, text } : line
        ),
      }
    })
  }

  /** The voice to read with, or a refusal said out loud. */
  function chosenVoice() {
    if (keyMissing) {
      showErrorToast(ELEVENLABS_KEY_MISSING_MESSAGE)
      return null
    }
    const voice = voices?.find((one) => one.id === voiceId)
    if (!voice) showErrorToast(TRANSLATE_NO_VOICE_MESSAGE)
    return voice ?? null
  }

  function addCaptions() {
    const lines = actOn && translations[actOn]
    if (!actOn || !lines) return
    // A translated line has no word times of its own, so it draws plain.
    const captions = captionTextClips(
      lines
        .filter((line) => line.text.trim())
        .map((line) => ({
          startMs: line.startMs,
          endMs: line.endMs,
          text: line.text.trim(),
        })),
      captionPlacement,
      { newId: editorId, locale: capitalsLocale(actOn) }
    )
    if (!captions.length) {
      showErrorToast(TRANSLATE_NOTHING_TO_SAY_MESSAGE)
      return
    }
    dispatch({ type: "INSERT_CAPTIONS", captions })
    dismissErrorToast()
    toast.success(
      `${captions.length} ${plural(captions.length, "caption", "captions")} in ${actOn} added. Undo takes them all back off.`
    )
    close()
  }

  async function speak() {
    const lines = actOn && translations[actOn]
    if (!actOn || !lines || !transcript) return
    const script = translationScript(lines)
    if (!script) {
      showErrorToast(TRANSLATE_NOTHING_TO_SAY_MESSAGE)
      return
    }
    if (script.length > VOICE_TEXT_MAX) {
      showErrorToast(TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE)
      return
    }
    const voice = chosenVoice()
    if (!voice) return

    setBusy("speaking")
    try {
      const said = await speakTranslation(script, voice, projectId)
      const refusal = voiceoverRefusal(
        store.getSnapshot().state.tracks,
        said.captions
      )
      if (refusal) {
        // It was read and paid for, so say where it went.
        showErrorToast(`${refusal} The voiceover is saved in the Voices panel.`)
        return
      }
      // The new voice starts where the original talking starts, and its
      // captions follow it rather than the original's times.
      const startsAtMs = lines[0].startMs
      const audioId = editorId()
      dispatch({
        type: "INSERT_VOICEOVER",
        audio: {
          id: audioId,
          kind: "audio",
          name: said.name,
          mediaId: said.mediaId,
          url: said.url,
          startMs: startsAtMs,
          durationMs: said.durationMs,
          trimStartMs: 0,
          sourceDurationMs: said.durationMs,
          origin: said.origin,
        },
        captions: captionTextClips(said.captions, captionPlacement, {
          atMs: startsAtMs,
          spokenBy: audioId,
          locale: capitalsLocale(actOn),
          newId: editorId,
        }),
        quieten: {
          clipId: transcript.source.clipId,
          volume: TRANSLATE_ORIGINAL_VOLUME,
        },
      })
      dismissErrorToast()
      toast.success(
        `Read aloud in ${actOn}, with the original turned down to ${Math.round(TRANSLATE_ORIGINAL_VOLUME * 100)}%. Undo puts it back.`
      )
      close()
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Make all: one copy of the project per language, each with its voice,
   * its captions and its export. One language failing leaves the others
   * going; the ones that failed can be tried again on their own.
   */
  async function makeAll(languages: TranslateLanguage[]) {
    if (!transcript) return
    const unread = languages.filter((language) => !isRead(language))
    if (unread.length) {
      showErrorToast(unreadLanguagesMessage(unread))
      return
    }
    for (const language of languages) {
      const script = translationScript(translations[language] ?? [])
      if (!script) {
        showErrorToast(`${language}: ${TRANSLATE_NOTHING_TO_SAY_MESSAGE}`)
        return
      }
      if (script.length > VOICE_TEXT_MAX) {
        showErrorToast(`${language}: ${TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE}`)
        return
      }
    }
    const voice = chosenVoice()
    if (!voice) return

    setBusy("making")
    const finished: Outcome[] = []
    try {
      // The copies are made from the saved project, so what is on screen
      // goes first.
      await saveNow()
      for (const [index, language] of languages.entries()) {
        setProgress({ language, at: index + 1, of: languages.length })
        try {
          const made = await makeLanguageCopyOf({
            projectId,
            sourceClipId: transcript.source.clipId,
            language,
            lines: (translations[language] ?? []).map((line) => ({
              startMs: line.startMs,
              text: line.text,
            })),
            voice,
          })
          finished.push({ language, made })
        } catch (error) {
          finished.push({ language, problem: getAiToolErrorMessage(error) })
        }
      }
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
      return
    } finally {
      setProgress(null)
      setBusy(null)
    }
    // A second try replaces what the first said about those languages.
    setOutcomes((current) => [
      ...(current ?? []).filter(
        (outcome) => !languages.includes(outcome.language)
      ),
      ...finished,
    ])
    const failed = finished.filter((outcome) => "problem" in outcome)
    if (failed.length) {
      showErrorToast(
        `${listLanguages(failed.map((outcome) => outcome.language))} could not be made. The reasons are in the window.`
      )
    } else {
      dismissErrorToast()
      toast.success(
        `${finished.length} ${plural(finished.length, "copy", "copies")} made, each with its export queued.`
      )
    }
  }

  const failedLanguages = (outcomes ?? []).flatMap((outcome) =>
    "problem" in outcome ? [outcome.language] : []
  )
  const progressWord = progress
    ? progress.of > 1
      ? `${progress.language}, ${progress.at} of ${progress.of}`
      : progress.language
    : null

  return (
    <FormDialog
      open={open}
      // A translation has been paid for, so a stray click outside asks first.
      dirty={translated && !outcomes}
      busy={busy !== null}
      onClose={close}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Another language</DialogTitle>
            <DialogDescription>
              The talking on this project, translated. Read it and correct it
              here before anything is made from it.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {outcomes ? (
              <MadeCard outcomes={outcomes} />
            ) : (
              <>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Into</CardTitle>
                    <CardDescription>
                      {several
                        ? "Each language becomes a copy of this project with its own voice and captions, and its own export. This project stays as it is."
                        : "Tick more than one to make a copy of this project in each language at once."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <ScrollArea className="max-h-48">
                      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {TRANSLATE_LANGUAGES.map((language) => {
                          const id = `translate-language-${language}`
                          return (
                            <li key={language}>
                              <label
                                htmlFor={id}
                                className="flex items-center gap-3 text-sm"
                              >
                                <Checkbox
                                  id={id}
                                  checked={picked.includes(language)}
                                  disabled={busy !== null}
                                  onCheckedChange={(checked) =>
                                    pick(language, checked === true)
                                  }
                                />
                                {language}
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </ScrollArea>
                    {several && perLanguageCents !== null ? (
                      <p className="text-sm text-muted-foreground">
                        Each language costs about{" "}
                        {formatCents(perLanguageCents)}: its translation and
                        its voice. {picked.length} languages come to about{" "}
                        {formatCents(
                          perLanguageCents * picked.length + listenCents
                        )}
                        .
                      </p>
                    ) : null}
                    {translated ? null : (
                      <>
                        <AiChoiceField
                          kind="transcriber"
                          available={available}
                          onChanged={(id) =>
                            setPickedTranscriber(id as TranscriberId)
                          }
                        />
                        <AiChoiceField
                          kind="writer"
                          available={available}
                          onChanged={(id) => setPickedWriter(id as WriterId)}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>

                {several && activeTab ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Read each one</CardTitle>
                      <CardDescription>
                        Each line keeps the time of the one it came from. Make
                        all waits until every tab has been opened.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <Tabs
                        value={activeTab}
                        onValueChange={(next) =>
                          openTab(next as TranslateLanguage)
                        }
                      >
                        <ScrollArea className="w-full">
                          <TabsList>
                            {ready.map((language) => (
                              <TabsTrigger key={language} value={language}>
                                {language}
                                {isRead(language) ? (
                                  <>
                                    <CheckIcon aria-hidden="true" />
                                    <span className="sr-only">, read</span>
                                  </>
                                ) : null}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                          <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                      </Tabs>
                      <TranslatedLines
                        language={activeTab}
                        lines={translations[activeTab] ?? []}
                        disabled={busy !== null}
                        onEdit={editLine}
                      />
                    </CardContent>
                  </Card>
                ) : null}

                {!several && lines && onScreen ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>
                        In {onScreen}, {lines.length}{" "}
                        {plural(lines.length, "line", "lines")}
                      </CardTitle>
                      <CardDescription>
                        Each line keeps the time of the one it came from.
                        Correct any of them before using it.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <TranslatedLines
                        language={onScreen}
                        lines={lines}
                        disabled={busy !== null}
                        onEdit={editLine}
                      />
                    </CardContent>
                  </Card>
                ) : null}

                {translated ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Read aloud in</CardTitle>
                      <CardDescription>
                        {several
                          ? `One voice reads every language. On each copy it goes on a lane of its own from where the talking starts, with its own captions, and the original is turned down to ${Math.round(TRANSLATE_ORIGINAL_VOLUME * 100)}%.`
                          : `The voice goes on a lane of its own from where the talking starts, with its own captions. The original stays and is turned down to ${Math.round(TRANSLATE_ORIGINAL_VOLUME * 100)}%.`}
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
                            <SelectTrigger
                              id="translate-voice"
                              className="w-full"
                            >
                              <SelectValue
                                placeholder={
                                  voices === null
                                    ? "Fetching voices…"
                                    : "No voices"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {(voices ?? []).map((voice) => (
                                <SelectItem key={voice.id} value={voice.id}>
                                  {voice.name}
                                  {voice.description
                                    ? `: ${voice.description}`
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
              </>
            )}
          </DialogBody>
          <DialogFooter>
            {outcomes ? (
              <>
                {failedLanguages.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void makeAll(failedLanguages)}
                  >
                    {busy === "making" ? (
                      <Loader2Icon className="animate-spin" />
                    ) : null}
                    {busy === "making"
                      ? `Making ${progressWord}…`
                      : `Try ${listLanguages(failedLanguages)} again`}
                  </Button>
                ) : null}
                <Button type="button" disabled={busy !== null} onClick={close}>
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={requestClose}>
                  Cancel
                </Button>
                {actOn ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={addCaptions}
                    >
                      <CaptionsIcon />
                      Add captions
                    </Button>
                    <Button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void speak()}
                    >
                      {busy === "speaking" ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <MicIcon />
                      )}
                      {busy === "speaking"
                        ? "Reading…"
                        : withEstimate("Read it aloud", readAloudCents)}
                    </Button>
                  </>
                ) : translated && !missing.length && several ? (
                  <Button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void makeAll(picked)}
                  >
                    {busy === "making" ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <LanguagesIcon />
                    )}
                    {busy === "making"
                      ? `Making ${progressWord}…`
                      : `Make all ${picked.length} · about ${formatCents(makeAllCents)}`}
                  </Button>
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
                      ? !transcript
                        ? "Listening…"
                        : progressWord
                          ? `Translating ${progressWord}…`
                          : "Translating…"
                      : withEstimate(
                          translateLabel(picked, missing, translated),
                          translateCents
                        )}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The Translate button's words. One language reads as it always did:
 * "Translate", then "Translate into French" once another is picked.
 */
function translateLabel(
  picked: TranslateLanguage[],
  missing: TranslateLanguage[],
  translated: boolean
) {
  if (picked.length < 2) {
    return translated && missing.length ? `Translate into ${missing[0]}` : "Translate"
  }
  if (!translated) return `Translate into ${picked.length} languages`
  return `Translate ${listLanguages(missing)}`
}

/** One language's lines, each under its time and the words it came from. */
function TranslatedLines({
  language,
  lines,
  disabled,
  onEdit,
}: {
  language: TranslateLanguage
  lines: TranslatedLine[]
  disabled: boolean
  onEdit: (language: TranslateLanguage, index: number, text: string) => void
}) {
  return lines.map((line, index) => {
    const id = `translate-line-${language}-${index}`
    return (
      <div key={`${line.startMs}-${index}`} className="grid gap-2">
        <Label
          htmlFor={id}
          className="flex min-w-0 gap-2 font-normal text-muted-foreground"
        >
          <span className="shrink-0 tabular-nums">
            {formatClock(line.startMs)}
          </span>
          <span className="truncate">{line.original}</span>
        </Label>
        <Input
          id={id}
          value={line.text}
          maxLength={TRANSLATE_LINE_MAX}
          disabled={disabled}
          onChange={(event) => onEdit(language, index, event.target.value)}
        />
      </div>
    )
  })
}

/** What Make all made: a link to each copy, and why any language was not. */
function MadeCard({ outcomes }: { outcomes: Outcome[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Made</CardTitle>
        <CardDescription>
          Each copy is a project of its own. Its export is on the Exports page,
          under this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {outcomes.map((outcome) =>
          "made" in outcome ? (
            <div key={outcome.language} className="grid gap-0.5 text-sm">
              <Link
                to="/admin/video-editor/$projectId"
                params={{ projectId: outcome.made.project.id }}
                className="font-medium underline"
              >
                {outcome.made.project.name}
              </Link>
              <span className="text-muted-foreground">
                {outcome.made.exportProblem
                  ? `Not exported: ${outcome.made.exportProblem}`
                  : "Export queued."}
              </span>
            </div>
          ) : (
            <div key={outcome.language} className="grid gap-0.5 text-sm">
              <span className="font-medium">{outcome.language}</span>
              <span className="text-destructive">
                Not made: {outcome.problem}
              </span>
            </div>
          )
        )}
        <Link to="/admin/video-exports" className="text-sm underline">
          Open the Exports page
        </Link>
      </CardContent>
    </Card>
  )
}
