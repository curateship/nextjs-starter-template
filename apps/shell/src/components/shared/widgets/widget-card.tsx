import * as React from "react"

import { cn } from "@/lib/utils"

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
 * scrolling inside the tile.
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
      {/* As tall as a panel's header, as a block's heading is. */}
      <div className="flex min-h-[var(--dashboard-card-header-height,57px)] shrink-0 items-center gap-2 py-2.5 pr-2.5 pl-4">
        <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="min-w-0 truncate text-base leading-tight font-semibold text-foreground/75">{title}</h2>
        {count !== undefined ? (
          <span className="shrink-0 rounded-md bg-card px-1.5 py-0.5 text-xs tabular-nums">{count.toLocaleString()}</span>
        ) : null}
        {menu}
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-[var(--shell-widget-inset,3px)] pb-[var(--shell-widget-inset,3px)]">
        <div
          data-widget-tile=""
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[calc(var(--shell-widget-radius,1rem)-var(--shell-widget-inset,3px))] bg-card text-sm [&_thead_th]:!bg-card"
        >
          {children}
        </div>
      </div>
    </section>
  )
}
