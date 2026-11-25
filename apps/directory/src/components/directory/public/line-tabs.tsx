import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { useSlidingPill } from "@/lib/hooks/use-sliding-pill"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The underlined row over the Events list and the Deals grid: words with a
 * line under the one showing, on one long divider, and dropdowns drawn as
 * plain words with an arrow. Tyler drew both pages this way on 25 Nov 2026,
 * which is why these two public pages draw underlined tabs when every other
 * public screen draws pills (`.agents/skills/Ui-standards/SKILL.md`, Tabs).
 *
 * The tabs are links, because each one is an address that can be sent to
 * somebody. The line is one piece that slides to the tab showing, the same
 * as a dashboard's underlined tabs (Tyler, 20 Oct 2026: "line tab should use
 * the sliding animation too like pill").
 */

/**
 * The row: tabs at `start`, dropdowns in `menus`, and `end` at the far right,
 * on one divider.
 *
 * From a tablet up it is all one line. On a phone the tabs and `end` keep the
 * underlined line, and `menus` drop to a plain line under it, so nothing is
 * squeezed or cut off (Tyler, 25 Nov 2026: "make it mobile friendly"). The
 * Events page's List, Month and Map show their icons alone there for the same
 * reason. `menusAt` says which side the menus sit on from a tablet up: right
 * after the tabs on Events, at the far right on Deals.
 */
export function LineTabRow({
  start,
  menus,
  end,
  menusAt = "start",
}: {
  start?: React.ReactNode
  menus?: React.ReactNode
  end?: React.ReactNode
  menusAt?: "start" | "end"
}) {
  return (
    <div className="flex flex-wrap md:flex-nowrap">
      <div className="flex min-w-0 grow items-stretch gap-3 border-b sm:gap-6.5 md:grow-0">
        {start}
      </div>
      {end ? (
        <div className="flex shrink-0 items-stretch justify-end gap-4 border-b pl-3 sm:gap-6.5 md:order-last">
          {end}
        </div>
      ) : null}
      {menus ? (
        <div
          className={cn(
            // `pt-3` on a phone, so the line of menus stands clear of the divider
            // over it (Tyler, 25 Nov 2026: "needs more spacing here in mobile").
            "flex min-w-0 basis-full flex-wrap items-stretch gap-x-6.5 pt-3 md:basis-auto md:grow md:flex-nowrap md:border-b md:pt-0",
            // Clear of the tabs, and at the left edge when there are none.
            start ? "md:pl-6.5" : null,
            menusAt === "end" ? "md:justify-end" : null
          )}
        >
          {menus}
        </div>
      ) : null}
      {/* With no menus beside it, the divider still runs to the far end. */}
      {menus ? null : <div className="hidden grow border-b md:block" />}
    </div>
  )
}

/**
 * One set of tabs with its sliding line. The tab showing is the link with
 * `aria-current="page"`, and the line follows it.
 */
export function LineTabTrack({
  label,
  children,
}: {
  /** What the set chooses, read out: "Upcoming or past". */
  label: string
  children: React.ReactNode
}) {
  const { trackRef, trackProps, pillProps } = useSlidingPill<HTMLDivElement>({
    selected: '[data-slot="line-tab"][aria-current="page"]',
    observe: '[data-slot="line-tab"]',
    attributes: ["aria-current"],
    variant: "underline",
  })
  return (
    <div
      ref={trackRef}
      {...trackProps}
      role="group"
      aria-label={label}
      className="relative flex items-stretch gap-5 sm:gap-6.5"
    >
      <span {...pillProps} />
      {children}
    </div>
  )
}

/**
 * How a tab looks. Spread `lineTabProps(active)` onto the link, so it carries
 * the slot the line looks for and says which one is showing.
 */
export function lineTabProps(active: boolean) {
  return {
    "data-slot": "line-tab",
    "aria-current": active ? ("page" as const) : undefined,
    className: cn(
      "relative z-10 inline-flex h-12 items-center pb-2 gap-1.5 rounded-sm text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground",
      // Before the line is measured, the tab showing draws its own. See
      // `use-sliding-pill.ts`.
      "border-b-2 border-transparent in-data-[pill=pending]:aria-[current=page]:border-foreground",
      focusRing
    ),
  }
}

/**
 * The number after a tab's word, in a light grey chip (Tyler, 25 Nov 2026:
 * "add a light gray bg to the number amounts"), drawn like a dashboard tab's
 * count. The word and the number are read out together by the caller's own
 * hidden words, so this one is hidden from a screen reader.
 */
export function LineTabCount({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-xs leading-none font-medium text-muted-foreground tabular-nums"
    >
      {children}
    </span>
  )
}

/**
 * The short upright line between the tabs and the menus. Only from a tablet
 * up, because on a phone the menus are on a line of their own.
 */
export function LineTabDivider() {
  return (
    <span
      aria-hidden="true"
      className="mb-2 hidden h-4 w-px shrink-0 self-center bg-border md:block"
    />
  )
}

/**
 * A dropdown's button in the row: its word and an arrow that turns over while
 * it is open. Drawn in full contrast while it is narrowing the list, so a
 * visitor can see which ones are doing something without opening them.
 *
 * 32px tall, like every control, and 3px down from the row's top, which puts
 * its word on the tabs' line. A button the row's full height opened its menu
 * under the divider, a long way from the word (Tyler, 25 Nov 2026: "too much
 * gap").
 */
export const LineMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { on?: boolean }
>(function LineMenuTrigger({ on = false, className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "group mt-[3px] inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-sm text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground",
        on && "font-medium text-foreground",
        focusRing,
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon
        aria-hidden="true"
        className="size-4 transition-transform group-data-[state=open]:rotate-180"
      />
    </button>
  )
})
