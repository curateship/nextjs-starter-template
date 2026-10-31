import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * Mass select on a three-column dashboard's middle list (UI standard,
 * "Three-column dashboards"; Tyler, 19 Oct 2026: "the mass select function as
 * well"). Project's `TaskList` and `TaskBulkMenu` are where these started.
 *
 * `MassSelectChip` sits beside the first column's heading and shows while
 * that heading is pointed at (`group/title` on the heading cell); on a phone
 * it always shows. Pressed, the tick boxes appear and it reads "Hide select",
 * which hides them again. The caller clears the ticks when it turns off.
 */
export function MassSelectChip({
  on,
  onToggle,
}: {
  on: boolean
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      variant={on ? "secondary" : "outline"}
      size="xs"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "rounded-full",
        !on &&
          "opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      )}
    >
      {on ? "Hide select" : "Mass select"}
    </Button>
  )
}

export type SelectedMenuControls = {
  /** Steps into one of `pages`. */
  step: (page: string) => void
  /** Closes the menu, as a change does before it runs. */
  close: () => void
}

/**
 * The ticked rows as one "N selected" button in the middle header, left of
 * the search, with a 1px moving rainbow edge so the eye finds it; it holds
 * still for anyone whose device asks for less motion. Its menu holds the
 * screen's `main` rows (the most common change first, then rows that step
 * into one of `pages` with a back arrow), then Clear selection. Escape on a
 * page goes back; on the first page it closes.
 */
export function SelectedMenu({
  count,
  busy = false,
  main,
  pages,
  onClear,
}: {
  count: number
  busy?: boolean
  main: (menu: SelectedMenuControls) => React.ReactNode
  pages: Record<string, { title: string; content: (menu: SelectedMenuControls) => React.ReactNode }>
  onClear: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [page, setPage] = React.useState<string | null>(null)
  const content = React.useRef<HTMLDivElement>(null)
  const cameFrom = React.useRef<string | null>(null)

  // A page change takes away the row that had focus, so focus moves into the
  // new page: its back row, or on the way back the row it was opened from.
  React.useEffect(() => {
    const from = cameFrom.current
    cameFrom.current = page
    if (from === page) return
    const target =
      page === null
        ? content.current?.querySelector<HTMLElement>(`[data-page="${from}"]`)
        : content.current?.querySelector<HTMLElement>("button")
    target?.focus()
  }, [page])

  function openChange(next: boolean) {
    setOpen(next)
    if (!next) setPage(null)
  }
  const controls: SelectedMenuControls = {
    step: setPage,
    close: () => openChange(false),
  }
  const current = page === null ? null : pages[page]

  return (
    <Popover open={open} onOpenChange={openChange}>
      <span className="relative inline-flex shrink-0 overflow-hidden rounded-lg p-px">
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 animate-spin bg-[conic-gradient(#ef4444,#f97316,#eab308,#22c55e,#3b82f6,#8b5cf6,#ec4899,#ef4444)] [animation-duration:2.5s] motion-reduce:animate-none"
        />
        <PopoverTrigger asChild>
          <DashboardToolbarButton
            type="button"
            variant="outline"
            disabled={busy}
            // Inset, so the ring isn't cut off by the rainbow's edge.
            className="relative border-transparent bg-background hover:bg-muted focus-visible:ring-inset dark:bg-background"
          >
            {count.toLocaleString()} selected
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </DashboardToolbarButton>
        </PopoverTrigger>
      </span>
      <PopoverContent
        ref={content}
        align="end"
        className="w-60 gap-0 p-1"
        onEscapeKeyDown={(event) => {
          if (page === null) return
          event.preventDefault()
          setPage(null)
        }}
      >
        {current ? (
          <>
            <SelectedMenuRow onClick={() => setPage(null)} className="font-medium">
              <ChevronLeftIcon className="size-4 text-muted-foreground" />
              {current.title}
            </SelectedMenuRow>
            <SelectedMenuSeparator />
            {current.content(controls)}
          </>
        ) : (
          <>
            {main(controls)}
            <SelectedMenuSeparator />
            <SelectedMenuRow
              onClick={() => {
                openChange(false)
                onClear()
              }}
            >
              Clear selection
            </SelectedMenuRow>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** A line across the menu between groups of rows. */
export function SelectedMenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />
}

/** One line of the menu, drawn like the shell's dropdown items. */
export function SelectedMenuRow({
  page,
  className,
  children,
  onClick,
}: {
  /** The page it steps into, so it ends in an arrow and focus can come back to it. */
  page?: string
  className?: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-page={page}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        className
      )}
    >
      {children}
      {page ? <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" /> : null}
    </button>
  )
}
