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
  type ProblemReportSummary,
} from "@/lib/api/directory/reports"
import {
  LISTING_REPORT_STATUS_LABELS,
  REPORT_KIND_LABELS,
  REPORT_REASON_LABELS,
  type ReportKind,
} from "@/lib/directory/report-reasons"
import { formatDateTime } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * One report about a listing or an event, and the two things an admin can do
 * about it.
 *
 * Neither button touches the page. Fixed means "I have already corrected the
 * page"; Dismissed means "there is nothing to correct". The window links to the
 * listing's or event's own editor because that is where the correction happens,
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
  report: ProblemReportSummary | null
  onClose: () => void
  onClosed: (
    decision: "fixed" | "dismissed",
    kind: ReportKind
  ) => void | Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const done = report ? report.status !== "open" : false

  async function decide(decision: "fixed" | "dismissed") {
    if (!report) return
    dismissErrorToast()
    setBusy(true)
    try {
      await closeListingReport({ id: report.id, decision })
      await onClosed(decision, report.kind)
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
              {report ? REPORT_REASON_LABELS[report.reason] : "A report"}
            </DialogTitle>
            <DialogDescription>
              {done
                ? `Already marked ${report ? LISTING_REPORT_STATUS_LABELS[report.status].toLowerCase() : "dealt with"}.`
                : `A visitor sent this. Nothing on the ${report ? REPORT_KIND_LABELS[report.kind].toLowerCase() : "page"} has changed.`}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{report?.subjectTitle ?? "The page"}</CardTitle>
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
                {report ? <ReportLinks report={report} /> : null}
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

/**
 * The editor where the correction happens, and the public page the visitor
 * saw. Each kind has its own two addresses.
 */
function ReportLinks({ report }: { report: ProblemReportSummary }) {
  if (report.kind === "promotion") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/admin/promotions" search={{ open: report.subjectId }}>
            Edit the deal
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link
            to="/deals/$slug"
            params={{ slug: report.subjectSlug }}
            target="_blank"
            rel="noreferrer"
          >
            See the page
          </Link>
        </Button>
      </div>
    )
  }
  if (report.kind === "event") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/admin/events" search={{ open: report.subjectId }}>
            Edit the event
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link
            to="/events/$slug"
            params={{ slug: report.subjectSlug }}
            target="_blank"
            rel="noreferrer"
          >
            See the page
          </Link>
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <Link to="/admin/listings" search={{ open: report.subjectId }}>
          Edit the listing
        </Link>
      </Button>
      <Button asChild variant="ghost">
        <Link
          to="/directory/$slug"
          params={{ slug: report.subjectSlug }}
          target="_blank"
          rel="noreferrer"
        >
          See the page
        </Link>
      </Button>
    </div>
  )
}
