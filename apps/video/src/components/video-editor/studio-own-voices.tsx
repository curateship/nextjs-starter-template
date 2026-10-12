import * as React from "react"
import { PauseIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  deleteOwnVoice,
  getVoiceCloneErrorMessage,
  loadClonedVoices,
  type ClonedVoice,
} from "@/lib/api/video/cloned-voices"
import { showErrorToast } from "@/lib/toast/error-toast"
import { VoiceCloneDialog } from "@/components/video-editor/voice-clone-dialog"

/**
 * "Your voices", at the top of the Voices panel: the voices made from your
 * own recordings, each with its recording to hear and a delete, and the
 * New voice button, which opens "Make a voice of my own". They are picked in the Voice window, where
 * they are marked (yours).
 */
export function OwnVoices() {
  const [voices, setVoices] = React.useState<ClonedVoice[] | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const [making, setMaking] = React.useState(false)
  const [deleting, setDeleting] = React.useState<ClonedVoice | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [playingId, setPlayingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    loadClonedVoices()
      .then((loaded) => {
        if (!active) return
        setVoices(loaded)
        setLoadFailed(false)
      })
      .catch((error) => {
        if (!active) return
        setLoadFailed(true)
        showErrorToast(getVoiceCloneErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [refresh])

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteOwnVoice(deleting.id)
      setVoices((current) =>
        (current ?? []).filter((voice) => voice.id !== deleting.id)
      )
      toast.success(`"${deleting.name}" is deleted, here and at ElevenLabs.`)
      setDeleting(null)
    } catch (error) {
      showErrorToast(getVoiceCloneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid min-w-0 gap-2 border-b p-4" aria-label="Your voices">
      <h3 className="text-xs font-medium text-muted-foreground">Your voices</h3>
      {voices === null && !loadFailed ? (
        <LoadingRow label="Loading your voices" className="py-2" />
      ) : loadFailed ? (
        <div className="grid justify-items-start gap-2 text-sm text-muted-foreground">
          Your voices could not be loaded.
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefresh((count) => count + 1)}
          >
            Try again
          </Button>
        </div>
      ) : voices?.length ? (
        <ul className="grid gap-2">
          {voices.map((voice) => (
            <OwnVoiceRow
              key={voice.id}
              voice={voice}
              playing={playingId === voice.id}
              onPlayingChange={setPlayingId}
              onDelete={() => setDeleting(voice)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          None yet. Record yourself for 10 to 60 seconds and read scripts in
          your own voice.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setMaking(true)}
      >
        <PlusIcon />
        New voice
      </Button>

      <VoiceCloneDialog
        open={making}
        onOpenChange={setMaking}
        onCreated={(voice) =>
          setVoices((current) => [voice, ...(current ?? [])])
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this voice?"
        description={`This deletes "${deleting?.name ?? ""}" here and at ElevenLabs, so nobody can read with it again. Voiceovers already read in it keep playing, and the recording it was made from stays in your media library.`}
        confirmLabel="Delete voice"
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

function OwnVoiceRow({
  voice,
  playing,
  onPlayingChange,
  onDelete,
}: {
  voice: ClonedVoice
  playing: boolean
  onPlayingChange: (id: string | null) => void
  onDelete: () => void
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null)

  React.useEffect(() => {
    if (!playing) audioRef.current?.pause()
  }, [playing])

  // Closing the panel stops whatever is playing.
  React.useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  async function togglePreview() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      onPlayingChange(null)
      return
    }
    onPlayingChange(voice.id)
    try {
      await audio.play()
    } catch {
      onPlayingChange(null)
      showErrorToast(
        "The recording could not be played. Its file may have been deleted."
      )
    }
  }

  return (
    <li className="flex items-center gap-2 rounded-lg border p-2">
      {voice.sampleUrl ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="shrink-0 rounded-full"
          aria-label={
            playing
              ? `Pause the recording of ${voice.name}`
              : `Play the recording of ${voice.name}`
          }
          title={playing ? "Pause" : "Play the recording"}
          onClick={() => void togglePreview()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {voice.name}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label={`Delete ${voice.name}`}
        title="Delete"
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
      {voice.sampleUrl ? (
        <audio
          hidden
          ref={audioRef}
          src={voice.sampleUrl}
          preload="none"
          onEnded={() => onPlayingChange(null)}
        />
      ) : null}
    </li>
  )
}
