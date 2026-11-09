import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

/**
 * Where a widget's own buttons go: the card's heading, beside its ⋮ (Tyler,
 * 8 Nov 2026, pointing at a widget's Filter and its date range: "move the
 * buttons here"). Undefined outside a widget card.
 */
const WidgetActionsContext = React.createContext<HTMLElement | null | undefined>(undefined)

/**
 * Puts a widget's buttons (a Filter, a period picker) in its card's heading,
 * before the ⋮. Outside a widget card it draws them where it is, so the same
 * widget can sit on a page of its own.
 */
export function WidgetHeadingActions({ children }: { children: React.ReactNode }) {
  const target = React.useContext(WidgetActionsContext)
  if (target === undefined) return <>{children}</>
  if (!target) return null
  return createPortal(children, target)
}

/**
 * One Overview widget (Tyler, 8 Nov 2026: "Widget is almost like blocks but
 * with some small differences. One, it will have a different ui styling (we
 * use the same styling as currant block but seprate them)").
 *
 * It starts as a copy of the page blocks' card (`BlockCard` in
 * `shared/notes/block-card.tsx`): one light grey box, a heading band with the
 * icon, title and count, and what it shows on a white tile 3px inside it. It
 * is its own component so a widget's look can change without touching
 * blocks. Unlike a block it has no fold. Its ⋮ swaps it for another widget
 * or removes it (`WidgetMenu`), and it fills the spot it is in, its list
 * scrolling inside the tile. A widget's own buttons sit in the heading before
 * the ⋮, put there with `WidgetHeadingActions`.
 */
export function WidgetCard({
  title,
  icon,
  count,
  menu,
  children,
  className,
}: {
  title: string
  icon: React.ReactNode
  /** On a white patch after the title. */
  count?: number
  /** The widget's ⋮, at the heading's right end. */
  menu?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const [actions, setActions] = React.useState<HTMLSpanElement | null>(null)
  return (
    <section
      aria-label={title}
      data-widget=""
      // Corners and grey from Settings → Styling → Widgets, their own since
      // widgets sit on the shaded page, not in a panel (Tyler, 8 Nov 2026).
      // The fallbacks are the blocks' look, which widgets started with.
      className={cn(
        "group/widget flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--shell-widget-radius,1rem)] [background:color-mix(in_oklab,var(--muted)_var(--shell-widget-shade,50%),var(--card))]",
        className
      )}
    >
      {/* As tall as a panel's header, as a block's heading is. When the
          widget's buttons do not fit beside its name, they and the ⋮ go to a
          second line under it, rather than squeezing the name away. */}
      <div className="flex min-h-[var(--dashboard-card-header-height,57px)] shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 py-2.5 pr-2.5 pl-4">
        <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="min-w-0 truncate text-base leading-tight font-semibold text-foreground/75">{title}</h2>
        {count !== undefined ? (
          <span className="shrink-0 rounded-md bg-card px-1.5 py-0.5 text-xs tabular-nums">{count.toLocaleString()}</span>
        ) : null}
        {/* The widget's own buttons, then its ⋮, at the heading's right end. */}
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
          <span ref={setActions} className="flex min-w-0 items-center gap-1.5 empty:hidden" />
          {menu}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-[var(--shell-widget-inset,3px)] pb-[var(--shell-widget-inset,3px)]">
        <WidgetActionsContext.Provider value={actions}>
        {/* A table's heading row is white on the tile, and its line the
            Divider lines colour alone, as in a block's tile. */}
        <div
          data-widget-tile=""
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[calc(var(--shell-widget-radius,1rem)-var(--shell-widget-inset,3px))] bg-card text-sm [&_thead_th]:!bg-card [&_thead_th]:![--shell-table-band:transparent] [&_[data-slot=table-footer]]:![--shell-table-band:transparent]"
        >
          {children}
        </div>
        </WidgetActionsContext.Provider>
      </div>
    </section>
  )
}
