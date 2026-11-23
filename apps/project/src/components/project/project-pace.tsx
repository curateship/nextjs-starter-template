import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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

/**
 * The status as its dot alone, beside the project's name in the left panel's
 * header (Tyler, 5 Nov 2026: "Remove the status and just place the dot
 * indicator here"). The words are its name and its hover, never the colour
 * alone.
 */
export function ProjectPaceDot({ pace, late }: { pace: ProjectPace; late: number }) {
  const words = late ? `${PROJECT_PACE_LABEL[pace]} · ${late} late` : PROJECT_PACE_LABEL[pace]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" tabIndex={0} aria-label={`Status: ${words}`} className="inline-flex size-4 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className={cn("size-2 rounded-full", PACE_DOT[pace])} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{words}</TooltipContent>
    </Tooltip>
  )
}
