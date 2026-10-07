import { createFileRoute } from "@tanstack/react-router"

import { HistoryPage } from "@/components/pomodoro/history-page"
import { reportRanges, type ReportRange } from "@/lib/pomodoro/focus-history"

const DEFAULT_RANGE: ReportRange = "7d"

/** The focus report: the range strip, by-day and hour charts, trend, top tasks, sessions, CSV. */
export const Route = createFileRoute("/_pomodoro/history")({
  // The range lives in the address so a reload or Back keeps it, and a link
  // can open 12 months. The default is left off, and anything unknown falls
  // back to it. The key is returned as undefined rather than left out: the
  // router keeps the raw address value for a key the validator omits, which
  // let `?range=bogus` through to the page with no tab chosen.
  validateSearch: (search: Record<string, unknown>): { range?: ReportRange } => {
    const range = reportRanges.find((option) => option === search.range)
    return { range: range && range !== DEFAULT_RANGE ? range : undefined }
  },
  component: HistoryRoute,
})

function HistoryRoute() {
  const { range } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <HistoryPage
      range={range ?? DEFAULT_RANGE}
      // Replaced rather than added, so Back leaves the page instead of
      // stepping through every range that was clicked.
      onRangeChange={(next) =>
        void navigate({
          search: next === DEFAULT_RANGE ? {} : { range: next },
          replace: true,
        })
      }
    />
  )
}
