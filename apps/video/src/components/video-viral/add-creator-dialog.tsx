import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

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
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import { followCreatorByLink } from "@/lib/api/video/viral-projects"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Following somebody the search did not find: paste the link to their
 * profile. A link is asked for rather than a handle, because a handle alone
 * does not say which platform it is on.
 */
export function AddCreatorDialog({
  projectId,
  open,
  onOpenChange,
  onAdded,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves once the screen has read the project again. */
  onAdded: () => Promise<void>
}) {
  const [link, setLink] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setLink("")
      setInvalid(false)
    }
  }

  async function submit() {
    if (busy) return
    if (!link.trim()) {
      setInvalid(true)
      showErrorToast("Paste a profile link first.")
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const { platform } = await followCreatorByLink(projectId, link.trim())
      await onAdded()
      dismissErrorToast()
      toast.success(
        platform === "instagram"
          ? "Following them. Instagram does not let the app read anyone's videos, so none will show."
          : platform === "tiktok"
            ? "Following them. Their videos arrive when the watch timer next checks."
            : "Following them. Their newest videos are in the grid."
      )
      onOpenChange(false)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={link.trim() !== ""}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent
          variant="admin"
          className="sm:max-w-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a creator</DialogTitle>
            <DialogDescription>
              They join this project. Somebody you already follow in another
              project is added here too, not twice.
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
                  <CardTitle>Their profile</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="viral-creator-link"
                      hint="A YouTube channel, a TikTok profile or an Instagram profile. Not a link to one of their videos."
                    >
                      Profile link
                    </FieldLabel>
                    <Input
                      id="viral-creator-link"
                      ref={inputRef}
                      placeholder="https://www.youtube.com/@creator"
                      value={link}
                      maxLength={2048}
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setLink(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Add creator
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
