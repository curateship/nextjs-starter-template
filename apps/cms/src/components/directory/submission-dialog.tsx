import * as React from "react"
import { Link } from "@tanstack/react-router"
import { TriangleAlertIcon } from "lucide-react"

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
import {
  describeDuplicateMatch,
  type DuplicateMatch,
} from "@/lib/directory/submission-duplicates"
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
  duplicates,
  onClose,
  onDecided,
}: {
  open: boolean
  submission: SubmissionSummary | null
  /** The listing an approved one became, when it has one. */
  listing: { title: string; slug: string } | null
  /** Listings already on the site that this one looks like. Empty for most. */
  duplicates: DuplicateMatch[]
  onClose: () => void
  /** `emailed` is whether the sender was actually told, not whether we tried. */
  onDecided: (decision: "approve" | "reject", emailed: boolean) => void
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

  async function decide(
    decision: "approve" | "reject",
    alreadyListedId?: string
  ) {
    if (!submission) return
    dismissErrorToast()
    setBusy(true)
    try {
      const { emailed } = await decideSubmission({
        id: submission.id,
        decision,
        note,
        alreadyListedId,
      })
      onDecided(decision, emailed)
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
            {!decided && duplicates.length ? (
              <DuplicateWarning
                duplicates={duplicates}
                busy={busy}
                onReject={(listingId) => void decide("reject", listingId)}
              />
            ) : null}

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
                <SubmissionDetail label="Contact email" value={submission?.contactEmail} />
                <SubmissionDetail label="Address" value={submission?.address} />
                <SubmissionDetail label="Phone" value={submission?.phone} />
                <SubmissionDetail label="Website" value={submission?.website} />
                <SubmissionDetail
                  label="Categories"
                  value={submission?.categoryNames.join(", ")}
                />
                <SubmissionDetail
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

/**
 * "This looks like Luigi's Pizza, already listed", once per listing it looks
 * like, with what matched and a way to open it.
 *
 * A published one also offers to reject with a pointer: the email then tells
 * the sender the business is already listed and gives them its claim button,
 * so an owner who missed their own page ends up looking after it. A draft has
 * no page a stranger could open, so it only gets the link.
 */
function DuplicateWarning({
  duplicates,
  busy,
  onReject,
}: {
  duplicates: DuplicateMatch[]
  busy: boolean
  onReject: (listingId: string) => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
          Possibly already listed
        </CardTitle>
        <CardDescription>
          Check before approving. Nothing is rejected unless you say so.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {duplicates.map((match) => (
          <div
            key={match.listingId}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="grid min-w-0 gap-1">
              <p className="text-sm">
                This looks like{" "}
                <Link
                  to="/admin/listings"
                  search={{ open: match.listingId }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {match.title}
                </Link>
                , already listed
                {match.status === "published" ? "." : " as a draft."}
              </p>
              <p className="text-xs text-muted-foreground">
                {describeDuplicateMatch(match.matched)}
              </p>
            </div>
            {match.status === "published" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-start sm:self-auto"
                disabled={busy}
                onClick={() => onReject(match.listingId)}
              >
                Reject, point to it
              </Button>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * One read-only line. Empty answers say so rather than leaving a gap. The
 * event suggestions window uses it too.
 */
export function SubmissionDetail({
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
