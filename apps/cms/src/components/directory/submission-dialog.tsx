import * as React from "react"

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
  decideSubmission,
  getAdminSubmissionErrorMessage,
} from "@/lib/api/directory/submissions"
import type { SubmissionSummary } from "@/lib/api/directory/submissions"
import { REVIEW_STATUS_LABELS } from "@/lib/directory/review-status"
import { formatDate } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * One submission, read in full, with the two answers under it.
 *
 * Approving creates the listing — published, with the categories the sender
 * picked — so the window says so before the button rather than after. A
 * submission that has already been dealt with opens read-only: it is a record
 * of what happened, not a decision to make again.
 */
export function SubmissionDialog({
  open,
  submission,
  listing,
  onClose,
  onDecided,
}: {
  open: boolean
  submission: SubmissionSummary | null
  /** The listing an approved one became, when it has one. */
  listing: { title: string; slug: string } | null
  onClose: () => void
  onDecided: (decision: "approve" | "reject") => void
}) {
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? (submission?.id ?? null) : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setNote("")
  }

  const decided = submission ? submission.status !== "pending_review" : false

  async function decide(decision: "approve" | "reject") {
    if (!submission) return
    dismissErrorToast()
    setBusy(true)
    try {
      await decideSubmission({ id: submission.id, decision, note })
      onDecided(decision)
    } catch (error) {
      showErrorToast(getAdminSubmissionErrorMessage(error))
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
            <DialogTitle>{submission?.businessName ?? "Submission"}</DialogTitle>
            <DialogDescription>
              {decided && submission
                ? `${REVIEW_STATUS_LABELS[submission.status]}${
                    submission.reviewedAt
                      ? ` on ${formatDate(submission.reviewedAt)}`
                      : ""
                  }.`
                : "Approving creates a published listing straight away, with the categories below."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>What was sent</CardTitle>
                {submission ? (
                  <CardDescription>
                    Confirmed by email
                    {submission.verifiedAt
                      ? ` on ${formatDate(submission.verifiedAt)}`
                      : ""}
                    .
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-4">
                <Detail label="Contact email" value={submission?.contactEmail} />
                <Detail label="Address" value={submission?.address} />
                <Detail label="Phone" value={submission?.phone} />
                <Detail label="Website" value={submission?.website} />
                <Detail
                  label="Categories"
                  value={submission?.categoryNames.join(", ")}
                />
                <Detail
                  label="Description"
                  value={submission?.description}
                  multiline
                />
              </CardContent>
            </Card>

            {decided ? (
              submission?.reviewNote ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The note that was sent</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">
                      {submission.reviewNote}
                    </p>
                    {listing ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        It became {listing.title}.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null
            ) : (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>A note back</CardTitle>
                  <CardDescription>
                    Emailed to the sender either way. Optional when approving,
                    worth writing when not.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor="submission-note">Note</FieldLabel>
                      <CharacterCount value={note} max={500} />
                    </div>
                    <Textarea
                      id="submission-note"
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
                  Approve and publish
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** One read-only line. Empty answers say so rather than leaving a gap. */
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
