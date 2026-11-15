import * as React from "react"
import { Loader2Icon, MicIcon, SquareIcon } from "lucide-react"
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
import { useCaptionPlacement } from "@/components/video-editor/caption-settings-context"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import type { AiToolsAvailability } from "@/lib/api/video/ai-tools"
import { getRecordingErrorMessage, keepRecording } from "@/lib/api/video/voiceovers"
import {
  encodeWav,
  RECORDING_EMPTY_MESSAGE,
  RECORDING_MAX_MS,
  RECORDING_MISSING_MESSAGE,
  RECORDING_SAMPLE_RATE,
  RECORDING_UNREADABLE_MESSAGE,
} from "@/lib/video/recorded-voiceover"
import { voiceoverClips, voiceoverRefusal } from "@/lib/video/saved-voiceovers"
import { formatClock } from "@/lib/video/timeline-utils"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * "Record a voiceover": talk into the microphone, hear it back, and it lands
 * at the playhead with captions Whisper writes from it
 * (workspace/docs/record-a-voiceover.md). It is kept on the Voices shelf like
 * every other voiceover.
 *
 * The take is turned into a WAV file here, as soon as Stop is pressed, so the
 * preview plays exactly what will be kept.
 */

type Take = {
  file: File
  /** For the preview player; let go of when the take is replaced. */
  url: string
  durationMs: number
}

/** The type the browser records in: WebM in Chrome and Firefox, MP4 in Safari. */
function recordingType() {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ""
}

/** The browser's recording as one channel of WAV at the app's sample rate. */
async function toWav(recorded: Blob): Promise<Take> {
  const context = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await context.decodeAudioData(await recorded.arrayBuffer())
  } finally {
    void context.close()
  }
  const seconds = Math.min(decoded.duration, RECORDING_MAX_MS / 1000)
  const frames = Math.round(seconds * RECORDING_SAMPLE_RATE)
  if (frames <= 0) throw new Error(RECORDING_EMPTY_MESSAGE)
  // One output channel folds a stereo microphone down to mono.
  const offline = new OfflineAudioContext(1, frames, RECORDING_SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  const bytes = encodeWav(rendered.getChannelData(0), RECORDING_SAMPLE_RATE)
  const file = new File([new Uint8Array(bytes).buffer as ArrayBuffer], "recording.wav", {
    type: "audio/wav",
  })
  return {
    file,
    url: URL.createObjectURL(file),
    durationMs: Math.round((frames / RECORDING_SAMPLE_RATE) * 1000),
  }
}

export function RecordVoiceoverDialog({
  open,
  onOpenChange,
  available,
  onKept,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  available: AiToolsAvailability | null
  /** Told once a recording is on the shelf, so the list can show it. */
  onKept: () => void
}) {
  const { store, dispatch, clock, videoId } = useEditorRuntime()
  const captions = useCaptionPlacement()
  const [take, setTake] = React.useState<Take | null>(null)
  const [recordingSince, setRecordingSince] = React.useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = React.useState(0)
  const [preparing, setPreparing] = React.useState(false)
  const [keeping, setKeeping] = React.useState(false)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  // Set when the window closes mid-take, so the take is thrown away rather
  // than turning up the next time the window opens.
  const discardRef = React.useRef(false)

  const recording = recordingSince !== null
  const busy = preparing || keeping

  // The timer while recording, which also stops the take at five minutes.
  React.useEffect(() => {
    if (recordingSince === null) return
    const timer = setInterval(() => {
      const elapsed = Date.now() - recordingSince
      setElapsedMs(elapsed)
      if (elapsed >= RECORDING_MAX_MS) recorderRef.current?.stop()
    }, 200)
    return () => clearInterval(timer)
  }, [recordingSince])

  // A closed window lets go of the microphone, and so does leaving the editor
  // mid-take, which takes the window away without closing it.
  React.useEffect(() => {
    if (open || !recorderRef.current) return
    discardRef.current = true
    recorderRef.current.stop()
  }, [open])
  React.useEffect(
    () => () => {
      discardRef.current = true
      recorderRef.current?.stop()
    },
    []
  )

  /** Swaps the take, letting go of the old one's preview address. */
  function replaceTake(next: Take | null) {
    setTake((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return next
    })
  }

  function reset() {
    replaceTake(null)
    setElapsedMs(0)
  }

  async function startRecording() {
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      showErrorToast("This browser cannot record here. Try Chrome, Safari or Firefox.")
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      showErrorToast(
        "The browser was not allowed to use the microphone. Allow it from the address bar and try again."
      )
      return
    }
    const type = recordingType()
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : {})
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      setRecordingSince(null)
      if (discardRef.current) return
      const recorded = new Blob(chunks, { type: recorder.mimeType || type })
      if (!recorded.size) {
        showErrorToast(RECORDING_EMPTY_MESSAGE)
        return
      }
      setPreparing(true)
      toWav(recorded)
        .then((next) => replaceTake(next))
        .catch((error) =>
          showErrorToast(
            error instanceof Error && error.message === RECORDING_EMPTY_MESSAGE
              ? RECORDING_EMPTY_MESSAGE
              : RECORDING_UNREADABLE_MESSAGE
          )
        )
        .finally(() => setPreparing(false))
    }
    recorderRef.current = recorder
    discardRef.current = false
    recorder.start()
    replaceTake(null)
    setElapsedMs(0)
    setRecordingSince(Date.now())
  }

  async function keep() {
    if (!take) {
      showErrorToast(RECORDING_MISSING_MESSAGE)
      return
    }
    if (store.refuseIfLocked()) return
    setKeeping(true)
    try {
      const result = await keepRecording(take.file, videoId)
      onKept()
      const refusal = voiceoverRefusal(store.getSnapshot().state.tracks, result.captions)
      if (refusal) {
        showErrorToast(`${refusal} The recording is saved in the Voices list.`)
        return
      }
      const atMs = clock.getTime()
      dispatch({
        type: "INSERT_VOICEOVER",
        ...voiceoverClips(result, atMs, captions),
      })
      dismissErrorToast()
      if (result.notice) toast(result.notice)
      onOpenChange(false)
      reset()
    } catch (error) {
      showErrorToast(getRecordingErrorMessage(error))
    } finally {
      setKeeping(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={!!take || recording}
      busy={keeping}
      onClose={() => {
        onOpenChange(false)
        reset()
      }}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record a voiceover</DialogTitle>
            <DialogDescription>
              Talk for up to {formatClock(RECORDING_MAX_MS)}. It lands at the
              playhead with captions, and stays in the Voices list to use again.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The recording</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  A quiet room and the microphone close to you sound best.
                </p>
                <div className="flex flex-wrap gap-2">
                  {recording ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => recorderRef.current?.stop()}
                    >
                      <SquareIcon />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void startRecording()}
                    >
                      {preparing ? <Loader2Icon className="animate-spin" /> : <MicIcon />}
                      {take ? "Record again" : "Record"}
                    </Button>
                  )}
                </div>
                {recording ? (
                  <p className="text-sm tabular-nums" role="status" aria-live="polite">
                    Recording, {formatClock(elapsedMs)}. It stops itself at{" "}
                    {formatClock(RECORDING_MAX_MS)}.
                  </p>
                ) : null}
                {take ? (
                  <div className="grid gap-2">
                    <audio
                      controls
                      src={take.url}
                      className="w-full"
                      aria-label="Hear the recording"
                    />
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {formatClock(take.durationMs)} long.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Captions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <p>
                  {available && !available.openai
                    ? "No OpenAI key is saved in Settings → AI, so the recording is kept without captions."
                    : "Whisper writes down what you said and when, for the captions. It costs under 1 cent a minute."}
                </p>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={keeping} onClick={requestClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || recording}
              onClick={() => void keep()}
            >
              {keeping ? <Loader2Icon className="animate-spin" /> : null}
              {keeping ? "Adding it…" : "Add to video"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
