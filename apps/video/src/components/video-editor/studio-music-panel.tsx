import * as React from "react"
import {
  Loader2Icon,
  Music,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  XIcon,
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
import { formatFileSize } from "@/lib/format/format-bytes"
import { loadMediaDurationMs, formatClock } from "@/lib/video/timeline-utils"
import { showErrorToast } from "@/lib/toast/error-toast"
import { Button } from "@/components/ui/button"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  timelineDurationMs,
  useEditorRuntime,
} from "@/components/video-editor/editor-store"

/**
 * The Music panel: the sound files marked as music, each one press away from
 * running under the whole project, and below them every other sound file,
 * each one press away from joining the music.
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

  const music = files?.filter((file) => file.is_music) ?? []
  const others = files?.filter((file) => !file.is_music) ?? []

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

  async function changeShelf(file: MusicShelfFile, toMusic: boolean) {
    setBusyId(file.id)
    try {
      if (toMusic) await addToMusicShelf(file.id)
      else await removeFromMusicShelf(file.id)
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={uploading}
              aria-label="Upload music"
              title="Upload music"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            </Button>
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
        <div className="grid gap-6 p-4">
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
            <>
              <section className="grid gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Music · {music.length}
                </h3>
                {music.length ? (
                  <ul className="grid gap-2">
                    {music.map((file) => (
                      <SoundRow
                        key={file.id}
                        file={file}
                        showLength
                        playing={playingId === file.id}
                        onPlayingChange={setPlayingId}
                        corner={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busyId === file.id}
                            aria-label={`Take ${file.original_name} off the music shelf`}
                            title="Take off the music shelf"
                            onClick={() => void changeShelf(file, false)}
                          >
                            <XIcon />
                          </Button>
                        }
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={busyId === file.id}
                          onClick={() => void layUnder(file)}
                        >
                          <PlusIcon />
                          Add under video
                        </Button>
                      </SoundRow>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No music yet. Upload a track with the plus button, or put
                    one of your sound files below on the shelf.
                  </p>
                )}
              </section>

              {others.length ? (
                <section className="grid gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Other sound files · {others.length}
                  </h3>
                  <ul className="grid gap-2">
                    {others.map((file) => (
                      <SoundRow
                        key={file.id}
                        file={file}
                        playing={playingId === file.id}
                        onPlayingChange={setPlayingId}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={busyId === file.id}
                          onClick={() => void changeShelf(file, true)}
                        >
                          Use as music
                        </Button>
                      </SoundRow>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * One sound file: a play button to hear it, its name, and whatever it can be
 * done with. Only one plays at a time; starting another stops this one.
 *
 * The button sits on a line of its own under the name. Beside the name it
 * needed more room than a narrow panel has, and the row spilled sideways.
 *
 * A music row shows how long the track runs, which means reading the start of
 * the file. Every other row shows its size instead, so a long list of
 * voiceovers is not dozens of downloads just to open the panel.
 */
function SoundRow({
  file,
  showLength = false,
  playing,
  onPlayingChange,
  corner,
  children,
}: {
  file: MusicShelfFile
  showLength?: boolean
  playing: boolean
  onPlayingChange: (mediaId: string | null) => void
  corner?: React.ReactNode
  children: React.ReactNode
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
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2">
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        className="shrink-0 rounded-full"
        aria-label={playing ? `Pause ${file.original_name}` : `Play ${file.original_name}`}
        title={playing ? "Pause" : "Play"}
        onClick={() => void togglePreview()}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <div className="grid min-w-0">
        <span
          className="line-clamp-2 text-xs font-medium [overflow-wrap:anywhere]"
          title={file.original_name}
        >
          {file.original_name}
        </span>
        <span className="text-[0.625rem] text-muted-foreground tabular-nums">
          {showLength
            ? lengthMs
              ? formatClock(lengthMs)
              : "—"
            : formatFileSize(file.file_size)}
        </span>
      </div>
      {corner ?? <span />}
      <div className="col-span-3">{children}</div>
      <audio
        hidden
        ref={audioRef}
        src={file.url}
        preload={showLength ? "metadata" : "none"}
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration
          setLengthMs(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0)
        }}
        onEnded={() => onPlayingChange(null)}
      />
    </li>
  )
}
