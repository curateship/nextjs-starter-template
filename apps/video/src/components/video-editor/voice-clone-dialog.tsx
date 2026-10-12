import * as React from "react"
import { Loader2Icon, MicIcon, SquareIcon, UploadIcon } from "lucide-react"
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
import {
  getVoiceCloneErrorMessage,
  makeOwnVoice,
  type ClonedVoice,
} from "@/lib/api/video/cloned-voices"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { formatClock } from "@/lib/video/timeline-utils"
import {
  plainSoundType,
  sampleLengthRefusal,
  VOICE_CLONE_NAME_MAX,
  VOICE_CLONE_NAME_MESSAGE,
  VOICE_SAMPLE_MAX_BYTES,
  VOICE_SAMPLE_MAX_MS,
  VOICE_SAMPLE_MISSING_MESSAGE,
  VOICE_SAMPLE_TOO_BIG_MESSAGE,
  VOICE_SAMPLE_TYPE_MESSAGE,
  VOICE_SAMPLE_TYPES,
} from "@/lib/video/voice-clone"

/**
 * "Make a voice of my own": record or upload 10 to 60 seconds of speech, name
 * it, and ElevenLabs makes a voice from it that is picked like any other.
 *
 * The length is checked here as soon as it is known, so a short take is
 * caught before it is sent, and checked again by the server from the sound
 * itself. A recording's length is the time between Record and Stop, because
 * the browser's own recordings often do not say how long they are.
 */

type Sample = {
  file: File
  /** For the preview player; let go of when the sample is replaced. */
  url: string
  /** Null when the file does not say, in which case the server decides. */
  durationMs: number | null
}

const ACCEPT = VOICE_SAMPLE_TYPES.join(",")

/** How long an uploaded file runs, by asking the browser to load it. */
function readDuration(url: string) {
  return new Promise<number | null>((resolve) => {
    const audio = new Audio()
    audio.preload = "metadata"
    audio.onloadedmetadata = () =>
      resolve(Number.isFinite(audio.duration) ? audio.duration * 1000 : null)
    audio.onerror = () => resolve(null)
    audio.src = url
  })
}

/** The type the browser records in: WebM in Chrome and Firefox, MP4 in Safari. */
function recordingType() {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ""
}

export function VoiceCloneDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (voice: ClonedVoice) => void
}) {
  const [name, setName] = React.useState("")
  const [sample, setSample] = React.useState<Sample | null>(null)
  const [recordingSince, setRecordingSince] = React.useState<number | null>(
    null
  )
  const [elapsedMs, setElapsedMs] = React.useState(0)
  const [creating, setCreating] = React.useState(false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  // Set when the window closes mid-take, so the take is thrown away rather
  // than turning up the next time the window opens.
  const discardRef = React.useRef(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const recording = recordingSince !== null
  const lengthRefusal =
    sample?.durationMs != null ? sampleLengthRefusal(sample.durationMs) : null

  // The timer while recording, which also stops the take at a minute.
  React.useEffect(() => {
    if (recordingSince === null) return
    const timer = setInterval(() => {
      const elapsed = Date.now() - recordingSince
      setElapsedMs(elapsed)
      if (elapsed >= VOICE_SAMPLE_MAX_MS) recorderRef.current?.stop()
    }, 200)
    return () => clearInterval(timer)
  }, [recordingSince])

  // A closed window lets go of the microphone and the preview.
  React.useEffect(() => {
    if (open || !recorderRef.current) return
    discardRef.current = true
    recorderRef.current.stop()
  }, [open])

  /** Swaps the sample, letting go of the old one's preview address. */
  function replaceSample(next: Sample | null) {
    setSample((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return next
    })
  }

  function reset() {
    setName("")
    replaceSample(null)
    setNameInvalid(false)
    setElapsedMs(0)
  }

  async function startRecording() {
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      showErrorToast(
        "This browser cannot record here. Upload a file instead."
      )
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      showErrorToast(
        "The browser was not allowed to use the microphone. Allow it from the address bar, or upload a file instead."
      )
      return
    }
    const type = recordingType()
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : {})
    const chunks: Blob[] = []
    const startedAt = Date.now()
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      setRecordingSince(null)
      if (discardRef.current) return
      const durationMs = Math.min(Date.now() - startedAt, VOICE_SAMPLE_MAX_MS)
      const blobType = plainSoundType(recorder.mimeType || type || "audio/webm")
      const extension = blobType === "audio/mp4" ? "m4a" : "webm"
      const file = new File(chunks, `recording.${extension}`, { type: blobType })
      if (!file.size) {
        showErrorToast(
          "Nothing was recorded. Check the microphone is on and try again."
        )
        return
      }
      replaceSample({ file, url: URL.createObjectURL(file), durationMs })
    }
    recorderRef.current = recorder
    discardRef.current = false
    recorder.start()
    replaceSample(null)
    setElapsedMs(0)
    setRecordingSince(startedAt)
  }

  async function pickFile(file: File | undefined) {
    if (!file) return
    if (!VOICE_SAMPLE_TYPES.includes(plainSoundType(file.type))) {
      showErrorToast(VOICE_SAMPLE_TYPE_MESSAGE)
      return
    }
    if (file.size > VOICE_SAMPLE_MAX_BYTES) {
      showErrorToast(VOICE_SAMPLE_TOO_BIG_MESSAGE)
      return
    }
    const url = URL.createObjectURL(file)
    const durationMs = await readDuration(url)
    replaceSample({ file, url, durationMs })
    const refusal = durationMs != null ? sampleLengthRefusal(durationMs) : null
    if (refusal) showErrorToast(refusal)
  }

  async function create() {
    if (!sample) {
      showErrorToast(VOICE_SAMPLE_MISSING_MESSAGE)
      return
    }
    if (lengthRefusal) {
      showErrorToast(lengthRefusal)
      return
    }
    if (!name.trim()) {
      setNameInvalid(true)
      showErrorToast(VOICE_CLONE_NAME_MESSAGE)
      return
    }
    setCreating(true)
    try {
      const { voice, needsVerifying } = await makeOwnVoice(name, sample.file)
      dismissErrorToast()
      toast.success(
        needsVerifying
          ? `"${voice.name}" is made, but ElevenLabs wants to check it first. Finish that on elevenlabs.io before reading with it.`
          : `"${voice.name}" is ready. Pick it in the Voice window, where it is marked (yours).`
      )
      onCreated(voice)
      onOpenChange(false)
      reset()
    } catch (error) {
      showErrorToast(getVoiceCloneErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={!!name.trim() || !!sample || recording}
      busy={creating}
      onClose={() => {
        onOpenChange(false)
        reset()
      }}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Make a voice of my own</DialogTitle>
            <DialogDescription>
              Read for 10 to 60 seconds and ElevenLabs makes a voice that sounds
              like you. Making it costs nothing, but ElevenLabs only does it on
              a paid plan.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Whose voice</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <p>
                  The recording must be your own voice, or the voice of someone
                  who has agreed to have it copied. Copying anyone else's voice
                  is against ElevenLabs' rules.
                </p>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>The recording</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  A quiet room, one person talking, no music. Talk the way you
                  want the voice to sound.
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
                      disabled={creating}
                      onClick={() => void startRecording()}
                    >
                      <MicIcon />
                      {sample ? "Record again" : "Record"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={recording || creating}
                    onClick={() => fileRef.current?.click()}
                  >
                    <UploadIcon />
                    Upload a file
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT}
                    hidden
                    aria-label="Upload a recording"
                    onChange={(event) => {
                      void pickFile(event.target.files?.[0])
                      event.target.value = ""
                    }}
                  />
                </div>
                {recording ? (
                  <p
                    className="text-sm tabular-nums"
                    role="status"
                    aria-live="polite"
                  >
                    Recording, {formatClock(elapsedMs)}. It stops itself at{" "}
                    {formatClock(VOICE_SAMPLE_MAX_MS)}.
                  </p>
                ) : null}
                {sample ? (
                  <div className="grid gap-2">
                    <audio
                      controls
                      src={sample.url}
                      className="w-full"
                      aria-label="Hear the recording"
                    />
                    <p
                      className={
                        lengthRefusal
                          ? "text-sm text-destructive"
                          : "text-sm text-muted-foreground tabular-nums"
                      }
                    >
                      {lengthRefusal ??
                        (sample.durationMs != null
                          ? `${formatClock(sample.durationMs)} long.`
                          : "The length is checked when it is sent.")}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Name</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="voice-clone-name">What to call it</Label>
                  <Input
                    id="voice-clone-name"
                    value={name}
                    maxLength={VOICE_CLONE_NAME_MAX}
                    aria-invalid={nameInvalid || undefined}
                    placeholder="My voice"
                    onChange={(event) => {
                      setName(event.target.value)
                      if (event.target.value.trim()) setNameInvalid(false)
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creating || recording}
              onClick={() => void create()}
            >
              {creating ? <Loader2Icon className="animate-spin" /> : null}
              {creating ? "Making it…" : "Create voice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
