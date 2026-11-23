import * as React from "react"

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
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { QrCode } from "@/components/video-editor/qr-code"
import { makePhoneLink, readPhoneLinkStatus, stopPhoneLink } from "@/lib/api/video/phone-uploads"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the window asks whether the phone has opened the code or sent a file. */
const STATUS_EVERY_MS = 3_000

type Link = { id: string; url: string }
type Status = { state: "waiting" | "open" | "ended"; files: number }

/**
 * "From your phone" in the Media panel's + menu (workspace/docs/phone-uploads.md):
 * a QR code the phone's camera opens, good for 15 minutes and once. While this
 * window is open it asks every 3 seconds how many files have arrived, and
 * fetches the Media panel again whenever another one has, so a file sent from
 * the phone shows without a reload.
 */
export function PhoneUploadDialog({ onClose }: { onClose: () => void }) {
  const { projectId, store } = useEditorRuntime()
  const [link, setLink] = React.useState<Link | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [status, setStatus] = React.useState<Status>({ state: "waiting", files: 0 })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    makePhoneLink(projectId)
      .then((made) => {
        if (!live) return
        // The secret rides after the #, which a browser never sends to a server.
        setLink({ id: made.id, url: `${window.location.origin}/phone#${made.token}` })
        setStatus({ state: "waiting", files: 0 })
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [projectId, attempt])

  const seenFiles = React.useRef(0)
  React.useEffect(() => {
    if (!link) return
    seenFiles.current = 0
    let live = true
    const timer = window.setInterval(() => {
      readPhoneLinkStatus(link.id)
        .then((next) => {
          if (!live) return
          setStatus(next)
          if (next.files > seenFiles.current) {
            seenFiles.current = next.files
            store.refreshMediaShelf()
          }
        })
        .catch(() => undefined)
    }, STATUS_EVERY_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [link, store])

  // Ends the phone's sign-in at once, for a code somebody else may have scanned.
  async function stop() {
    if (!link) return
    try {
      await stopPhoneLink(link.id)
      setStatus((current) => ({ ...current, state: "ended" }))
    } catch {
      showErrorToast("The phone could not be stopped. Try again.")
    }
  }

  function newCode() {
    setLink(null)
    setFailed(false)
    setAttempt((count) => count + 1)
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>From your phone</DialogTitle>
          <DialogDescription>
            Point your phone's camera at the code, then pick videos and photos from its camera roll.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Scan this</CardTitle>
            </CardHeader>
            <CardContent className="grid justify-items-center gap-4">
              {failed ? (
                <ErrorRow message="The code could not be made." onRetry={newCode} />
              ) : !link ? (
                <LoadingRow label="Making a code…" />
              ) : status.state === "ended" && status.files === 0 ? (
                <div className="grid justify-items-center gap-2 text-center">
                  <p className="text-sm text-muted-foreground">
                    This code has run out. A code works for 15 minutes, and on one phone.
                  </p>
                  <Button type="button" variant="outline" onClick={newCode}>
                    New code
                  </Button>
                </div>
              ) : (
                <>
                  {status.state === "waiting" ? (
                    <QrCode value={link.url} title="A code to open on your phone" className="size-56" />
                  ) : null}
                  <p className="text-center text-sm text-muted-foreground" role="status">
                    {status.state === "waiting"
                      ? "Works for 15 minutes, on one phone."
                      : status.files === 0
                        ? "Open on your phone. Pick files there and they land in Media."
                        : `${status.files} ${status.files === 1 ? "file has" : "files have"} arrived in Media.`}
                  </p>
                  {status.state === "ended" ? (
                    <Button type="button" variant="outline" onClick={newCode}>
                      New code
                    </Button>
                  ) : status.state === "open" ? (
                    <Button type="button" variant="outline" onClick={() => void stop()}>
                      Stop this phone
                    </Button>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
