import * as React from "react"
import {
  MicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  getVoiceoverErrorMessage,
  loadVoiceovers,
  type SavedVoiceover,
} from "@/lib/api/video/voiceovers"
import { plural } from "@/lib/format/plural"
import {
  VOICEOVER_SEARCH_MAX,
  VOICEOVER_SHELF_LIMIT,
  voiceoverClips,
  voiceoverRefusal,
} from "@/lib/video/saved-voiceovers"
import { formatClock } from "@/lib/video/timeline-utils"
import { showErrorToast } from "@/lib/toast/error-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { useCaptionPlacement } from "@/components/video-editor/caption-settings-context"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { OwnVoices } from "@/components/video-editor/studio-own-voices"

/**
 * The Voiceovers panel: every voiceover already read aloud, searchable by
 * what it says, each one press away from landing at the playhead with its
 * captions. Reusing one costs nothing; only reading new words does.
 *
 * Above them sit the voices made from your own recordings, because this is
 * the panel about voices and the Voice window cannot open another window.
 */
export function VoiceoversPanel() {
  const { store, dispatch, clock } = useEditorRuntime()
  const captions = useCaptionPlacement()
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [voiceovers, setVoiceovers] = React.useState<SavedVoiceover[] | null>(
    null
  )
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const [playingId, setPlayingId] = React.useState<string | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [makingVoice, setMakingVoice] = React.useState(false)

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
        setLoadFailed(false)
      })
      .catch((error) => {
        if (!active) return
        setLoadFailed(true)
        showErrorToast(getVoiceoverErrorMessage(error))
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
    const count = voiceover.captions.length
    toast.success(
      `Added at ${formatClock(atMs)}, with ${count} ${plural(count, "caption", "captions")}. Undo removes it.`
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<MicIcon className="size-4" />}
        title="Voiceovers"
        action={
          // A search and a + in the header, as the Media panel has.
          <div className="flex items-center gap-2">
            {/* A popover rather than a box under the button, so it moves
                clear of the rail when the panel is narrow. */}
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Search voiceovers"
                  title="Search voiceovers"
                  aria-pressed={searchOpen}
                >
                  <SearchIcon className={search ? "text-foreground" : undefined} />
                </Button>
              </PopoverTrigger>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="New voice"
                  onClick={() => setMakingVoice(true)}
                >
                  <PlusIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New voice</TooltipContent>
            </Tooltip>
          </div>
        }
      />

      <OwnVoices making={makingVoice} onMakingChange={setMakingVoice} />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-2 p-4">
          {voiceovers === null && !loadFailed ? (
            <LoadingRow label="Loading voiceovers" />
          ) : loadFailed ? (
            <div className="grid justify-items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              Your voiceovers could not be loaded.
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefresh((count) => count + 1)}
              >
                Try again
              </Button>
            </div>
          ) : !voiceovers?.length ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {debounced
                ? `No voiceover says "${debounced}".`
                : "No voiceovers yet. Anything you have read aloud from the AI panel shows up here, ready to use again."}
            </p>
          ) : (
            <>
              <ul className="grid gap-2">
                {voiceovers.map((voiceover) => (
                  <VoiceoverRow
                    key={voiceover.mediaId}
                    voiceover={voiceover}
                    playing={playingId === voiceover.mediaId}
                    onPlayingChange={setPlayingId}
                    onAdd={() => layDown(voiceover)}
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
 * One voiceover: a play button to hear it, the words it says, who said them
 * and how long it runs. Only one plays at a time.
 */
function VoiceoverRow({
  voiceover,
  playing,
  onPlayingChange,
  onAdd,
}: {
  voiceover: SavedVoiceover
  playing: boolean
  onPlayingChange: (mediaId: string | null) => void
  onAdd: () => void
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
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-lg border p-2">
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        className="shrink-0 rounded-full"
        aria-label={playing ? "Pause this voiceover" : "Play this voiceover"}
        title={playing ? "Pause" : "Play"}
        onClick={() => void togglePreview()}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <div className="grid min-w-0 gap-0.5">
        <p
          className="line-clamp-3 text-xs font-medium [overflow-wrap:anywhere]"
          title={voiceover.script}
        >
          {voiceover.script}
        </p>
        <span className="truncate text-[0.625rem] text-muted-foreground tabular-nums">
          {voiceover.voiceName} · {formatClock(voiceover.durationMs)}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="col-span-2 w-full"
        onClick={onAdd}
      >
        <PlusIcon />
        Add at playhead
      </Button>
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
