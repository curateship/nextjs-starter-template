import * as React from "react"
import { Loader2Icon, PauseIcon, PlayIcon, RotateCwIcon } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { LengthCounter } from "@/components/video-assets/length-counter"
import { getFixWordErrorMessage, sayWordsInTheirVoice } from "@/lib/api/video/fix-a-word"
import { withEstimate } from "@/lib/video/ai-estimates"
import {
  FIX_WORD_NO_TEXT_MESSAGE,
  FIX_WORD_TEXT_MAX,
  fixSpokenWords,
  fixWordCostCents,
  type NewWords,
} from "@/lib/video/fix-a-word"
import { editorId } from "@/lib/video/timeline-utils"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

export type WordsToFix = {
  clipId: string
  clipStartMs: number
  clipEndMs: number
  oldText: string
}

/**
 * Fix a word you said wrong (fix-a-word.md): type what should be said, hear
 * it in a copy of the speaker's voice, then Apply swaps it in as one Undo
 * step. Hearing it is what costs; Apply is free, and Say it again makes
 * another take at the same price.
 */
export function FixWordsDialog({
  open,
  onOpenChange,
  words: toFix,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  words: WordsToFix | null
}) {
  const { videoId, saveNow, store, dispatch } = useEditorRuntime()
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [made, setMade] = React.useState<NewWords | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const audioRef = React.useRef<HTMLAudioElement>(null)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setText("")
      setMade(null)
      setPlaying(false)
    }
  }

  async function sayIt() {
    if (!toFix) return
    if (!text.trim()) {
      showErrorToast(FIX_WORD_NO_TEXT_MESSAGE)
      return
    }
    setBusy(true)
    try {
      // The server reads the saved timeline, so anything waiting goes first.
      await saveNow()
      const result = await sayWordsInTheirVoice(videoId, toFix.clipId, text)
      dismissErrorToast()
      setMade(result)
      setPlaying(false)
      // Heard straight away, which is the point of this step.
      window.setTimeout(() => void audioRef.current?.play().catch(() => undefined), 0)
    } catch (error) {
      showErrorToast(getFixWordErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function apply() {
    if (!toFix || !made) return
    const { tracks, markers } = store.getSnapshot().state
    const action = { ...toFix, newText: text, words: made }
    const check = fixSpokenWords(tracks, markers, { ...action, makeId: editorId })
    if ("refusal" in check) {
      showErrorToast(check.refusal)
      return
    }
    dispatch({ type: "FIX_SPOKEN_WORDS", ...action })
    onOpenChange(false)
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => undefined)
    else audio.pause()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Fix the words</DialogTitle>
          <DialogDescription>
            Said again in a copy of the speaker&apos;s voice. Only the sound changes, not the lips.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>The words</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm">
                <span className="text-muted-foreground">Said now: </span>
                <span className="line-through">{toFix?.oldText}</span>
              </p>
              <div className="grid gap-2">
                <Label htmlFor="fix-words-text">Say instead</Label>
                <Textarea
                  id="fix-words-text"
                  rows={1}
                  maxLength={FIX_WORD_TEXT_MAX}
                  value={text}
                  disabled={busy}
                  placeholder="Thursday"
                  onChange={(event) => {
                    setText(event.target.value)
                    setMade(null)
                  }}
                />
                <LengthCounter length={text.length} max={FIX_WORD_TEXT_MAX} />
              </div>
              {made ? (
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={togglePlay}>
                    {playing ? <PauseIcon /> : <PlayIcon />}
                    {playing ? "Pause" : "Hear it"}
                  </Button>
                  <audio
                    ref={audioRef}
                    src={made.url}
                    preload="auto"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                  />
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Use this only on your own voice, or with the speaker&apos;s permission. The first
                fix in a recording copies the voice from about a minute of it, and needs an
                ElevenLabs plan that allows voice copies.
              </p>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {made ? (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void sayIt()}>
                {busy ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
                {withEstimate("Say it again", fixWordCostCents(text))}
              </Button>
              <Button type="button" disabled={busy} onClick={apply}>
                Apply
              </Button>
            </>
          ) : (
            <Button type="button" disabled={busy} onClick={() => void sayIt()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {busy ? "Saying it…" : withEstimate("Say it", text.trim() ? fixWordCostCents(text) : null)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
