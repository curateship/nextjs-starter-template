import { AlertCircleIcon } from "lucide-react"

// The notice + error banner pair rendered above every dashboard table.
export function DashboardNotices({
  notice,
  error,
}: {
  notice: string | null
  error: string | null
}) {
  return (
    <>
      {notice ? (
        <div className="mb-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </>
  )
}
