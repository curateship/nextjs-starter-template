import * as React from "react"
import {
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react"

import { getMediaErrorMessage, uploadMedia } from "@/lib/api/media/media"
import {
  addSoundEffect,
  getSoundEffectErrorMessage,
  loadSoundEffects,
  removeSoundEffect,
} from "@/lib/api/video/sound-effects"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MakeSoundDialog } from "@/components/video-editor/make-sound-dialog"
import { soundLaneAt } from "@/lib/video/sound-lanes"
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
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SoundsTabsHeader } from "@/components/video-editor/sounds-tabs"
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
  const { dispatch, clock, store } = useEditorRuntime()
  const [making, setMaking] = React.useState(false)
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

  async function addClip(item: SoundItem, place: (clip: EditorClip) => void) {
    try {
      place(await soundClip(item))
    } catch (error) {
      showErrorToast(
        error instanceof MediaDurationError
          ? error.message
          : "That sound could not be read, so it was not added."
      )
    }
  }

  // A drop lands on the lane under the pointer.
  function lay(item: SoundItem, atMs: number, trackId?: string) {
    void addClip(item, (clip) => dispatch({ type: "ADD_CLIP", clip, atMs, trackId }))
  }

  // The + has no lane to aim at, so it opens a new one at the playhead rather
  // than squeezing onto whichever lane has room, which could be the video's own.
  function addAtPlayhead(item: SoundItem) {
    const atMs = clock.getTime()
    void addClip(item, (clip) =>
      dispatch({ type: "ADD_CLIP_TO_NEW_TRACK", clip, atMs })
    )
  }

  const { dragHandlers, ghost } = useDragToTimeline<SoundItem>({
    label: itemName,
    onDrop: lay,
  })

  // A sound made from words lands at the playhead on the first sound lane
  // with room there, or a lane of its own (ai-sound-effects.md).
  function madeSound(file: MediaItem) {
    setRefresh((count) => count + 1)
    const atMs = clock.getTime()
    void addClip({ kind: "own", file }, (clip) => {
      const trackId = soundLaneAt(store.getSnapshot().state.tracks, atMs, clip.durationMs)
      dispatch(
        trackId
          ? { type: "ADD_CLIP", clip, atMs, trackId }
          : { type: "ADD_CLIP_TO_NEW_TRACK", clip, atMs }
      )
    })
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
      <SoundsTabsHeader
        action={
          <>
            <DropdownMenu>
              <Hint label="Add a sound" disabled={uploading}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={uploading}
                    aria-label="Add a sound"
                  >
                    {uploading ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                  </Button>
                </DropdownMenuTrigger>
              </Hint>
              <DropdownMenuContent align="end" className="w-52">
                {/* After the menu has closed, so it does not take the window's focus with it. */}
                <DropdownMenuItem onSelect={() => window.setTimeout(() => setMaking(true), 0)}>
                  <WandSparklesIcon />
                  Make a sound with AI
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                  <UploadIcon />
                  Upload a sound
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        <div className="grid gap-6 p-3">
          <p className="text-xs text-muted-foreground">
            Press + to add a sound at the playhead, or drag it onto the timeline.
          </p>

          <section className="grid gap-2" aria-label="Your sounds">
            <h3 className="text-xs font-medium text-muted-foreground">
              Your sounds{own ? ` · ${own.length}` : ""}
            </h3>
            {loadFailed ? (
              <ErrorRow
                message="Your sounds could not be loaded."
                onRetry={() => setRefresh((count) => count + 1)}
                className="py-4"
              />
            ) : own === null ? null : own?.length ? (
              <ul className="grid gap-3">
                {own.map((file) => {
                  const item: SoundItem = { kind: "own", file }
                  return (
                    <SoundRow
                      key={file.id}
                      item={item}
                      playing={playingKey === itemKey(item)}
                      onPlayingChange={setPlayingKey}
                      dragProps={dragHandlers(item)}
                      onAdd={() => addAtPlayhead(item)}
                      busy={busyId === file.id}
                      onRemove={() => void takeOff(file)}
                    />
                  )
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No sounds of your own yet. Make one with AI or upload one from the plus button.
              </p>
            )}
          </section>

          {STOCK_GROUPS.map((group) => (
            <section key={group} className="grid gap-2" aria-label={group}>
              <h3 className="text-xs font-medium text-muted-foreground">{group}</h3>
              <ul className="grid gap-3">
                {STOCK_SOUNDS.filter((sound) => sound.group === group).map((sound) => {
                  const item: SoundItem = { kind: "stock", sound }
                  return (
                    <SoundRow
                      key={sound.id}
                      item={item}
                      playing={playingKey === itemKey(item)}
                      onPlayingChange={setPlayingKey}
                      dragProps={dragHandlers(item)}
                      onAdd={() => addAtPlayhead(item)}
                    />
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </ScrollArea>
      {ghost}
      <MakeSoundDialog open={making} onOpenChange={setMaking} onMade={madeSound} />
    </div>
  )
}

// Most sound effects are under a second, which a clock shows as "0:00".
function formatSoundLength(ms: number) {
  if (!ms) return "-"
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : formatClock(ms)
}

/**
 * One sound, laid out like a Music row: a play button, its name and length,
 * a + that lays it at the playhead, and a trash can on your own sounds. The
 * row itself still drags onto the timeline. Only one plays at a time; starting another stops this one.
 */
function SoundRow({
  item,
  playing,
  onPlayingChange,
  dragProps,
  onAdd,
  busy = false,
  onRemove,
}: {
  item: SoundItem
  playing: boolean
  onPlayingChange: (key: string | null) => void
  dragProps: React.HTMLAttributes<HTMLLIElement>
  onAdd: () => void
  busy?: boolean
  /** Only your own sounds can be removed; the built-in ones have no trash can. */
  onRemove?: () => void
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
      className="grid cursor-grab touch-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1 rounded-lg border p-2 select-none active:cursor-grabbing"
    >
      <Hint label={playing ? "Stop" : "Play"}>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="mr-1 shrink-0 rounded-full"
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
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatSoundLength(lengthMs)}
        </span>
      </div>
      <Hint label="Add at playhead">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Add ${name} at the playhead`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onAdd}
        >
          <PlusIcon />
        </Button>
      </Hint>
      {onRemove ? (
        <Hint label="Remove from Sounds" disabled={busy}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`Remove ${name} from your sounds`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onRemove}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
          </Button>
        </Hint>
      ) : (
        <span />
      )}
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
