import * as React from "react"
import { Loader2Icon } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { getMakeSoundErrorMessage, makeSoundEffect } from "@/lib/api/video/sound-effects"
import type { MediaItem } from "@/server/media/library"
import { withEstimate } from "@/lib/video/ai-estimates"
import {
  AI_SOUND_LENGTH_MESSAGE,
  AI_SOUND_MAX_SECONDS,
  AI_SOUND_MIN_SECONDS,
  AI_SOUND_NO_WORDS_MESSAGE,
  AI_SOUND_WORDS_MAX,
  aiSoundCostCents,
  aiSoundLengthOk,
} from "@/lib/video/ai-sound-effects"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The length box as seconds, null when empty, NaN when it is not a number. */
function typedSeconds(text: string) {
  const trimmed = text.trim().replace(",", ".")
  return trimmed ? Number(trimmed) : null
}

/**
 * "Make a sound with AI", from the Sounds panel's + menu (ai-sound-effects.md):
 * a few words and an optional length, and ElevenLabs makes the sound. The
 * price shows on the button before pressing.
 */
export function MakeSoundDialog({
  open,
  onOpenChange,
  onMade,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMade: (file: MediaItem) => void
}) {
  const { videoId } = useEditorRuntime()
  const [words, setWords] = React.useState("")
  const [lengthText, setLengthText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const seconds = typedSeconds(lengthText)
  const lengthOk = seconds === null || aiSoundLengthOk(seconds)

  async function make() {
    if (!words.trim()) {
      showErrorToast(AI_SOUND_NO_WORDS_MESSAGE)
      return
    }
    if (!lengthOk) {
      showErrorToast(AI_SOUND_LENGTH_MESSAGE)
      return
    }
    setBusy(true)
    try {
      const result = await makeSoundEffect(videoId, words, seconds)
      onOpenChange(false)
      setWords("")
      setLengthText("")
      onMade(result.media)
    } catch (error) {
      showErrorToast(getMakeSoundErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Make a sound with AI</DialogTitle>
          <DialogDescription>
            ElevenLabs makes the sound. It lands at the playhead and stays in Your sounds.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void make()
          }}
        >
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The sound</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="ai-sound-words">What does it sound like?</Label>
                  <Textarea
                    id="ai-sound-words"
                    rows={1}
                    maxLength={AI_SOUND_WORDS_MAX}
                    placeholder="glass shattering on a tiled floor"
                    value={words}
                    disabled={busy}
                    onChange={(event) => setWords(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ai-sound-seconds">Length in seconds</Label>
                  <Input
                    id="ai-sound-seconds"
                    inputMode="decimal"
                    placeholder={`Empty lets the AI choose, ${AI_SOUND_MIN_SECONDS} to ${AI_SOUND_MAX_SECONDS}`}
                    value={lengthText}
                    disabled={busy}
                    aria-invalid={!lengthOk || undefined}
                    onChange={(event) => setLengthText(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {busy
                ? "Making it…"
                : withEstimate("Make the sound", lengthOk ? aiSoundCostCents(seconds) : null)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
