import * as React from "react"
import {
  AudioLines,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"

import { getMediaErrorMessage, uploadMedia } from "@/lib/api/media/media"
import {
  addSoundEffect,
  getSoundEffectErrorMessage,
  loadSoundEffects,
  removeSoundEffect,
} from "@/lib/api/video/sound-effects"
import type { MediaItem } from "@/server/media/library"
import {
  STOCK_SOUNDS,
  stockSoundUrl,
  type StockSound,
} from "@/lib/video/stock-sounds"
import {
  editorId,
  formatClock,
  loadMediaDurationMs,
  MediaDurationError,
} from "@/lib/video/timeline-utils"
import { showErrorToast } from "@/lib/toast/error-toast"
import { Button } from "@/components/ui/button"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Hint } from "@/components/video-assets/hint"
import {
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { useDragToTimeline } from "@/components/video-editor/use-drag-to-timeline"

/**
 * The Sounds panel: short sound effects to drop on cuts, beside Music. The
 * starter pack ships with Video (stock-sounds.ts), and below it are the
 * person's own, uploaded with the plus button.
 *
 * Dragging a row onto the timeline is the only way a sound lands, the same as
 * the Media panel, so pressing play to hear one never adds it by accident.
 */

type SoundItem =
  | { kind: "stock"; sound: StockSound }
  | { kind: "own"; file: MediaItem }

function itemKey(item: SoundItem) {
  return item.kind === "stock" ? `stock:${item.sound.id}` : item.file.id
}

function itemName(item: SoundItem) {
  return item.kind === "stock" ? item.sound.label : item.file.original_name
}

function itemUrl(item: SoundItem) {
  return item.kind === "stock" ? stockSoundUrl(item.sound.id) : item.file.url
}

const STOCK_GROUPS = [...new Set(STOCK_SOUNDS.map((sound) => sound.group))]

async function soundClip(item: SoundItem): Promise<EditorClip> {
  if (item.kind === "stock") {
    return {
      id: editorId(),
      kind: "audio",
      name: item.sound.label,
      stockSound: item.sound.id,
      url: stockSoundUrl(item.sound.id),
      sourceDurationMs: item.sound.durationMs,
      trimStartMs: 0,
      startMs: 0,
      durationMs: item.sound.durationMs,
    }
  }
  const sourceDurationMs = await loadMediaDurationMs(item.file.url, "audio")
  return {
    id: editorId(),
    kind: "audio",
    name: item.file.original_name,
    mediaId: item.file.id,
    url: item.file.url,
    sourceDurationMs,
    trimStartMs: 0,
    startMs: 0,
    durationMs: sourceDurationMs,
  }
}

export function SoundsPanel() {
  const { dispatch } = useEditorRuntime()
  const [own, setOwn] = React.useState<MediaItem[] | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const [uploading, setUploading] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [playingKey, setPlayingKey] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let active = true
    loadSoundEffects()
      .then((loaded) => {
        if (!active) return
        setOwn(loaded)
        setLoadFailed(false)
      })
      .catch(() => {
        if (active) setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [refresh])

  async function lay(item: SoundItem, atMs: number, trackId?: string) {
    try {
      dispatch({ type: "ADD_CLIP", clip: await soundClip(item), atMs, trackId })
    } catch (error) {
      showErrorToast(
        error instanceof MediaDurationError
          ? error.message
          : "That sound could not be read, so it was not added."
      )
    }
  }

  const { dragHandlers, ghost } = useDragToTimeline<SoundItem>({
    label: itemName,
    onDrop: (item, atMs, trackId) => void lay(item, atMs, trackId),
  })

  async function handleUpload(list: FileList | null) {
    if (!list?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(list)) {
        let mediaId: string
        try {
          mediaId = (await uploadMedia(file)).id
        } catch (error) {
          // One file refused never stops the rest of the batch.
          showErrorToast(`${file.name}: ${getMediaErrorMessage(error)}`)
          continue
        }
        await addSoundEffect(mediaId)
      }
    } catch (error) {
      showErrorToast(getSoundEffectErrorMessage(error))
    } finally {
      setUploading(false)
      setRefresh((count) => count + 1)
    }
  }

  async function takeOff(file: MediaItem) {
    setBusyId(file.id)
    try {
      await removeSoundEffect(file.id)
    } catch (error) {
      showErrorToast(getSoundEffectErrorMessage(error))
    } finally {
      setBusyId(null)
      setRefresh((count) => count + 1)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<AudioLines className="size-4" />}
        title="Sounds"
        action={
          <>
            <Hint label="Upload a sound">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={uploading}
                aria-label="Upload a sound"
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
        <div className="grid gap-6 p-4">
          <p className="text-xs text-muted-foreground">
            Drag a sound onto the timeline where you want it to play.
          </p>

          <section className="grid gap-2" aria-label="Your sounds">
            <h3 className="text-xs font-medium text-muted-foreground">
              Your sounds{own ? ` · ${own.length}` : ""}
            </h3>
            {own === null && !loadFailed ? (
              <LoadingRow label="Loading your sounds" />
            ) : loadFailed ? (
              <div className="grid justify-items-center gap-2 py-4 text-center text-sm text-muted-foreground">
                Your sounds could not be loaded.
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRefresh((count) => count + 1)}
                >
                  Try again
                </Button>
              </div>
            ) : own?.length ? (
              <ul className="grid gap-2">
                {own.map((file) => {
                  const item: SoundItem = { kind: "own", file }
                  return (
                    <SoundRow
                      key={file.id}
                      item={item}
                      playing={playingKey === itemKey(item)}
                      onPlayingChange={setPlayingKey}
                      dragProps={dragHandlers(item)}
                      corner={
                        <Hint label="Take off your sounds">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busyId === file.id}
                            aria-label={`Take ${file.original_name} off your sounds`}
                            onClick={() => void takeOff(file)}
                          >
                            <XIcon />
                          </Button>
                        </Hint>
                      }
                    />
                  )
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No sounds of your own yet. Upload one with the plus button.
              </p>
            )}
          </section>

          {STOCK_GROUPS.map((group) => (
            <section key={group} className="grid gap-2" aria-label={group}>
              <h3 className="text-xs font-medium text-muted-foreground">{group}</h3>
              <ul className="grid gap-2">
                {STOCK_SOUNDS.filter((sound) => sound.group === group).map((sound) => {
                  const item: SoundItem = { kind: "stock", sound }
                  return (
                    <SoundRow
                      key={sound.id}
                      item={item}
                      playing={playingKey === itemKey(item)}
                      onPlayingChange={setPlayingKey}
                      dragProps={dragHandlers(item)}
                    />
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </ScrollArea>
      {ghost}
    </div>
  )
}

// Most sound effects are under a second, which a clock shows as "0:00".
function formatSoundLength(ms: number) {
  if (!ms) return "-"
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : formatClock(ms)
}

/**
 * One sound: a play button to hear it, its name and length, and the row
 * itself to drag. Only one plays at a time; starting another stops this one.
 */
function SoundRow({
  item,
  playing,
  onPlayingChange,
  dragProps,
  corner,
}: {
  item: SoundItem
  playing: boolean
  onPlayingChange: (key: string | null) => void
  dragProps: React.HTMLAttributes<HTMLLIElement>
  corner?: React.ReactNode
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const [lengthMs, setLengthMs] = React.useState(
    item.kind === "stock" ? item.sound.durationMs : 0
  )
  const name = itemName(item)

  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!playing) {
      audio.pause()
      audio.currentTime = 0
    }
  }, [playing])

  React.useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  async function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      onPlayingChange(null)
      return
    }
    onPlayingChange(itemKey(item))
    try {
      await audio.play()
    } catch {
      onPlayingChange(null)
      showErrorToast("This sound could not be played.")
    }
  }

  return (
    <li
      {...dragProps}
      data-sound={itemKey(item)}
      className="grid cursor-grab touch-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2 select-none active:cursor-grabbing"
    >
      <Hint label={playing ? "Stop" : "Play"}>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="shrink-0 rounded-full"
          aria-label={playing ? `Stop ${name}` : `Play ${name}`}
          // The row drags; the button only plays.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void toggle()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
      </Hint>
      <div className="grid min-w-0">
        <span className="truncate text-xs font-medium">{name}</span>
        <span className="text-[0.625rem] text-muted-foreground tabular-nums">
          {formatSoundLength(lengthMs)}
        </span>
      </div>
      {corner ?? <span />}
      <audio
        hidden
        ref={audioRef}
        src={itemUrl(item)}
        preload={item.kind === "own" ? "metadata" : "none"}
        onLoadedMetadata={(event) => {
          if (item.kind === "stock") return
          const seconds = event.currentTarget.duration
          setLengthMs(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0)
        }}
        onEnded={() => onPlayingChange(null)}
      />
    </li>
  )
}
