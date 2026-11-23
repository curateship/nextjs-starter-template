import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  findClip,
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import {
  checkLipSync,
  getLipSyncErrorMessage,
  loadLatestLipSync,
  startLipSync,
  type LipSyncView,
} from "@/lib/api/video/lip-sync"
import { showErrorToast } from "@/lib/toast/error-toast"
import { withEstimate } from "@/lib/video/ai-estimates"
import { lipSyncCostCents, lipSyncVoices, LIP_SYNC_NO_VOICE_MESSAGE } from "@/lib/video/lip-sync"
import { formatClock } from "@/lib/video/timeline-utils"

/** How often the window asks Sync Labs how the job is going. */
const CHECK_EVERY_MS = 5_000

/**
 * Match the lips, from a video clip's right-click menu (lip-sync.md): pick the
 * sound clip over it, see the price, and press. Sync Labs takes a minute or
 * more; the window asks every 5 seconds and swaps the clip in as one Undo when
 * it is done. Closed while it works, the job carries on, and opening the
 * window on the same clip again picks it back up.
 */
export function LipSyncDialog({ clip, onClose }: { clip: EditorClip; onClose: () => void }) {
  const { store, dispatch, videoId, saveNow } = useEditorRuntime()
  const voices = React.useMemo(
    () => lipSyncVoices(store.getSnapshot().state.tracks, clip),
    [store, clip]
  )
  const [soundClipId, setSoundClipId] = React.useState(voices[0]?.id ?? "")
  const [job, setJob] = React.useState<LipSyncView | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [starting, setStarting] = React.useState(false)

  React.useEffect(() => {
    let live = true
    loadLatestLipSync(videoId, clip.id)
      .then((found) => live && setJob(found))
      .catch(() => undefined)
      .finally(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [videoId, clip.id])

  // While Sync works, ask how it is going: the next ask only once the last
  // has answered, because one answer can be a long download.
  const watched = React.useRef(new Set<string>())
  React.useEffect(() => {
    if (job?.status !== "working") return
    watched.current.add(job.id)
    let live = true
    let timer = 0
    const ask = () => {
      timer = window.setTimeout(() => {
        checkLipSync(job.id)
          .then((next) => {
            if (!live) return
            setJob(next)
            if (next.status === "working") ask()
          })
          .catch(() => live && ask())
      }, CHECK_EVERY_MS)
    }
    ask()
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [job?.id, job?.status])

  const putIn = React.useCallback(
    (media: NonNullable<LipSyncView["media"]>) => {
      const current = findClip(store.getSnapshot().state.tracks, clip.id)?.clip
      if (!current) {
        toast("The clip is gone from the timeline. The matched video is in Media.")
        store.refreshMediaShelf()
        return
      }
      if (current.mediaId === media.id) return
      // One Undo puts the old footage back. Silent, because the voice it was
      // matched to is still on its own lane.
      dispatch({
        type: "UPDATE_CLIP",
        clipId: clip.id,
        patch: {
          mediaId: media.id,
          url: media.url,
          name: media.name.replace(/\.mp4$/, ""),
          sourceDurationMs: media.duration_ms,
          trimStartMs: 0,
          muted: true,
          origin: undefined,
        },
      })
      store.refreshMediaShelf()
    },
    [store, dispatch, clip.id]
  )

  // A job that finishes while the window is open goes straight in. One that
  // was already finished when the window opened waits for "put the earlier
  // one in", so opening the window never undoes an Undo.
  const landed = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (job?.status !== "ready" || !job.media || landed.current === job.id) return
    if (!watched.current.has(job.id)) return
    const current = findClip(store.getSnapshot().state.tracks, clip.id)?.clip
    if (current?.mediaId === job.media.id) return
    landed.current = job.id
    putIn(job.media)
  }, [job, putIn, store, clip.id])

  async function start() {
    if (store.refuseIfLocked()) return
    setStarting(true)
    try {
      // The server reads the saved timeline, so any edit still waiting goes first.
      await saveNow()
      setJob(await startLipSync(videoId, clip.id, soundClipId))
    } catch (error) {
      showErrorToast(getLipSyncErrorMessage(error))
    } finally {
      setStarting(false)
    }
  }

  const working = job?.status === "working"
  const price = lipSyncCostCents(clip.durationMs)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Match the lips</DialogTitle>
          <DialogDescription>
            Sync Labs makes the mouth in this clip move to the words of a voice laid over it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>{clip.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {!loaded ? (
                <LoadingRow label="Checking for an earlier try…" />
              ) : working ? (
                <LoadingRow label="Sync Labs is matching the lips. This takes a minute or more; you can close this and come back." />
              ) : voices.length === 0 ? (
                <p className="text-sm text-muted-foreground">{LIP_SYNC_NO_VOICE_MESSAGE}</p>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="lip-sync-voice">Voice to match</Label>
                    <Select value={soundClipId} onValueChange={setSoundClipId}>
                      <SelectTrigger id="lip-sync-voice" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {voices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name} ({formatClock(voice.durationMs)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    The clip's {formatClock(clip.durationMs)} goes to Sync Labs with this voice over
                    it. The matched clip keeps its place and size, plays silent so the voice isn't
                    heard twice, and one Undo puts the old one back.
                  </p>
                  {job?.status === "failed" ? (
                    <p className="text-sm text-destructive">{job.error}</p>
                  ) : null}
                  {job?.status === "ready" && job.media ? (
                    <p className="text-sm text-muted-foreground">
                      This clip was matched before. Match it again, or{" "}
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => job.media && putIn(job.media)}
                      >
                        put the earlier one in
                      </button>
                      .
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {working ? "Close" : "Cancel"}
          </Button>
          {!working && voices.length > 0 ? (
            <Button type="button" disabled={starting || !loaded} onClick={() => void start()}>
              {starting ? <Loader2Icon className="animate-spin" /> : null}
              {withEstimate("Match the lips", price)}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
