import * as React from "react"

import { WrittenPageBody } from "@/components/pages/written-page-body"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CharacterCount } from "@/components/shared/character-count"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  decideEditRequest,
  getClaimErrorMessage,
  type EditRequestSummary,
} from "@/lib/api/directory/claims"
import { menuLinkLabel } from "@/lib/directory/contact-links"
import { OWNER_EDITABLE_FIELDS } from "@/lib/directory/review-status"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * What an owner wants changed, and whether it goes live.
 *
 * Only the fields they actually touched are shown — a window listing five
 * fields where one changed makes the admin hunt for the change. What is drawn
 * is the value that would be written, already cleaned, so there is nothing
 * between reading it and it going live.
 */
export function EditRequestDialog({
  open,
  request,
  onClose,
  onDecided,
}: {
  open: boolean
  request: EditRequestSummary | null
  onClose: () => void
  onDecided: (decision: "approve" | "reject") => void
}) {
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? (request?.id ?? null) : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setNote("")
  }

  const decided = request ? request.status !== "pending" : false

  async function decide(decision: "approve" | "reject") {
    if (!request) return
    dismissErrorToast()
    setBusy(true)
    try {
      await decideEditRequest({ id: request.id, decision, note })
      onDecided(decision)
    } catch (error) {
      showErrorToast(getClaimErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const changed = OWNER_EDITABLE_FIELDS.filter(
    (field) => request?.changes[field.key] !== undefined
  )

  return (
    <FormDialog
      open={open}
      dirty={note.trim().length > 0}
      busy={busy}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Changes to {request?.listingTitle ?? "a listing"}
            </DialogTitle>
            <DialogDescription>
              {decided
                ? "This one has already been dealt with."
                : `Asked for by ${request?.ownerName ?? "the owner"}. Nothing is live until you approve it.`}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>What would change</CardTitle>
                <CardDescription>
                  Only what they touched. Everything else stays as it is.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {changed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing was changed.
                  </p>
                ) : (
                  changed.map((field) => (
                    <div key={field.key} className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {field.label}
                      </span>
                      <ChangedValue
                        field={field.key}
                        changes={request?.changes ?? {}}
                      />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {decided ? null : (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>A note back</CardTitle>
                  <CardDescription>Emailed to them either way.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor="edit-request-note">Note</FieldLabel>
                      <CharacterCount value={note} max={500} />
                    </div>
                    <Textarea
                      id="edit-request-note"
                      rows={1}
                      maxLength={500}
                      value={note}
                      disabled={busy}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </DialogBody>

          <DialogFooter>
            {decided ? (
              <Button type="button" onClick={requestClose}>
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void decide("reject")}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("approve")}
                >
                  Apply the changes
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** Each kind of field drawn as what it is, rather than as raw stored data. */
function ChangedValue({
  field,
  changes,
}: {
  field: (typeof OWNER_EDITABLE_FIELDS)[number]["key"]
  changes: EditRequestSummary["changes"]
}) {
  if (field === "featuredImage") {
    const src = changes.featuredImage ?? ""
    return src ? (
      <img
        src={src}
        alt=""
        className="max-w-24 rounded border object-cover"
      />
    ) : (
      <p className="text-sm text-muted-foreground">Removed</p>
    )
  }

  if (field === "contactLinks") {
    const links = changes.contactLinks
    if (!links) return null
    return (
      <div className="grid gap-1 text-sm">
        <span>{links.address || "No address"}</span>
        <span className="text-muted-foreground">
          {links.menuLinks.map((link) => menuLinkLabel(link)).join(" · ") ||
            "No links"}
        </span>
      </div>
    )
  }

  if (field === "body") {
    // The same renderer the public page uses. It builds elements from the
    // stored nodes and never a string of markup, so what an owner typed cannot
    // be anything but the text of a paragraph — including here, on an admin's
    // screen.
    return changes.body ? (
      <div className="text-sm">
        <WrittenPageBody body={changes.body} />
      </div>
    ) : null
  }

  const value = field === "title" ? changes.title : changes.metaDescription
  return (
    <p className="text-sm">
      {value || <span className="text-muted-foreground">Emptied</span>}
    </p>
  )
}
