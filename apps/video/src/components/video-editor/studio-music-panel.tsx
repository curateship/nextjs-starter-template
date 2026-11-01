import * as React from "react"
import {
  Loader2Icon,
  Music,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { getMediaErrorMessage, uploadMedia } from "@/lib/api/media/media"
import {
  addToMusicShelf,
  getMusicErrorMessage,
  loadMusicShelf,
  removeFromMusicShelf,
  type MusicShelfFile,
} from "@/lib/api/video/music"
import {
  MUSIC_UNREADABLE_MESSAGE,
  musicRefusal,
  planMusicClips,
} from "@/lib/video/background-music"
import { loadMediaDurationMs, formatClock } from "@/lib/video/timeline-utils"
import { showErrorToast } from "@/lib/toast/error-toast"
import { Button } from "@/components/ui/button"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Hint } from "@/components/video-assets/hint"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  timelineDurationMs,
  useEditorRuntime,
} from "@/components/video-editor/editor-store"
import { forgetBeats } from "@/components/video-editor/sound-tool-store"

/**
 * The Music panel: the tracks you uploaded as music, each with a + that lays it
 * under the whole project and a trash can that takes it off the list.
 *
 * Laying a track down is worked out in background-music.ts and lands as one
 * edit, so one undo takes the whole lane back off.
 */
export function MusicPanel() {
  const { store, dispatch } = useEditorRuntime()
  const [files, setFiles] = React.useState<MusicShelfFile[] | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [playingId, setPlayingId] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let active = true
    loadMusicShelf()
      .then((loaded) => {
        if (!active) return
        setFiles(loaded)
        setLoadFailed(false)
      })
      .catch(() => {
        if (active) setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [refresh])

  const music = files ?? []

  async function layUnder(file: MusicShelfFile) {
    setBusyId(file.id)
    try {
      let sourceDurationMs: number
      try {
        sourceDurationMs = await loadMediaDurationMs(file.url, "audio")
      } catch {
        showErrorToast(MUSIC_UNREADABLE_MESSAGE)
        return
      }
      const tracks = store.getSnapshot().state.tracks
      const clips = planMusicClips(
        {
          mediaId: file.id,
          name: file.original_name,
          url: file.url,
          sourceDurationMs,
        },
        timelineDurationMs(tracks)
      )
      const refusal = musicRefusal(tracks, clips)
      if (refusal) {
        showErrorToast(refusal)
        return
      }
      dispatch({ type: "ADD_MUSIC_TRACK", clips })
    } finally {
      setBusyId(null)
    }
  }

  async function takeOffShelf(file: MusicShelfFile) {
    setBusyId(file.id)
    try {
      await removeFromMusicShelf(file.id)
    } catch (error) {
      showErrorToast(getMusicErrorMessage(error))
    } finally {
      setBusyId(null)
      // After a failure too: a file deleted elsewhere is the usual cause, and
      // reloading takes its stale row off the list.
      setRefresh((count) => count + 1)
    }
  }

  async function handleUpload(list: FileList | null) {
    if (!list?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(list)) {
        let mediaId: string
        try {
          mediaId = (await uploadMedia(file)).id
        } catch (error) {
          showErrorToast(`${file.name}: ${getMediaErrorMessage(error)}`)
          return
        }
        await addToMusicShelf(mediaId)
        forgetBeats(mediaId)
      }
    } catch (error) {
      showErrorToast(getMusicErrorMessage(error))
    } finally {
      setUploading(false)
      setRefresh((count) => count + 1)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<Music className="size-4" />}
        title="Music"
        action={
          <>
            <Hint label="Upload music" disabled={uploading}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={uploading}
                aria-label="Upload music"
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              </Button>
            </Hint>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              multiple
              hidden
              onChange={(event) => {
                void handleUpload(event.target.files)
                event.target.value = ""
              }}
            />
          </>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid p-3">
          {files === null && !loadFailed ? (
            <LoadingRow label="Loading music" />
          ) : loadFailed ? (
            <div className="grid justify-items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              The music shelf could not be loaded.
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefresh((count) => count + 1)}
              >
                Try again
              </Button>
            </div>
          ) : (
            music.length ? (
              <ul className="grid gap-3">
                {music.map((file) => (
                  <MusicRow
                    key={file.id}
                    file={file}
                    busy={busyId === file.id}
                    playing={playingId === file.id}
                    onPlayingChange={setPlayingId}
                    onAdd={() => void layUnder(file)}
                    onRemove={() => void takeOffShelf(file)}
                  />
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No music yet. Upload a track with the + above.
              </p>
            )
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * One track: a play button to hear it, its name and length, a + that lays it
 * under the video, and a trash can that takes it off the Music list. The file
 * itself stays in the media library. Only one track plays at a time; starting
 * another stops this one.
 */
function MusicRow({
  file,
  busy,
  playing,
  onPlayingChange,
  onAdd,
  onRemove,
}: {
  file: MusicShelfFile
  busy: boolean
  playing: boolean
  onPlayingChange: (mediaId: string | null) => void
  onAdd: () => void
  onRemove: () => void
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const [lengthMs, setLengthMs] = React.useState(0)

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
    onPlayingChange(file.id)
    try {
      await audio.play()
    } catch {
      onPlayingChange(null)
      showErrorToast("This track could not be played.")
    }
  }

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1 rounded-lg border p-2">
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        className="mr-1 shrink-0 rounded-full"
        aria-label={playing ? `Pause ${file.original_name}` : `Play ${file.original_name}`}
        onClick={() => void togglePreview()}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <div className="grid min-w-0">
        <span className="line-clamp-2 text-xs font-medium [overflow-wrap:anywhere]">
          {file.original_name}
        </span>
        <span className="text-[0.625rem] text-muted-foreground tabular-nums">
          {lengthMs ? formatClock(lengthMs) : "-"}
        </span>
      </div>
      <Hint label="Add to video" disabled={busy}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={`Add ${file.original_name} to the video`}
          onClick={onAdd}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        </Button>
      </Hint>
      <Hint label="Remove from Music" disabled={busy}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={`Remove ${file.original_name} from Music`}
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </Hint>
      <audio
        hidden
        ref={audioRef}
        src={file.url}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration
          setLengthMs(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0)
        }}
        onEnded={() => onPlayingChange(null)}
      />
    </li>
  )
}
