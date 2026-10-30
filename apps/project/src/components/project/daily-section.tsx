import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * One part of the Daily card, such as deep work or the routine, on a light
 * gray ground with a border, drawn like the panel's other cards (Tyler, 30
 * Oct 2026: "It looks too busy with all the sections, we need to clean it
 * up. try putting them in light gray bg", then "the daily section cards is
 * missing border").
 */
export function DailySection({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border bg-muted/40 p-3", className)} {...props} />
}
