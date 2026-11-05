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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import { useMusicBeats } from "@/components/video-editor/sound-tool-store"
import { getTeaserErrorMessage, scoreTeaser } from "@/lib/api/video/teaser"
import { teaserCostCents, withEstimate } from "@/lib/video/ai-estimates"
import {
  planTeaser,
  TEASER_DEFAULT_SECONDS,
  TEASER_LENGTH_MESSAGE,
  TEASER_MIN_SECONDS,
  TEASER_NO_VIDEO_MESSAGE,
  TEASER_NOTHING_GOOD_MESSAGE,
  teaserBeats,
  teaserCountMessage,
  teaserCountRange,
  teaserCutLengths,
  teaserMusic,
  teaserStillGrid,
  videoLengthMs,
} from "@/lib/video/teaser"
import { MAX_TIMELINE_TRACKS } from "@/lib/video/timeline-schema"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Make a teaser (teaser.md): a length in seconds, then the AI picks the best
 * one to three second moments of the video and they go at the start, cut on
 * the beats of the music already on the video when there is some.
 */
export function TeaserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { videoId, saveNow, store, dispatch } = useEditorRuntime()
  const tracks = useEditorSelector((state) => state.tracks)
  const [secondsText, setSecondsText] = React.useState(String(TEASER_DEFAULT_SECONDS))
  const [countText, setCountText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const running = React.useRef<AbortController | null>(null)

  // Closing the editor mid-run cancels it too.
  React.useEffect(() => () => running.current?.abort(), [])

  /** Cancel while it runs: stop waiting, stop the paid asks, and lay nothing. */
  function cancel() {
    running.current?.abort()
    running.current = null
    setBusy(false)
    onOpenChange(false)
  }

  const soundIds = React.useMemo(
    () => tracks.flatMap((track) => track.clips.filter((clip) => clip.kind === "audio" && clip.mediaId).map((clip) => clip.mediaId!)),
    [tracks]
  )
  const beats = useMusicBeats(soundIds)
  const music = teaserMusic(tracks, beats)
  const lengthMs = videoLengthMs(tracks)
  const maxSeconds = Math.floor(lengthMs / 1000)
  const stills = open ? teaserStillGrid(tracks).times.length : 0
  const seconds = /^\d+$/.test(secondsText.trim()) ? Number(secondsText.trim()) : NaN
  const secondsOk = Number.isInteger(seconds) && seconds >= TEASER_MIN_SECONDS && seconds <= maxSeconds
  const startSeconds = Math.max(TEASER_MIN_SECONDS, Math.min(TEASER_DEFAULT_SECONDS, maxSeconds))
  const countRange = teaserCountRange((secondsOk ? seconds : startSeconds) * 1000)

  // Each time the window opens it starts at 10 seconds, or the whole video
  // when that is shorter.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSecondsText(String(startSeconds))
  }
  // Empty lets Video choose, about one moment every 2 seconds.
  const count = countText.trim() ? (/^\d+$/.test(countText.trim()) ? Number(countText.trim()) : NaN) : null
  const countOk = count === null || (count >= countRange.min && count <= countRange.max)

  async function make() {
    if (!lengthMs) {
      showErrorToast(TEASER_NO_VIDEO_MESSAGE)
      return
    }
    if (!secondsOk) {
      showErrorToast(TEASER_LENGTH_MESSAGE)
      return
    }
    if (!countOk) {
      showErrorToast(teaserCountMessage(seconds * 1000))
      return
    }
    const controller = new AbortController()
    running.current = controller
    setBusy(true)
    try {
      await saveNow()
      if (controller.signal.aborted) return
      const scored = (await scoreTeaser(videoId, controller.signal)).filter((moment) => moment.score > 0)
      if (controller.signal.aborted) return
      dismissErrorToast()
      const now = store.getSnapshot().state
      const nowMusic = teaserMusic(now.tracks, beats)
      const totalMs = seconds * 1000
      const lengths = teaserCutLengths(
        totalMs,
        nowMusic ? teaserBeats(nowMusic, beats.get(nowMusic.mediaId!)!, totalMs) : null,
        count
      )
      const moments = planTeaser(now.tracks, scored, lengths)
      if (!moments.length) {
        showErrorToast(TEASER_NOTHING_GOOD_MESSAGE)
        return
      }
      if (now.tracks.length + (nowMusic ? 2 : 1) > MAX_TIMELINE_TRACKS) {
        showErrorToast(`A video holds at most ${MAX_TIMELINE_TRACKS} lanes. Delete an empty one first.`)
        return
      }
      dispatch({ type: "TEASER_AT_START", moments, musicClipId: nowMusic?.id ?? null })
      toast.success(
        moments.length < lengths.length
          ? `Only ${moments.length} good ${plural(moments.length, "moment was", "moments were")} found, so the teaser at the start is shorter. Undo takes it out.`
          : `A teaser of ${moments.length} ${plural(moments.length, "moment", "moments")} is at the start. Undo takes it out.`
      )
      onOpenChange(false)
    } catch (error) {
      if (!controller.signal.aborted) showErrorToast(getTeaserErrorMessage(error))
    } finally {
      if (running.current === controller) {
        running.current = null
        setBusy(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && busy ? cancel() : onOpenChange(next))}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Make a teaser</DialogTitle>
          <DialogDescription>
            The AI picks the best 1 to 3 second moments of the whole video and puts them at the
            start, as a preview of what is coming.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void make()
          }}
        >
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The teaser</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="teaser-seconds">How long, in seconds</Label>
                  <Input
                    id="teaser-seconds"
                    inputMode="numeric"
                    className="sm:max-w-40"
                    value={secondsText}
                    disabled={busy}
                    aria-invalid={!secondsOk || undefined}
                    onChange={(event) => setSecondsText(event.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {maxSeconds >= TEASER_MIN_SECONDS
                      ? `Any whole number from ${TEASER_MIN_SECONDS} to ${maxSeconds}.`
                      : "The video is too short for a teaser."}
                  </span>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="teaser-count">How many moments</Label>
                  <Input
                    id="teaser-count"
                    inputMode="numeric"
                    className="sm:max-w-40"
                    placeholder="Video chooses"
                    value={countText}
                    disabled={busy}
                    aria-invalid={!countOk || undefined}
                    onChange={(event) => setCountText(event.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {`${countRange.min} to ${countRange.max}, so each lasts 1 to 3 seconds. Empty gives about one every 2 seconds.`}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {music
                    ? `Cuts land on the beats of ${music.name}, and its opening plays under the teaser.`
                    : "No music with found beats on the video, so each moment is about 2 seconds and keeps its own sound."}{" "}
                  Everything already on the timeline moves later by the teaser&apos;s length.
                </p>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => (busy ? cancel() : onOpenChange(false))}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {busy ? "Watching the video…" : withEstimate("Make the teaser", stills ? teaserCostCents(stills) : null)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
