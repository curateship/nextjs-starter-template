import * as React from "react"
import {
  AudioLinesIcon,
  Loader2Icon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import {
  loadAiToolsAvailability,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import {
  getVoiceoverErrorMessage,
  loadVoiceovers,
  removeFromVoiceovers,
  type SavedVoiceover,
} from "@/lib/api/video/voiceovers"
import {
  VOICEOVER_SEARCH_MAX,
  VOICEOVER_SHELF_LIMIT,
  voiceoverClips,
  voiceoverRefusal,
} from "@/lib/video/saved-voiceovers"
import { formatClock } from "@/lib/video/timeline-utils"
import { showErrorToast } from "@/lib/toast/error-toast"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SoundsTabsHeader } from "@/components/video-editor/sounds-tabs"
import { useCaptionPlacement } from "@/components/video-editor/caption-settings-context"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { OwnVoices } from "@/components/video-editor/studio-own-voices"
import { RecordVoiceoverDialog } from "@/components/video-editor/record-voiceover-dialog"
import { VoiceDialog } from "@/components/video-editor/voice-dialog"
import { Hint } from "@/components/video-assets/hint"

/**
 * The Voices panel: every voiceover already made, searchable by what it says,
 * each one press away from landing at the playhead with its captions. Reusing
 * one costs nothing; only reading new words does.
 *
 * Everything that makes a new one starts at the header's +: a script read by
 * the AI, a voiceover you record, or a copy of your own voice for the AI to
 * read with (Tyler, 5 Nov 2026). Above the list sit the voices made from your
 * own recordings.
 */
export function VoiceoversPanel() {
  const { store, dispatch, clock } = useEditorRuntime()
  const captions = useCaptionPlacement()
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [voiceovers, setVoiceovers] = React.useState<SavedVoiceover[] | null>(
    null
  )
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [refresh, setRefresh] = React.useState(0)
  const [playingId, setPlayingId] = React.useState<string | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [makingVoice, setMakingVoice] = React.useState(false)
  const [readingOpen, setReadingOpen] = React.useState(false)
  const [recordingOpen, setRecordingOpen] = React.useState(false)
  const [available, setAvailable] = React.useState<AiToolsAvailability | null>(
    null
  )
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    loadAiToolsAvailability()
      .then((loaded) => {
        if (active) setAvailable(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  // Both end by changing the timeline, so a locked window stops them first.
  function openReading() {
    if (store.refuseIfLocked()) return
    setReadingOpen(true)
  }

  function openRecording() {
    if (store.refuseIfLocked()) return
    setRecordingOpen(true)
  }

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  React.useEffect(() => {
    let active = true
    loadVoiceovers(debounced)
      .then((loaded) => {
        if (!active) return
        setVoiceovers(loaded)
        setLoadError(null)
      })
      .catch((error) => {
        if (!active) return
        setLoadError(getVoiceoverErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [debounced, refresh])

  function layDown(voiceover: SavedVoiceover) {
    const refusal = voiceoverRefusal(
      store.getSnapshot().state.tracks,
      voiceover.captions
    )
    if (refusal) {
      showErrorToast(refusal)
      return
    }
    const atMs = clock.getTime()
    dispatch({
      type: "INSERT_VOICEOVER",
      // The saved look, the same as a fresh voiceover's captions.
      ...voiceoverClips(voiceover, atMs, captions),
    })
  }

  async function takeOff(voiceover: SavedVoiceover) {
    setBusyId(voiceover.mediaId)
    try {
      await removeFromVoiceovers(voiceover.mediaId)
    } catch {
      showErrorToast("That voiceover could not be removed. Try again.")
    } finally {
      setBusyId(null)
      setRefresh((count) => count + 1)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SoundsTabsHeader
        action={
          // A search and a + in the header, as the Media panel has.
          <div className="flex items-center gap-2">
            {/* A popover rather than a box under the button, so it moves
                clear of the rail when the panel is narrow. */}
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <Hint label="Search voiceovers">
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Search voiceovers"
                    aria-pressed={searchOpen}
                  >
                    <SearchIcon className={search ? "text-foreground" : undefined} />
                  </Button>
                </PopoverTrigger>
              </Hint>
              <PopoverContent align="start" className="w-60 p-2">
                <Input
                  autoFocus
                  type="search"
                  value={search}
                  maxLength={VOICEOVER_SEARCH_MAX}
                  placeholder="Search the words"
                  aria-label="Search voiceovers by what was said"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="New voiceover"
                    >
                      <PlusIcon />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>New voiceover</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={openReading}>
                  <SparklesIcon />
                  Read a script with AI
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openRecording}>
                  <MicIcon />
                  Record a voiceover
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setMakingVoice(true)}>
                  <AudioLinesIcon />
                  Make a copy of my voice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <OwnVoices making={makingVoice} onMakingChange={setMakingVoice} />
      <VoiceDialog
        open={readingOpen}
        onOpenChange={(next) => {
          setReadingOpen(next)
          // A reading lands on the shelf, so the list asks again.
          if (!next) setRefresh((count) => count + 1)
        }}
        available={available}
      />
      <RecordVoiceoverDialog
        open={recordingOpen}
        onOpenChange={setRecordingOpen}
        available={available}
        onKept={() => setRefresh((count) => count + 1)}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          {loadError ? (
            <ErrorRow
              message={loadError}
              onRetry={() => setRefresh((count) => count + 1)}
            />
          ) : voiceovers === null ? null : !voiceovers?.length ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {debounced
                ? `No voiceover says "${debounced}".`
                : "No voiceovers yet. Press + to have a script read by AI or to record your own. Each one shows up here, ready to use again."}
            </p>
          ) : (
            <>
              <ul className="grid gap-3">
                {voiceovers.map((voiceover) => (
                  <VoiceoverRow
                    key={voiceover.mediaId}
                    voiceover={voiceover}
                    playing={playingId === voiceover.mediaId}
                    onPlayingChange={setPlayingId}
                    busy={busyId === voiceover.mediaId}
                    onAdd={() => layDown(voiceover)}
                    onRemove={() => void takeOff(voiceover)}
                  />
                ))}
              </ul>
              {voiceovers.length >= VOICEOVER_SHELF_LIMIT ? (
                <p className="text-center text-xs text-muted-foreground">
                  The newest {VOICEOVER_SHELF_LIMIT} are shown. Search to
                  reach older ones.
                </p>
              ) : null}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * One voiceover, laid out like a Music row: a play button, the words it says
 * with who said them and how long it runs, a + that lays it at the playhead,
 * and a trash can that takes it off the list. Only one plays at a time.
 */
function VoiceoverRow({
  voiceover,
  playing,
  onPlayingChange,
  busy,
  onAdd,
  onRemove,
}: {
  voiceover: SavedVoiceover
  playing: boolean
  busy: boolean
  onPlayingChange: (mediaId: string | null) => void
  onAdd: () => void
  onRemove: () => void
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
    onPlayingChange(voiceover.mediaId)
    try {
      await audio.play()
    } catch {
      onPlayingChange(null)
      showErrorToast(
        "This voiceover could not be played. Its file may have been deleted."
      )
    }
  }

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1 rounded-lg border p-2">
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        className="mr-1 shrink-0 rounded-full"
        aria-label={playing ? "Pause this voiceover" : "Play this voiceover"}
        onClick={() => void togglePreview()}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <div className="grid min-w-0">
        <span className="line-clamp-3 text-xs font-medium [overflow-wrap:anywhere]">
          {/* A recording Whisper could not write down has no words. */}
          {voiceover.script || voiceover.name}
        </span>
        <span className="truncate text-xs text-muted-foreground tabular-nums">
          {voiceover.voiceName} · {formatClock(voiceover.durationMs)}
        </span>
      </div>
      <Hint label="Add at playhead">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Add this voiceover at the playhead"
          onClick={onAdd}
        >
          <PlusIcon />
        </Button>
      </Hint>
      <Hint label="Remove from Voiceovers" disabled={busy}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label="Remove this voiceover from the list"
          onClick={onRemove}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
        </Button>
      </Hint>
      <audio
        hidden
        ref={audioRef}
        src={voiceover.url}
        preload="none"
        onEnded={() => onPlayingChange(null)}
      />
    </li>
  )
}
