import * as React from "react"
import { toast } from "sonner"

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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getListingReportErrorMessage,
  reportListingProblem,
} from "@/lib/api/directory/reports"
import { LISTING_REPORT_NOTE_MAX } from "@/lib/directory/field-lengths"
import {
  LISTING_REPORT_REASONS,
  LISTING_REPORT_REASON_LABELS,
  type ListingReportReason,
} from "@/lib/directory/report-reasons"
import { focusRing } from "@/lib/layout/focus-ring"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * "Report a problem" under a listing's details, and the window behind it.
 *
 * Deliberately the quietest control on the page: a small link, not a button.
 * It is for the handful of readers who know something the site does not, and a
 * page where complaining is as loud as claiming reads as a page that expects to
 * be wrong.
 *
 * No account, because the person who drove to the bakery and found it shut has
 * none. Nothing they send appears on the page, and the listing does not change
 * — an admin reads the report and fixes the listing by hand.
 */
export function ReportProblemButton({
  listingId,
  listingTitle,
}: {
  listingId: string
  listingTitle: string
}) {
  const [open, setOpen] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  if (sent) {
    return (
      <p className="text-xs text-muted-foreground">
        Thank you. Somebody who looks after this site will read it.
      </p>
    )
  }

  return (
    <>
      {/* A plain button, not the Button primitive: this is a line of text in
          the page, and the UI standard forbids overriding a control's height
          at the call site to make one look like one. The focus ring is the
          shared one, so a keyboard stop here looks like every other. */}
      <button
        type="button"
        className={cn(
          "rounded-sm text-xs text-muted-foreground underline-offset-4 hover:underline",
          focusRing
        )}
        onClick={() => setOpen(true)}
      >
        Report a problem
      </button>
      <ReportProblemDialog
        open={open}
        listingId={listingId}
        listingTitle={listingTitle}
        onClose={() => setOpen(false)}
        onSent={() => {
          setOpen(false)
          setSent(true)
        }}
      />
    </>
  )
}

function ReportProblemDialog({
  open,
  listingId,
  listingTitle,
  onClose,
  onSent,
}: {
  open: boolean
  listingId: string
  listingTitle: string
  onClose: () => void
  onSent: () => void
}) {
  const [reason, setReason] = React.useState<ListingReportReason>("wrong_hours")
  const [note, setNote] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [sending, setSending] = React.useState(false)

  // Emptied as the window opens rather than in an effect, so a second report
  // never starts with the first one's words still in it.
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? listingId : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setReason("wrong_hours")
    setNote("")
    setEmail("")
  }

  const dirty = Boolean(note.trim() || email.trim())

  async function send() {
    dismissErrorToast()
    setSending(true)
    try {
      await reportListingProblem({
        listingId,
        reason,
        note,
        reporterEmail: email,
      })
      toast.success("Thank you for the report")
      onSent()
    } catch (error) {
      // The server's own words — "Tell us in a line or two what is wrong" —
      // rather than a code.
      showErrorToast(getListingReportErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={sending} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report a problem with {listingTitle}</DialogTitle>
            <DialogDescription>
              This goes to the people who run the site. The page does not change
              until one of them fixes it.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>What is wrong</CardTitle>
                <CardDescription>
                  A line about what you found is worth more than anything else
                  here.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="report-reason">The problem</FieldLabel>
                  <Select
                    value={reason}
                    disabled={sending}
                    onValueChange={(value) =>
                      setReason(value as ListingReportReason)
                    }
                  >
                    <SelectTrigger id="report-reason" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LISTING_REPORT_REASONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {LISTING_REPORT_REASON_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel
                      htmlFor="report-note"
                      hint="What you saw, and when. Needed when you pick “Something else”."
                    >
                      Note
                    </FieldLabel>
                    <CharacterCount
                      value={note}
                      max={LISTING_REPORT_NOTE_MAX}
                    />
                  </div>
                  <Textarea
                    id="report-note"
                    rows={1}
                    maxLength={LISTING_REPORT_NOTE_MAX}
                    placeholder="Closed at 4pm on Sunday, not 6pm."
                    value={note}
                    disabled={sending}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>If you want a reply</CardTitle>
                <CardDescription>
                  Optional. Nothing is sent to it automatically, and it is never
                  shown on the site.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="report-email">Your email</FieldLabel>
                  <Input
                    id="report-email"
                    type="email"
                    autoComplete="email"
                    /* The same cap the endpoint's validator has. Without it a
                       pasted essay dies in the validator and the visitor gets
                       its wording instead of ours. */
                    maxLength={255}
                    value={email}
                    disabled={sending}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={sending}
              onClick={requestClose}
            >
              Cancel
            </Button>
            {/* Kept enabled: the server says what is wrong in a sentence, and a
                button that greys itself out never says why. */}
            <Button type="button" disabled={sending} onClick={() => void send()}>
              Send the report
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
