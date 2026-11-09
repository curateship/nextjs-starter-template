import * as React from "react"

import { SlideBar } from "@/components/shared/notes/side-rows"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The rows of a dashboard's fixed Dashboards block: a row per section, the
 * one showing picked, as on the Admin dashboard and the CRM (Tyler, 8 Nov
 * 2026: "we're moving the 3 tabs ... to the left side as a block", then "We
 * need to get the CRM dashboard up to date with the new admin dashboard").
 *
 * - **Look:** names grey and the picked one dark, all at one weight so a name
 *   never jumps; a count, when a section has one, in the lightest grey pill
 *   with a grey number. No row is shaded.
 * - **The bar** (`SlideBar`): every row has a small dark bar before its
 *   name with no width until the row is picked; then its width and the gap
 *   after it grow over 220ms, and the last one's shrinks away. The CRM's
 *   picking blocks draw the same bar (`side-rows.tsx`).
 * - **A press** picks the row at once, and the section switches after the
 *   bar has grown: drawing a new section keeps the browser busy for 100 to
 *   185ms, and a bar growing then skipped most of its frames. With less
 *   motion asked for it switches at once. It switches only if the page is
 *   still where it was pressed, and the address takes over once it says
 *   something new.
 */

/** How long a row's bar takes to grow; the section switches after it. */
const BAR_MS = 220

export type DashboardSection<Key extends string> = {
  key: Key
  label: string
  /** The count in the row's pill; none while it is read, or for a section with no count. */
  value?: string
}

export function DashboardsRows<Key extends string>({
  sections,
  current,
  onPick,
}: {
  sections: readonly DashboardSection<Key>[]
  /** The section showing now, from the address. */
  current: Key
  onPick: (key: Key) => void
}) {
  const [pressed, setPressed] = React.useState<{ key: Key; from: Key } | null>(null)
  if (pressed && current !== pressed.from) setPressed(null)
  const timer = React.useRef(0)
  React.useEffect(() => () => window.clearTimeout(timer.current), [])
  const shown = pressed?.key ?? current

  const press = (key: Key) => {
    window.clearTimeout(timer.current)
    if (key === current) {
      setPressed(null)
      return
    }
    setPressed({ key, from: current })
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const from = window.location.href
    timer.current = window.setTimeout(
      () => {
        if (window.location.href === from) onPick(key)
      },
      still ? 0 : BAR_MS
    )
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5 p-1.5">
      {sections.map((section) => {
        const picked = section.key === shown
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => press(section.key)}
            // A press is the row's, not the page editor's around the block,
            // which would select the whole block and take the focus. The
            // capture runs before the editor's own listener.
            onMouseDownCapture={(event) => event.preventDefault()}
            aria-current={picked ? "true" : undefined}
            // The name takes the room the count leaves, and shortens only
            // when there is none: an empty middle column used to take the
            // room first, so "Overview" read "Overvi…" in a narrow panel
            // with space to spare (Trade, 8 Nov 2026).
            className={cn(
              "grid min-h-9 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm",
              "hover:[&>span:first-child]:text-foreground",
              focusRingInset
            )}
          >
            <span
              className={cn(
                "flex min-w-0 items-center font-medium transition-colors",
                picked ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <SlideBar on={picked} />
              <span className="min-w-0 truncate">{section.label}</span>
            </span>
            {section.value !== undefined ? (
              <span className="shrink-0 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums">
                {section.value}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
