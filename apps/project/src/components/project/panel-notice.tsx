import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A card in an open task's right panel that asks for something: "Dana handed
 * you this task", "Waiting for review", "Asked for Nov 14", Move to project,
 * Ask for more time and Remind me. It is drawn as the shell's panel card
 * (`[data-slot="panel-card"]` and `[data-panel-card-tile]` in theme.css), so
 * every Settings → Styling → Panel cards setting reaches it as it reaches a
 * person's Profile on the Admin dashboard: corners, grey, tile, border,
 * shadow, reaching the panel's edges, and Opacity when it is the first card.
 * It has a heading and no fold: each one is there only until it is answered.
 */
export function PanelNotice({
  title,
  ref,
  children,
}: {
  title: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}) {
  return (
    <div
      ref={ref}
      data-slot="panel-card"
      className={cn(
        "min-w-0",
        // Fields sit on the page background, so a box to type in never looks like part of the grey.
        "[&_[data-slot=input]]:bg-background [&_[data-slot=select-trigger]]:bg-background [&_[data-slot=textarea]]:bg-background",
        // A narrow right panel (12% unless Side panels says wider) squeezes a picker to fit rather than pushing past the edge.
        "[&_[data-slot=select-trigger]]:max-w-full [&_[data-slot=select-trigger]]:min-w-0"
      )}
    >
      <div className="p-4">
        <h2 className="flex min-h-7 items-center text-[15px] font-semibold break-words">{title}</h2>
      </div>
      <div data-panel-card-tile="" className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {children}
      </div>
    </div>
  )
}
