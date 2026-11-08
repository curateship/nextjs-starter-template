import * as React from "react"

import { Button } from "@/components/ui/button"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * Pieces every Admin section draws with: a member's name that opens them in
 * Users, and the narrow rows the blocks and widgets use.
 */

const OpenPerson = React.createContext<(userId: string) => void>(() => undefined)

export const OpenPersonProvider = OpenPerson.Provider

/**
 * A member's name. Pressed, the Users tab opens with them on the right
 * (Tyler, 8 Nov 2026: "clicking the user should open its user data on the
 * right panel"). A deleted account has nobody to open, so its name is plain
 * muted text.
 */
export function MemberName({
  userId,
  name,
  className,
}: {
  userId: string | null
  name: string
  className?: string
}) {
  const open = React.useContext(OpenPerson)
  if (!userId) {
    return <span className={cn("block truncate font-medium text-muted-foreground", className)}>{name}</span>
  }
  return (
    <button
      type="button"
      onClick={() => open(userId)}
      className={cn(
        "block max-w-full truncate rounded-sm text-left font-medium hover:underline",
        focusRing,
        className
      )}
    >
      {name}
    </button>
  )
}

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
  /** The row showing now, such as the section the middle holds. */
  picked?: boolean
}

/** Five rows, then "Show all 12", as every list in the design. */
const ROWS_SHOWN = 5

/**
 * The list every Admin block and widget draws (Tyler, 8 Nov 2026: "redesign
 * the block ui", drawn on the Plans block): one line a row, with no line
 * between rows. The name, then an optional coloured dot and a muted line,
 * then the figure in the lightest grey pill at the right, its number grey. Long names and lines are cut
 * short so the pill always shows.
 */
export function SideRows({
  rows,
  empty,
  after,
  nav = false,
}: {
  rows: SideRow[]
  empty: string
  /** Under the rows: a "New announcement" button and the like. */
  after?: React.ReactNode
  /**
   * A list that moves between places, as the Dashboards block does (Tyler,
   * 8 Nov 2026, drawn on it): the names grey, the picked one dark with a
   * small bar that grows in before it, and no row shaded.
   */
  nav?: boolean
}) {
  const [all, setAll] = React.useState(false)
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5 p-1.5">
      {rows.length === 0 && empty ? <p className="px-2.5 py-1.5 text-sm text-muted-foreground">{empty}</p> : null}
      {shown.map((row) => {
        const inner = (
          <>
            <span
              className={cn(
                "flex min-w-0 items-center",
                // The weight stays put and only the colour changes, so the
                // name never jumps a pixel as the bar grows.
                nav && cn("font-medium transition-colors", row.picked ? "text-foreground" : "text-muted-foreground")
              )}
            >
              {nav ? (
                // On every row, with no width until its row is picked: then
                // its width and the gap after it grow, sliding the name over
                // (Tyler, 8 Nov 2026: "animation is not smooth. Follow
                // this", 220ms on cubic-bezier(0.2, 0.8, 0.2, 1), the same
                // 220ms the Dashboards block waits before switching). `flex:
                // none`, so the bar never shrinks.
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 flex-none rounded-full bg-foreground transition-[width,margin-right] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
                    row.picked ? "mr-2 w-3" : "mr-0 w-0"
                  )}
                />
              ) : null}
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
                  "shrink-0 rounded-full px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums",
                  // A shaded picked row is grey itself, so its pill turns white to show.
                  row.picked && !nav ? "bg-background" : "bg-muted/50"
                )}
              >
                {row.value}
              </span>
            ) : null}
          </>
        )
        const rowClass =
          "grid min-h-9 min-w-0 grid-cols-[auto_minmax(0.375rem,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm"
        return row.onPress ? (
          <button
            key={row.key}
            type="button"
            onClick={row.onPress}
            // A press is the row's, not the page editor's around the block:
            // left to the editor, it selected the whole block and took the
            // focus, redrawing the page in the middle of the Dashboards
            // bar's slide. The capture runs before the editor's own
            // listener, which skips an event already prevented. Keyboard
            // focus is untouched.
            onMouseDownCapture={(event) => event.preventDefault()}
            aria-current={row.picked ? "true" : undefined}
            className={cn(
              rowClass,
              nav
                ? "hover:[&>span:first-child]:text-foreground"
                : cn("hover:bg-muted/60", row.picked && "bg-muted font-medium hover:bg-muted"),
              focusRingInset
            )}
          >
            {inner}
          </button>
        ) : (
          <div key={row.key} className={rowClass}>
            {inner}
          </div>
        )
      })}
      {rows.length > ROWS_SHOWN ? (
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
