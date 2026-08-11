import * as React from "react"
import { CheckIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  decideClaim,
  getClaimErrorMessage,
  type ClaimSummary,
} from "@/lib/api/directory/claims"
import { REVIEW_STATUS_LABELS } from "@/lib/directory/review-status"
import { formatDate } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * One claim, and the decision on it.
 *
 * The email-domain check is the first thing on screen because it is the fastest
 * way to a yes: an address at the business's own domain is somebody who could
 * already read mail there. It is drawn as a word and a tick rather than colour
 * alone, and **a mismatch is stated as a fact, not a warning** — plenty of real
 * owners use a Gmail address, and this window must not push an admin toward
 * refusing them.
 */
export function ClaimDialog({
  open,
  claim,
  onClose,
  onDecided,
}: {
  open: boolean
  claim: ClaimSummary | null
  onClose: () => void
  onDecided: (decision: "approve" | "reject") => void
}) {
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? (claim?.id ?? null) : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setNote("")
  }

  const decided = claim ? claim.status !== "pending_review" : false

  async function decide(decision: "approve" | "reject") {
    if (!claim) return
    dismissErrorToast()
    setBusy(true)
    try {
      await decideClaim({ id: claim.id, decision, note })
      onDecided(decision)
    } catch (error) {
      showErrorToast(getClaimErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

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
            <DialogTitle>{claim?.listingTitle ?? "Claim"}</DialogTitle>
            <DialogDescription>
              {decided
                ? `${REVIEW_STATUS_LABELS[claim?.status ?? "approved"]}${
                    claim?.reviewedAt ? ` on ${formatDate(claim.reviewedAt)}` : ""
                  }.`
                : "Approving hands this account the listing. They can then suggest changes, which come back here."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The address they proved</CardTitle>
                <CardDescription>
                  Confirmed by clicking a link sent to it.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Business email
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">{claim?.contactEmail}</span>
                    {claim?.emailDomainMatches ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckIcon className="size-3.5" aria-hidden="true" />
                        Same domain as the listing's website
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <XIcon className="size-3.5" aria-hidden="true" />
                        Not the listing's domain
                      </Badge>
                    )}
                  </div>
                </div>
                <Detail label="Name" value={claim?.claimantName} />
                <Detail label="Role" value={claim?.roleTitle} />
                <Detail label="Phone" value={claim?.phone} />
                <Detail label="Link they gave" value={claim?.proofUrl} />
                <Detail label="Message" value={claim?.message} multiline />
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>The account</CardTitle>
                <CardDescription>
                  This is who gets the listing. It is not always the same address
                  as the one above.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Detail label="Signed in as" value={claim?.accountName} />
                <Detail label="Account email" value={claim?.accountEmail} />
              </CardContent>
            </Card>

            {decided ? (
              claim?.reviewNote ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The note that was sent</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">
                      {claim.reviewNote}
                    </p>
                  </CardContent>
                </Card>
              ) : null
            ) : (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>A note back</CardTitle>
                  <CardDescription>
                    Emailed to them either way.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="claim-review-note">Note</FieldLabel>
                    <Textarea
                      id="claim-review-note"
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
                  Hand them the listing
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function Detail({
  label,
  value,
  multiline,
}: {
  label: string
  value?: string
  multiline?: boolean
}) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <p
        className={`text-sm ${multiline ? "whitespace-pre-wrap" : "truncate"} ${
          value ? "" : "text-muted-foreground"
        }`}
        title={multiline ? undefined : value}
      >
        {value || "Not given"}
      </p>
    </div>
  )
}
