import * as React from "react"
import { Link } from "@tanstack/react-router"

import { CharacterCount } from "@/components/shared/character-count"
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
import { SubmissionDetail as Detail } from "@/components/directory/submission-parts"
import { getAdminSubmissionErrorMessage } from "@/lib/api/directory/submissions"
import {
  decideSuggestedEvent,
  type EventSubmission,
} from "@/lib/api/events/submissions"
import { submissionWhen } from "@/lib/events/event-submission-fields"
import { eventRowText } from "@/lib/events/event-time"
import { formatDate } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const DECIDED_LABELS = { approved: "Approved", rejected: "Rejected" }

/**
 * One suggested event, read in full, with the two answers under it.
 *
 * Approving makes a draft, never a published event, so the window says so
 * before the button. A suggestion already dealt with opens read-only: it is a
 * record of what happened, not a decision to make again.
 */
export function EventSubmissionDialog({
  open,
  submission,
  onClose,
  onDecided,
}: {
  open: boolean
  submission: EventSubmission | null
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

  const decided =
    submission && submission.status !== "pending" ? submission.status : null

  async function decide(decision: "approve" | "reject") {
    if (!submission) return
    dismissErrorToast()
    setBusy(true)
    try {
      const { emailed } = await decideSuggestedEvent({
        id: submission.id,
        decision,
        note,
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
            <DialogTitle>{submission?.title ?? "Suggestion"}</DialogTitle>
            <DialogDescription>
              {decided && submission
                ? `${DECIDED_LABELS[decided]}${
                    submission.reviewedAt
                      ? ` on ${formatDate(submission.reviewedAt)}`
                      : ""
                  }.`
                : submission?.changes
                  ? `The owner of ${submission.placeName} asked to change an event they sent. Approving writes the change onto the event, which stays published.`
                  : submission?.fromOwner
                    ? `Sent by the owner of ${submission.placeName}, for their own listing. Approving publishes it on the Events page straight away.`
                    : "Approving saves it as a draft event with everything below. Nothing is public until you publish it."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {submission?.duplicateOf ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Already on the site?</CardTitle>
                  <CardDescription>
                    This site already has {submission.duplicateOf.title} on
                    this day. Approving still works.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    to="/admin/events"
                    search={{ open: submission.duplicateOf.id }}
                    className="w-fit text-sm underline-offset-4 hover:underline"
                  >
                    Open {submission.duplicateOf.title}
                  </Link>
                </CardContent>
              </Card>
            ) : null}

            {submission?.changes && !decided ? (
              <ChangeCard submission={submission} />
            ) : null}

            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {submission?.changes ? "The change, as asked" : "What was sent"}
                </CardTitle>
                {submission ? (
                  <CardDescription>
                    Sent on {formatDate(submission.createdAt)}.
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-4">
                <Detail
                  label="When"
                  value={
                    submission
                      ? eventRowText(submissionWhen(submission))
                      : undefined
                  }
                />
                <Detail label="Place" value={submission?.placeName} />
                <Detail
                  label="Street address"
                  value={submission?.placeAddress}
                />
                <Detail
                  label="Description"
                  value={submission?.description}
                  multiline
                />
                {submission?.photoUrl ? (
                  <div className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Photo
                    </span>
                    <img
                      src={submission.photoUrl}
                      alt={`The photo sent with ${submission.title}`}
                      className="aspect-video w-full rounded-md border bg-muted/50 object-cover"
                    />
                  </div>
                ) : (
                  <Detail label="Photo" value={undefined} />
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Who sent it</CardTitle>
                {submission?.fromOwner ? (
                  <CardDescription>
                    The owner of {submission.placeName}, from My listings.
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-4">
                <Detail label="Name" value={submission?.submitterName} />
                <Detail label="Email" value={submission?.submitterEmail} />
              </CardContent>
            </Card>

            {decided ? (
              submission?.reviewNote || submission?.eventId ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>
                      {submission.reviewNote
                        ? "The note that was sent"
                        : "What it became"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {submission.reviewNote ? (
                      <p className="text-sm whitespace-pre-wrap">
                        {submission.reviewNote}
                      </p>
                    ) : null}
                    {submission.eventId ? (
                      <Link
                        to="/admin/events"
                        search={{ open: submission.eventId }}
                        className="w-fit text-sm underline-offset-4 hover:underline"
                      >
                        Open the event
                      </Link>
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
                      <FieldLabel htmlFor="event-submission-note">
                        Note
                      </FieldLabel>
                      <CharacterCount value={note} max={500} />
                    </div>
                    <Textarea
                      id="event-submission-note"
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
                  {submission?.changes
                    ? "Approve the change"
                    : submission?.fromOwner
                      ? "Approve and publish"
                      : "Approve as a draft"}
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
 * An owner's change, each field it touches twice: what the event says now,
 * then what the owner asked for. Only the fields that differ are listed, the
 * same way an owner's change to a listing is shown on the Listings dashboard.
 */
function ChangeCard({ submission }: { submission: EventSubmission }) {
  const current = submission.changes?.current
  if (!current) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Before and after</CardTitle>
          <CardDescription>
            The event this change is for is no longer on the site.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  const asked = submissionWhen(submission)
  const rows = [
    {
      label: "Title",
      now: current.title,
      asked: submission.title,
    },
    {
      label: "When",
      now: eventRowText({
        startDate: current.startDate,
        startTime: current.startTime,
        endDate: current.endTime ? current.startDate : null,
        endTime: current.endTime,
      }),
      asked: eventRowText(asked),
    },
    {
      label: "Summary",
      now: current.summary,
      asked: submission.description.split(/\n{2,}/)[0]?.trim() ?? "",
    },
    {
      label: "Photo",
      now: current.coverImage ? "Set" : "None",
      asked: submission.photoUrl
        ? submission.photoUrl === current.coverImage
          ? "Set"
          : "A new photo"
        : "Kept as it is",
    },
  ].filter((row) => row.now !== row.asked && row.asked !== "Kept as it is")

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Before and after</CardTitle>
        <CardDescription>
          {rows.length
            ? "What the event says now, then what the owner asked for."
            : "Nothing the owner sent differs from the event as it is."}
        </CardDescription>
      </CardHeader>
      {rows.length ? (
        <CardContent className="grid gap-4">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {row.label}
              </span>
              <span className="text-muted-foreground line-through">
                {row.now || "Empty"}
              </span>
              <span>{row.asked || "Empty"}</span>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  )
}
