import * as React from "react"
import { CheckIcon, CircleIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getSavedVideoErrorMessage,
  loadSavedVideoDetail,
  pasteViralLink,
  retryVideo,
  type PastedLink,
  type SavedVideoDetail,
} from "@/lib/api/video/viral-videos"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { isSavedVideoWorking } from "@/lib/video/creators"

/** How often the window asks where the pasted video has got to. */
const POLL_MS = 3_000

/** The three steps the window shows, in order. */
const STEPS = ["Downloading", "Breaking down", "Ready"] as const

/**
 * Add a link (viral task 08): one field for a YouTube, TikTok or Instagram
 * video found somewhere else, then the job's progress in the same window.
 *
 * The window only writes the row and watches it. The download and the
 * breakdown run in the background worker, so closing the window, or the tab,
 * stops nothing; the video's row in the middle panel keeps showing how far it
 * has got.
 */
export function PasteLinkDialog({
  open,
  projectId,
  onClose,
  onPasted,
  onOpenVideo,
}: {
  open: boolean
  projectId: string
  onClose: () => void
  /** The screen reads itself again, so the video's row shows at once. */
  onPasted: (pasted: PastedLink) => Promise<void> | void
  /** Plays the video on the right, with its breakdown once there is one. */
  onOpenVideo: (key: string) => void
}) {
  const [url, setUrl] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [pasted, setPasted] = React.useState<PastedLink | null>(null)
  const [detail, setDetail] = React.useState<SavedVideoDetail | null>(null)

  // Every opening starts with an empty field.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setUrl("")
      setInvalid(false)
      setPasted(null)
      setDetail(null)
    }
  }

  // While the job moves, ask again; stop once it is ready or failed, or the
  // window shuts. The job itself carries on either way.
  const working = detail !== null && isSavedVideoWorking(detail.status)
  const savedId = detail?.id
  React.useEffect(() => {
    if (!open || !working || !savedId) return
    const timer = setInterval(() => {
      loadSavedVideoDetail(savedId)
        .then(setDetail)
        // A missed read is tried again on the next tick.
        .catch(() => undefined)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [open, savedId, working])

  async function submit() {
    if (busy) return
    if (!url.trim()) {
      setInvalid(true)
      showErrorToast("Paste a link to a YouTube, TikTok or Instagram video first.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const result = await pasteViralLink(projectId, url)
      setPasted(result)
      setDetail(result.video)
      await onPasted(result)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function tryAgain() {
    if (!detail || busy) return
    setBusy(true)
    try {
      setDetail(await retryVideo(detail.id))
    } catch (error) {
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={pasted === null && url.trim() !== ""}
      busy={busy}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a link</DialogTitle>
            <DialogDescription>
              A video you found yourself is saved to this project and broken down like a search result.
              Breaking it down spends from your monthly AI allowance.
            </DialogDescription>
          </DialogHeader>
          {pasted && detail ? (
            <>
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="truncate">{detail.title ?? pasted.video.sourceUrl}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {pasted.alreadySaved ? (
                      <p className="text-sm text-muted-foreground">
                        You saved this video before, so this is that copy. Nothing is downloaded twice.
                      </p>
                    ) : null}
                    {detail.status === "failed" ? (
                      <ErrorRow
                        className="py-2"
                        message={detail.error ?? "The video could not be saved."}
                        onRetry={() => void tryAgain()}
                      />
                    ) : (
                      <Progress status={detail.status} />
                    )}
                    {working ? (
                      <p className="text-xs text-muted-foreground">
                        Closing this window keeps it going. The video&apos;s row shows how far it has got.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={requestClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    onOpenVideo(pasted.key)
                    onClose()
                  }}
                >
                  {detail.status === "ready" ? "Open the breakdown" : "Open the video"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Video</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="viral-paste-link">Video link</Label>
                      <Input
                        id="viral-paste-link"
                        autoFocus
                        inputMode="url"
                        autoComplete="off"
                        maxLength={2048}
                        placeholder="https://www.tiktok.com/@name/video/…"
                        value={url}
                        aria-invalid={invalid || undefined}
                        onChange={(event) => {
                          setUrl(event.target.value)
                          setInvalid(false)
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2Icon className="animate-spin" /> : null}
                  Add and break down
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * Downloading, then breaking down, then ready, with the step now running
 * spinning and the ones done ticked. Each step says its state in words as
 * well, so the marks are never the only sign.
 */
function Progress({ status }: { status: SavedVideoDetail["status"] }) {
  const ready = status === "ready"
  // Waiting counts as the download's turn: it is next in the queue.
  const current = status === "analysing" || status === "downloaded" ? 1 : 0
  return (
    <ol className="grid gap-2" aria-label="Progress">
      {STEPS.map((step, index) => {
        const done = ready || index < current
        const now = !ready && index === current
        return (
          <li
            key={step}
            aria-current={now ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 text-sm",
              !done && !now && "text-muted-foreground"
            )}
          >
            {done ? (
              <CheckIcon className="size-4 text-primary" />
            ) : now ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CircleIcon className="size-4" />
            )}
            <span className={cn(now && "font-medium")}>{step}</span>
            <span className="sr-only">{done ? "done" : now ? "running now" : "to come"}</span>
          </li>
        )
      })}
    </ol>
  )
}
