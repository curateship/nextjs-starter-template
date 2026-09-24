import * as React from "react"
import { CopyIcon, Loader2Icon } from "lucide-react"
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
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createExportShare,
  getExportShareErrorMessage,
  loadExportShare,
  revokeExportShare,
  type ExportShareSummary,
} from "@/lib/api/video/export-shares"
import type { RenderJobSummary } from "@/lib/api/video/exports"
import { formatDateTime } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  SHARE_EXPIRY_CHOICES,
  shareLinkUrl,
  type ShareExpiryChoice,
} from "@/lib/video/export-shares"

type Loaded =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; share: ExportShareSummary | null }

/**
 * One export's share link: make it, copy it, turn it off.
 *
 * Mounted fresh for each export (the page keys it on the export's id), so the
 * link it shows is always read from the server as the window opens.
 */
export function ExportShareDialog({
  item,
  onClose,
  onChanged,
}: {
  item: RenderJobSummary
  onClose: () => void
  onChanged: () => void
}) {
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [attempt, setAttempt] = React.useState(0)
  const [expiry, setExpiry] = React.useState<ShareExpiryChoice>("never")
  const [run, busy] = useAsyncAction(getExportShareErrorMessage)

  React.useEffect(() => {
    let cancelled = false
    loadExportShare(item.id).then(
      (share) => {
        if (!cancelled) setLoaded({ state: "ready", share })
      },
      (error) => {
        if (cancelled) return
        showErrorToast(getExportShareErrorMessage(error))
        setLoaded({ state: "failed" })
      }
    )
    return () => {
      cancelled = true
    }
  }, [item.id, attempt])

  async function handleCreate() {
    await run(async () => {
      const share = await createExportShare(item.id, expiry)
      setLoaded({ state: "ready", share })
      onChanged()
    }, "Link made. Copy it and send it to whoever should watch.")
  }

  async function handleRevoke() {
    await run(async () => {
      await revokeExportShare(item.id)
      setLoaded({ state: "ready", share: null })
      onChanged()
    }, "Link turned off. It stops working straight away.")
  }

  const share = loaded.state === "ready" ? loaded.share : null
  const live = share && !share.expired ? share : null
  const url = live ? shareLinkUrl(window.location.origin, live.token) : ""

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied.")
    } catch {
      showErrorToast("The link could not be copied. Select it and copy it yourself.")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            Anybody with the link can watch and save this export without
            signing in.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Who can watch</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {loaded.state === "loading" ? (
                <LoadingRow label="Reading the link…" />
              ) : loaded.state === "failed" ? (
                <div className="grid justify-items-start gap-2">
                  <p className="text-sm text-muted-foreground">
                    The link could not be read.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setLoaded({ state: "loading" })
                      setAttempt((count) => count + 1)
                    }}
                  >
                    Try again
                  </Button>
                </div>
              ) : live ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="export-share-link">Link</Label>
                    <div className="flex gap-2">
                      <Input
                        id="export-share-link"
                        readOnly
                        value={url}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleCopy()}
                      >
                        <CopyIcon />
                        Copy
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {live.expires_at
                        ? `Stops working on ${formatDateTime(live.expires_at)}.`
                        : "Works until you turn it off."}
                    </p>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleRevoke()}
                    >
                      {busy ? <Loader2Icon className="animate-spin" /> : null}
                      Turn off link
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {share?.expires_at
                      ? `The last link stopped working on ${formatDateTime(share.expires_at)}. Make a new one to share this export again.`
                      : "Nobody can open this export without signing in."}
                  </p>
                  <div className="grid gap-2">
                    <Label htmlFor="export-share-expiry">How long it works</Label>
                    <Select
                      value={expiry}
                      onValueChange={(next) =>
                        setExpiry(next as ShareExpiryChoice)
                      }
                    >
                      <SelectTrigger
                        id="export-share-expiry"
                        className="w-full sm:w-auto sm:justify-self-start"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHARE_EXPIRY_CHOICES.map((choice) => (
                          <SelectItem key={choice.value} value={choice.value}>
                            {choice.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCreate()}
                    >
                      {busy ? <Loader2Icon className="animate-spin" /> : null}
                      Make a link
                    </Button>
                  </div>
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
