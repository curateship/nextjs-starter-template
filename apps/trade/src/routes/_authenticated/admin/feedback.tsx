import { createFileRoute } from "@tanstack/react-router"

import { FeedbackDashboard } from "@/components/feedback/feedback-dashboard"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { FEEDBACK_TYPES } from "@/lib/feedback-type"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/list-search"
import { readOpenSearch } from "@/lib/use-open-from-link"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getFeedbackErrorMessage } from "@/lib/api/feedback"

export const FEEDBACK_SORT_COLUMNS = [
  "message",
  "type",
  // The table has always had a Status header you can click. It was missing
  // here, so the address value was refused and the list quietly fell back to
  // sorting by date — the roadmap-order sort in the dashboard never ran.
  "status",
  "author",
  "created",
  "comments",
  "votes",
] as const

const FEEDBACK_TYPE_FILTERS = ["all", ...FEEDBACK_TYPES] as const

type FeedbackSearch = {
  open?: string
  q?: string
  type?: (typeof FEEDBACK_TYPE_FILTERS)[number]
  sort?: (typeof FEEDBACK_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/**
 * `?open=<id>` is how the Overview links to one piece of feedback; the
 * rest is the list state, so Back returns the exact list you left. Every value
 * is checked before use.
 */
function readFeedbackSearch(search: Record<string, unknown>): FeedbackSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    type: readOneOf(search.type, FEEDBACK_TYPE_FILTERS),
    sort: readOneOf(search.sort, FEEDBACK_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  validateSearch: readFeedbackSearch,
  component: FeedbackRoute,
  errorComponent: routeErrorComponent(getFeedbackErrorMessage),
})

function FeedbackRoute() {
  const runtime = useShellRuntime()
  const { open } = Route.useSearch()

  return (
    <FeedbackDashboard
      refreshToken={runtime.feedbackRefreshToken}
      onOpenFeedback={runtime.onOpenFeedback}
      openId={open}
    />
  )
}
