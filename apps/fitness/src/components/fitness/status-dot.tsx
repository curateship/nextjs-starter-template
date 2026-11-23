import type { ScheduleStatus } from "@/lib/fitness/schedule"
import { cn } from "@/lib/utils"

/**
 * The small dot a calendar date or a weekday carries for its state, as Tyler
 * drew them on 18 Oct 2026: green when done, amber when missed, an empty ring
 * when planned or a rest day, dark for today. The same greens and ambers as
 * the shell's own meters. A day skipped on purpose is a grey dot. A dot is
 * never the only sign: whatever carries one also says the state in words, on
 * screen or to a screen reader.
 */
export type DotKind = ScheduleStatus | "today" | "rest"

const DOT: Record<DotKind, string> = {
  done: "bg-emerald-500 dark:bg-emerald-400",
  missed: "bg-amber-500 dark:bg-amber-400",
  planned: "border-[1.5px] border-muted-foreground/60",
  paused: "border-[1.5px] border-dashed border-muted-foreground/60",
  skipped: "bg-muted-foreground/40",
  rest: "border-[1.5px] border-muted-foreground/40",
  today: "bg-foreground",
}

export function StatusDot({ kind, className }: { kind: DotKind; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[kind], className)} />
}
