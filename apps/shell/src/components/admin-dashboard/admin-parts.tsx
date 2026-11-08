import * as React from "react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing, focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * Pieces every Admin tab draws with: a member's name that opens them in the
 * Users tab, the middle body, and the narrow rows the side panels' blocks use.
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

/**
 * The middle panel's body under its one header. Edge to edge: what it holds
 * sits straight on the panel, its lines running to the panel's edges (Tyler,
 * 8 Nov 2026: "Middle panel analytic card should be edge to edge design").
 */
export function MiddleBody({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid grid-cols-[minmax(0,1fr)] divide-y border-b">{children}</div>
    </ScrollArea>
  )
}

export type SideRow = {
  key: string
  /** The row's name; a member's name is a `MemberName`. */
  name: React.ReactNode
  /** Muted, under the name. */
  line?: string
  /** The row's one figure, on the right. */
  value?: string
  /** Pressing the row, when it opens something. */
  onPress?: () => void
}

/** Five rows, then "Show all 12", as every list in the design. */
const ROWS_SHOWN = 5

/**
 * A narrow list for a block: the name with a muted line under it, the figure
 * on the right. A side panel opens at 16% of the screen, too narrow for a
 * table's columns, so each row carries one figure and the rest in its line.
 */
export function SideRows({
  rows,
  empty,
  after,
}: {
  rows: SideRow[]
  empty: string
  /** Under the rows: a "New plan" button and the like. */
  after?: React.ReactNode
}) {
  const [all, setAll] = React.useState(false)
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] divide-y">
      {rows.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{empty}</p> : null}
      {shown.map((row) => {
        const inner = (
          <>
            <span className="grid min-w-0">
              <span className="truncate">{row.name}</span>
              {row.line ? <span className="truncate text-xs text-muted-foreground">{row.line}</span> : null}
            </span>
            {row.value !== undefined ? <span className="text-sm tabular-nums">{row.value}</span> : null}
          </>
        )
        const rowClass = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-left text-sm"
        return row.onPress ? (
          <button
            key={row.key}
            type="button"
            onClick={row.onPress}
            className={cn(rowClass, "hover:bg-muted/60", focusRingInset)}
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
          className={cn("m-1.5 justify-self-start", focusRingInset)}
          onClick={() => setAll(!all)}
        >
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      ) : null}
      {after}
    </div>
  )
}
