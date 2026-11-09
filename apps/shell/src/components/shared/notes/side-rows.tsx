import * as React from "react"

import { Button } from "@/components/ui/button"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The rows every block and widget draws, on the Admin dashboard and the CRM
 * (Tyler, 8 Nov 2026: "redesign the block ui", drawn on the Plans block, then
 * of the CRM's blocks: "segment and stages blocks are not changed ... other
 * blocks too. Only the dashboard ones are the new ui").
 *
 * - **A row:** one line, no line between rows. The name, then an optional
 *   coloured dot and a muted line, then the figure in the lightest grey pill
 *   with a grey number. Long names and lines are cut short so the pill
 *   always shows.
 * - **A list that picks** (each row says whether it is `picked`, as the
 *   CRM's Stages and Segments do): the Dashboards block's look. Names grey,
 *   dark while pointed at and while picked, at one weight so a name never
 *   jumps, and the small bar that grows in before the picked one (`SlideBar`).
 *   No row is shaded.
 * - **A row's ⋯** (`menu`), shown while the row is pointed at, in the place
 *   of its pill.
 */

export type SideRow = {
  key: string
  /** The row's name; a member's name is a `MemberName`. */
  name: React.ReactNode
  /** Muted, after the name on the same line. */
  line?: string
  /** A small dot before the line, saying the row's state by colour (a Tailwind `bg-…` class). */
  dot?: string
  /** The row's one figure, in a pill on the right. */
  value?: string
  /** Pressing the row, when it opens something. */
  onPress?: () => void
  /** Given on a list that picks: whether this row is the one showing. */
  picked?: boolean
  /** The row's own ⋯, in the place of its pill while the row is pointed at. */
  menu?: React.ReactNode
}

/**
 * The bar before a picked name: on every row, with no width until its row is
 * picked; then its width and the gap after it grow, sliding the name over
 * (Tyler, 8 Nov 2026: "animation is not smooth. Follow this", 220ms on
 * cubic-bezier(0.2, 0.8, 0.2, 1)). `flex: none`, so it never shrinks.
 */
export function SlideBar({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      data-dashboards-bar=""
      className={cn(
        "h-1.5 flex-none rounded-full bg-foreground transition-[width,margin-right] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
        on ? "mr-2 w-3" : "mr-0 w-0"
      )}
    />
  )
}

/** Five rows, then "Show all 12", as every list in the design. */
const ROWS_SHOWN = 5

const ROW_CLASS =
  "grid min-h-9 w-full min-w-0 grid-cols-[auto_minmax(0.375rem,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm"

export function SideRows({
  rows,
  empty,
  after,
  showAll = false,
}: {
  rows: SideRow[]
  empty: string
  /** Under the rows: a "New announcement" button and the like. */
  after?: React.ReactNode
  /**
   * Every row, never "Show all": for a short fixed list, such as the Leads
   * card's six rows, where hiding one behind a button only hides a stage.
   */
  showAll?: boolean
}) {
  const [all, setAll] = React.useState(showAll)
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN)
  const picks = rows.some((row) => row.picked !== undefined)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5 p-1.5">
      {rows.length === 0 && empty ? <p className="px-2.5 py-1.5 text-sm text-muted-foreground">{empty}</p> : null}
      {shown.map((row) => {
        const inner = (
          <>
            <span
              data-row-name=""
              className={cn(
                "flex min-w-0 items-center",
                picks && cn("font-medium transition-colors", row.picked ? "text-foreground" : "text-muted-foreground")
              )}
            >
              {picks ? <SlideBar on={Boolean(row.picked)} /> : null}
              <span className="min-w-0 truncate">{row.name}</span>
            </span>
            {/* Takes what the name leaves: in a narrow panel the line gives
                way first, down to its dot, and only then the name. A grid,
                because a flex row shaved a fraction of a pixel off the name
                too, which was enough to cut "Free" to "Fr…". */}
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-muted-foreground">
              {row.dot ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", row.dot)} /> : null}
              {row.line ? <span className="truncate">{row.line}</span> : null}
            </span>
            {row.value !== undefined ? (
              <span
                className={cn(
                  // Every block's figures alike (Tyler, 8 Nov 2026: "change
                  // the amount color to lightest gray bg and the number dark
                  // gray", then "its for all blocks").
                  "shrink-0 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums",
                  // Gives way to the row's ⋯ while the row is pointed at.
                  row.menu &&
                    "group-hover/row:invisible group-focus-within/row:invisible [@media(hover:none)]:invisible"
                )}
              >
                {row.value}
              </span>
            ) : (
              <span />
            )}
          </>
        )
        const body = row.onPress ? (
          <button
            type="button"
            onClick={row.onPress}
            // A press is the row's, not the page editor's around the block:
            // left to the editor, it selected the whole block and took the
            // focus. The capture runs before the editor's own listener,
            // which skips an event already prevented. Keyboard focus is
            // untouched.
            onMouseDownCapture={(event) => event.preventDefault()}
            aria-current={row.picked ? "true" : undefined}
            className={cn(
              ROW_CLASS,
              picks ? "hover:[&>[data-row-name]]:text-foreground" : "hover:bg-muted/60",
              focusRingInset
            )}
          >
            {inner}
          </button>
        ) : (
          <div className={ROW_CLASS}>{inner}</div>
        )
        return row.menu ? (
          <div key={row.key} className="group/row relative flex min-w-0 items-center">
            {body}
            <span className="absolute right-1.5 flex opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:opacity-100">
              {row.menu}
            </span>
          </div>
        ) : (
          <React.Fragment key={row.key}>{body}</React.Fragment>
        )
      })}
      {!showAll && rows.length > ROWS_SHOWN ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("justify-self-start", focusRingInset)}
          onClick={() => setAll(!all)}
        >
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      ) : null}
      {after}
    </div>
  )
}
