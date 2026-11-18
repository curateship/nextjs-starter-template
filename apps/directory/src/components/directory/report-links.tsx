import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  type ProblemReportSummary,
} from "@/lib/api/directory/reports"

/**
 * The editor where the correction happens, and the public page the visitor
 * saw. Each kind has its own two addresses.
 */
export function ReportLinks({ report }: { report: ProblemReportSummary }) {
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
