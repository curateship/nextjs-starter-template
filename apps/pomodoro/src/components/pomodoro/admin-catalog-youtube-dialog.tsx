import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  getCatalogAdminErrorMessage,
  importThemeFromYoutubeClip,
} from "@/lib/api/pomodoro/admin-catalog"
import { readStartTime, readYoutubeLink } from "@/lib/pomodoro/youtube-links"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * "Make a theme from a YouTube clip": one link and a start time become a Draft
 * theme holding those 5 seconds, with no sound. See "Make a theme from a
 * YouTube clip" in `workspace/docs/catalog-admin.md`. Themes page only, and
 * admins only (Tyler, 10 Oct 2026).
 *
 * A field's problem shows under it once the field is left or Create is
 * pressed. The server reads both again and refuses a stretch already in the
 * catalogue, and that refusal shows under the link.
 */

type Field = "link" | "start"

export function AdminCatalogYoutubeDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  /** Reads the list again; awaited before the window closes. */
  onImported: () => Promise<void>
}) {
  const [link, setLink] = React.useState("")
  const [start, setStart] = React.useState("")
  const [shown, setShown] = React.useState<Record<Field, boolean>>({ link: false, start: false })
  const [serverReason, setServerReason] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const linkId = React.useId()
  const startId = React.useId()
  const linkProblemId = React.useId()
  const startProblemId = React.useId()

  // Opening again starts with empty fields.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setLink("")
      setStart("")
      setShown({ link: false, start: false })
      setServerReason(null)
    }
  }

  const linkRead = readYoutubeLink(link)
  const startRead = readStartTime(start)
  const linkProblem = linkRead.ok ? serverReason : linkRead.reason
  const startProblem = startRead.ok ? null : startRead.reason

  const submit = async () => {
    setShown({ link: true, start: true })
    const problem = linkProblem ?? startProblem
    if (problem) {
      showErrorToast(problem)
      return
    }
    setBusy(true)
    try {
      const result = await importThemeFromYoutubeClip(link, start)
      if (!result.ok) {
        if (result.field === "link") setServerReason(result.reason)
        showErrorToast(result.reason)
        return
      }
      toast.success("Clip added as a draft. It will be ready in about a minute.")
      await onImported()
      onClose()
    } catch (error) {
      showErrorToast(getCatalogAdminErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const showLinkProblem = shown.link && linkProblem !== null
  const showStartProblem = shown.start && startProblem !== null

  return (
    <FormDialog
      open={open}
      dirty={Boolean(link.trim() || start.trim())}
      busy={busy}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Make a theme from a YouTube clip</DialogTitle>
            <DialogDescription>
              The 5 seconds from the start you pick become a Draft theme, with no
              sound. The clip, its name and its channel arrive within a minute or two.
            </DialogDescription>
          </DialogHeader>
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
                  <CardTitle>Clip</CardTitle>
                  <CardDescription>
                    Only use videos you own or that are marked Creative Commons.
                    Set the licence in the theme's window before making it Live.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={linkId}>YouTube link</FieldLabel>
                    <Input
                      id={linkId}
                      type="url"
                      maxLength={500}
                      placeholder="https://www.youtube.com/watch?v=…"
                      value={link}
                      spellCheck={false}
                      aria-invalid={showLinkProblem || undefined}
                      aria-describedby={showLinkProblem ? linkProblemId : undefined}
                      onChange={(event) => {
                        setServerReason(null)
                        setLink(event.target.value)
                      }}
                      onBlur={() => setShown((was) => ({ ...was, link: Boolean(link.trim()) }))}
                    />
                    {showLinkProblem ? (
                      <p id={linkProblemId} className="text-sm text-destructive">
                        {linkProblem}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor={startId}
                      hint="Left empty, the clip starts at the time in the link, or at 0:00."
                    >
                      Start at
                    </FieldLabel>
                    <Input
                      id={startId}
                      inputMode="numeric"
                      maxLength={20}
                      placeholder="1:35"
                      value={start}
                      aria-invalid={showStartProblem || undefined}
                      aria-describedby={showStartProblem ? startProblemId : undefined}
                      onChange={(event) => {
                        // A refused stretch is the link and start together,
                        // so a new start may well be let through.
                        setServerReason(null)
                        setStart(event.target.value)
                      }}
                      onBlur={() => setShown((was) => ({ ...was, start: true }))}
                    />
                    {showStartProblem ? (
                      <p id={startProblemId} className="text-sm text-destructive">
                        {startProblem}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create theme
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
