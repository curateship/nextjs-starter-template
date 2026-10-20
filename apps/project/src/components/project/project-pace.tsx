import { PROJECT_PACE_LABEL, type ProjectPace } from "@/lib/project/project-pace"
import { cn } from "@/lib/utils"

const PACE_DOT: Record<ProjectPace, string> = {
  on_track: "bg-green-600",
  slowing: "bg-amber-500",
  behind: "bg-red-500",
}

/**
 * "● Behind · 3 late": the project's status from its late tasks, its dot and
 * its word, never the colour alone. The count is left off while none are late.
 */
export function ProjectPaceMark({ pace, late, className }: { pace: ProjectPace; late: number; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", PACE_DOT[pace])} />
      <span className="font-medium">{PROJECT_PACE_LABEL[pace]}</span>
      {late ? <span className="text-muted-foreground">· {late} late</span> : null}
    </span>
  )
}
