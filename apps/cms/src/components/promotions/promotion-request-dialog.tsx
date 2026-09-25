import * as React from "react"
import { Link } from "@tanstack/react-router"

import { SubmissionDetail as Detail } from "@/components/directory/submission-dialog"
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
import {
  decidePromotionRequestFor,
  getPromotionRequestErrorMessage,
  type PromotionRequest,
} from "@/lib/api/promotions/requests"
import { formatDate } from "@/lib/format/format-time"
import { dealContentLines } from "@/lib/promotions/deal-content"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const DECIDED_LABELS = { approved: "Approved", rejected: "Rejected" }

/**
 * One owner's request, read in full, with the two answers under it.
 *
 * A new deal lists everything the owner wrote. A change shows only what
 * differs, the live wording beside the new, so the admin reads the change
 * rather than hunting for it. A request already dealt with opens read-only.
 */
export function PromotionRequestDialog({
  open,
  request,
  onClose,
  onDecided,
}: {
  open: boolean
  request: PromotionRequest | null
  onClose: () => void
  /** `emailed` is whether the owner was actually told, not whether we tried. */
  onDecided: (decision: "approve" | "reject", emailed: boolean) => void
}) {
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? (request?.id ?? null) : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setNote("")
  }

  const decided = request && request.status !== "pending" ? request.status : null
  const isChange = request?.kind === "change"

  async function decide(decision: "approve" | "reject") {
    if (!request) return
    dismissErrorToast()
    setBusy(true)
    try {
      const { emailed } = await decidePromotionRequestFor({
        id: request.id,
        decision,
        note,
      })
      onDecided(decision, emailed)
    } catch (error) {
      showErrorToast(getPromotionRequestErrorMessage(error))
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
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{request?.content.title ?? "Deal"}</DialogTitle>
            <DialogDescription>
              {decided && request
                ? `${DECIDED_LABELS[decided]}${
                    request.reviewedAt
                      ? ` on ${formatDate(request.reviewedAt)}`
                      : ""
                  }.`
                : isChange
                  ? `New wording from the owner of ${request?.listingTitle}. The live deal stays as it is until you approve this.`
                  : `A new deal from the owner of ${request?.listingTitle}, for their own listing. Approving publishes it on the Deals page straight away.`}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {request ? (
              isChange ? (
                <ChangeCard request={request} />
              ) : (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>What was sent</CardTitle>
                    <CardDescription>
                      Sent on {formatDate(request.createdAt)}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {dealContentLines(request.content).map((line) =>
                      line.label === "Photo" ? (
                        <Photo key={line.label} url={line.value} />
                      ) : (
                        <Detail
                          key={line.label}
                          label={line.label}
                          value={line.value}
                          multiline
                        />
                      )
                    )}
                  </CardContent>
                </Card>
              )
            ) : null}

            <Card size="sm">
              <CardHeader>
                <CardTitle>Who sent it</CardTitle>
                <CardDescription>
                  The owner of {request?.listingTitle}, from My listings.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Detail label="Name" value={request?.ownerName} />
                <Detail label="Email" value={request?.ownerEmail} />
              </CardContent>
            </Card>

            {decided ? (
              request?.reviewNote ||
              (request?.promotionId && decided === "approved") ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>
                      {request.reviewNote
                        ? "The note that was sent"
                        : "What it became"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {request.reviewNote ? (
                      <p className="text-sm whitespace-pre-wrap">
                        {request.reviewNote}
                      </p>
                    ) : null}
                    {request.promotionId && decided === "approved" ? (
                      <Link
                        to="/admin/promotions"
                        search={{ open: request.promotionId }}
                        className="w-fit text-sm underline-offset-4 hover:underline"
                      >
                        Open the deal
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
                    Emailed to the owner either way. Optional when approving,
                    worth writing when not.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor="promotion-request-note">
                        Note
                      </FieldLabel>
                      <CharacterCount value={note} max={500} />
                    </div>
                    <Textarea
                      id="promotion-request-note"
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
                  {isChange ? "Approve the change" : "Approve and publish"}
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
 * Only the lines that differ, live beside new. Two columns from a phone's
 * width up; on a phone the new wording sits under the live one.
 */
function ChangeCard({ request }: { request: PromotionRequest }) {
  const after = dealContentLines(request.content)
  const before = request.live ? dealContentLines(request.live.content) : null
  const changed = after.filter(
    (line, index) => !before || before[index]?.value !== line.value
  )
  const unchanged = after
    .filter((line) => !changed.includes(line))
    .map((line) => line.label.toLowerCase())

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>What changes</CardTitle>
        <CardDescription>
          {before
            ? `Sent on ${formatDate(request.createdAt)}.${
                unchanged.length
                  ? ` The ${unchanged.join(", ")} stay as they are.`
                  : ""
              }`
            : "The deal this changes has been deleted, so there is nothing to compare it with."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {changed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing differs from the live deal.
          </p>
        ) : (
          changed.map((line) => {
            const was = before?.find((each) => each.label === line.label)
            return (
              <div key={line.label} className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {line.label}
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ChangedValue caption="Live now" value={was?.value ?? ""} photo={line.label === "Photo"} />
                  <ChangedValue caption="Changed to" value={line.value} photo={line.label === "Photo"} />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function ChangedValue({
  caption,
  value,
  photo,
}: {
  caption: string
  value: string
  photo: boolean
}) {
  return (
    <div className="grid min-w-0 content-start gap-1 rounded-md border p-2">
      <span className="text-xs text-muted-foreground">{caption}</span>
      {photo && value ? (
        <img
          src={value}
          alt=""
          className="aspect-video w-full rounded-sm object-cover"
        />
      ) : (
        <p
          className={`text-sm whitespace-pre-wrap wrap-anywhere ${value ? "" : "text-muted-foreground"}`}
        >
          {value || "Nothing"}
        </p>
      )}
    </div>
  )
}

function Photo({ url }: { url: string }) {
  return url ? (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">Photo</span>
      <img
        src={url}
        alt=""
        className="aspect-video w-full rounded-md border bg-muted/50 object-cover"
      />
    </div>
  ) : (
    <Detail label="Photo" value={undefined} />
  )
}
