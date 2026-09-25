import * as React from "react"
import { MicIcon, PauseIcon, PlayIcon, PlusIcon } from "lucide-react"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { useSavedCaptionLook } from "@/components/video-editor/use-saved-caption-look"

/**
 * The Voiceovers panel: every voiceover already read aloud, searchable by
 * what it says, each one press away from landing at the playhead with its
 * captions. Reusing one costs nothing; only reading new words does.
 */
export function VoiceoversPanel() {
  const { store, dispatch, clock } = useEditorRuntime()
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [voiceovers, setVoiceovers] = React.useState<SavedVoiceover[] | null>(
    null
  )
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const [playingId, setPlayingId] = React.useState<string | null>(null)
  // The captions take the brand kit's look, the same as a fresh voiceover's.
  const [look] = useSavedCaptionLook(true)

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
    if (!look) {
      showErrorToast("The caption look is still loading. Try again in a moment.")
      return
    }
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
      ...voiceoverClips(voiceover, atMs, look),
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
      />

      <div className="border-b p-4">
        <Input
          type="search"
          value={search}
          maxLength={VOICEOVER_SEARCH_MAX}
          placeholder="Search the words"
          aria-label="Search voiceovers by what was said"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

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
