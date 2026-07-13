import { AlertCircleIcon } from "lucide-react"

// Page-level error banner rendered above a dashboard table when its data can't
// load. Persistent by design — a load failure leaves the page with nothing to
// show, so it needs a standing explanation rather than a transient toast.
// Everything else (successes, action failures) is surfaced via `toast`.
export function DashboardNotices({ error }: { error: string | null }) {
  if (!error) return null

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  )
}
