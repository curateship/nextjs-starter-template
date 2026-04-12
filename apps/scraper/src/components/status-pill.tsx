import { formatStatus } from "@/lib/format"

const statusClasses: Record<string, string> = {
  queued: "border border-border bg-secondary text-secondary-foreground",
  running: "border border-primary/20 bg-primary/10 text-primary",
  succeeded: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "border border-destructive/20 bg-destructive/10 text-destructive",
  blocked: "border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  canceled: "border border-border bg-muted text-muted-foreground",
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusClasses[status] ?? statusClasses.queued}`}
    >
      {formatStatus(status)}
    </span>
  )
}
