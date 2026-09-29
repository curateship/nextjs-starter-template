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
import { addCreator, getSocialErrorMessage } from "@/lib/api/trade/social"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Adding an X account to track.
 *
 * It takes a full address or a bare handle, because both are what people
 * actually have to hand: a link copied from the timeline, or a name read off
 * somebody's screen. A trailing slash, a query string and a leading `@` are
 * all trimmed off before the handle is read.
 *
 * The address is checked on the server against the private-address rules
 * before anything is saved, so a link pointing at this server or at
 * `localhost` is refused rather than stored and fetched later.
 */
export function AddCreatorDialog({
  open,
  initialValue = "",
  onOpenChange,
  onAdded,
}: {
  open: boolean
  /** Prefilled when the address bar named a handle nobody tracks yet. */
  initialValue?: string
  onOpenChange: (open: boolean) => void
  /** The handle that was saved, so the caller can open its dashboard. */
  onAdded: (handle: string) => void
}) {
  return open ? (
    <AddCreatorForm
      initialValue={initialValue}
      onClose={() => onOpenChange(false)}
      onAdded={onAdded}
    />
  ) : null
}

function AddCreatorForm({
  initialValue,
  onClose,
  onAdded,
}: {
  initialValue: string
  onClose: () => void
  onAdded: (handle: string) => void
}) {
  const [address, setAddress] = React.useState(initialValue)
  const [saving, setSaving] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)

  async function save() {
    setSaving(true)
    setInvalid(false)
    dismissErrorToast()
    try {
      const creator = await addCreator(address.trim())
      toast.success(`Now tracking @${creator.handle}.`)
      onAdded(creator.handle)
    } catch (error) {
      // The typed value is kept and the field is marked, the way every other
      // form in this app reports a refusal.
      setInvalid(true)
      showErrorToast(getSocialErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open
      dirty={address.trim() !== initialValue.trim()}
      busy={saving}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Add a creator</DialogTitle>
            <DialogDescription>
              Paste the address of an X account. Trade keeps the posts you give
              it for that account, and only you can see them.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The account</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="social-creator-address"
                    hint="A full address, or just the handle. @ signs, trailing slashes and query strings are all fine."
                  >
                    X address or handle
                  </FieldLabel>
                  <Input
                    id="social-creator-address"
                    value={address}
                    maxLength={500}
                    autoFocus
                    aria-invalid={invalid || undefined}
                    placeholder="https://x.com/cryptosam"
                    onChange={(event) => {
                      setAddress(event.target.value)
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
              size="lg"
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" size="lg" onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Create creator
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
