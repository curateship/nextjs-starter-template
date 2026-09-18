import * as React from "react"
import { Link } from "@tanstack/react-router"

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
import { FormDialog } from "@/components/ui/form-dialog"
import {
  closeListingReport,
  getListingReportErrorMessage,
  type ListingReportSummary,
} from "@/lib/api/directory/reports"
import {
  LISTING_REPORT_REASON_LABELS,
  LISTING_REPORT_STATUS_LABELS,
} from "@/lib/directory/report-reasons"
import { formatDateTime } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * One report, and the two things an admin can do about it.
 *
 * Neither button touches the listing. Fixed means "I have already corrected the
 * page"; Dismissed means "there is nothing to correct". The window links to the
 * listing's own editor because that is where the correction actually happens,
 * and a window that offered to apply a stranger's words to a public page would
 * be the thing this whole feature was built to avoid.
 */
export function ListingReportDialog({
  open,
  report,
  onClose,
  onClosed,
}: {
  open: boolean
  report: ListingReportSummary | null
  onClose: () => void
  onClosed: (decision: "fixed" | "dismissed") => void | Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const done = report ? report.status !== "open" : false

  async function decide(decision: "fixed" | "dismissed") {
    if (!report) return
    dismissErrorToast()
    setBusy(true)
    try {
      await closeListingReport({ id: report.id, decision })
      await onClosed(decision)
    } catch (error) {
      showErrorToast(getListingReportErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={false} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {report
                ? LISTING_REPORT_REASON_LABELS[report.reason]
                : "A report"}
            </DialogTitle>
            <DialogDescription>
              {done
                ? `Already marked ${report ? LISTING_REPORT_STATUS_LABELS[report.status].toLowerCase() : "dealt with"}.`
                : "A visitor sent this. Nothing on the listing has changed."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{report?.listingTitle ?? "The listing"}</CardTitle>
                <CardDescription>
                  Reported {report ? formatDateTime(report.createdAt) : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    What they said
                  </span>
                  {/* `whitespace-pre-wrap` so the lines they typed stay the
                      lines they typed. It is plain text in a paragraph, never
                      markup, so nothing a stranger sent can draw anything. */}
                  <p className="text-sm whitespace-pre-wrap">
                    {report?.note || "They left no note."}
                  </p>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Their email
                  </span>
                  <p className="text-sm">
                    {report?.reporterEmail || (
                      <span className="text-muted-foreground">
                        They did not give one.
                      </span>
                    )}
                  </p>
                </div>
                {report ? (
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                      <Link
                        to="/admin/listings"
                        search={{ open: report.listingId }}
                      >
                        Edit the listing
                      </Link>
                    </Button>
                    <Button asChild variant="ghost">
                      <Link
                        to="/directory/$slug"
                        params={{ slug: report.listingSlug }}
                        target="_blank"
                        rel="noreferrer"
                      >
                        See the page
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </DialogBody>

          <DialogFooter>
            {done ? (
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
                  onClick={() => void decide("dismissed")}
                >
                  Dismiss
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("fixed")}
                >
                  Mark fixed
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
