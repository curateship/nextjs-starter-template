import * as React from "react"
import { CheckIcon, EllipsisVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
import {
  BOTTOM_ROW_COLUMNS,
  placeWidget,
  setRowColumns,
  TOP_ROW_COLUMNS,
  widgetChoices,
  type WidgetLayout,
  type WidgetRowName,
} from "@/lib/admin-dashboard/overview-widgets"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/** The value a spot's list uses for Empty; never a widget id, which has no spaces. */
const EMPTY = "empty spot"

const ROW_TITLES: Record<WidgetRowName, string> = { top: "Top row", bottom: "Bottom row" }

function columnsLabel(columns: number) {
  if (columns === 0) return "None"
  return columns === 1 ? "1 column" : `${columns} columns`
}

/** Every widget on the dashboard now, for marking the ones a pick would move. */
function placedIds(layout: WidgetLayout) {
  return new Set([...layout.top.spots, ...layout.bottom.spots].filter((id): id is string => id !== null))
}

/**
 * The Widgets tab of the Admin ⋮, after Plans (Tyler, 8 Nov 2026: "Move the
 * widgets into the right panel dropdown beside plans"). It sets each row's
 * columns, then which widget sits in each spot. Every pick saves on its own,
 * with no Save button, as every tabbed menu in the design.
 */
export function WidgetSettings({
  layout,
  error,
  onRetry,
  onChange,
}: {
  /** Null while it is read, or when the read failed. */
  layout: WidgetLayout | null
  error: string | null
  onRetry: () => void
  onChange: (layout: WidgetLayout) => void
}) {
  if (!layout) {
    return error ? (
      <ErrorRow message={error} onRetry={onRetry} className="py-4" />
    ) : (
      <p className="p-3 text-sm text-muted-foreground">Reading…</p>
    )
  }
  const choices = widgetChoices()
  const labelOf = (id: string | null) => choices.find((choice) => choice.id === id)?.label
  const spotOptions = [
    { value: EMPTY, label: "Empty" },
    ...choices.map((choice) => ({ value: choice.id, label: choice.label })),
  ]
  const rows: WidgetRowName[] = layout.bottom.columns > 0 ? ["top", "bottom"] : ["top"]
  return (
    <div className="grid gap-3 p-3">
      <PickGroup title="Rows">
        <PickMenuRow
          label="Top row"
          value={columnsLabel(layout.top.columns)}
          options={TOP_ROW_COLUMNS.map((columns) => ({ value: String(columns), label: columnsLabel(columns) }))}
          selected={String(layout.top.columns)}
          onPick={(value) => onChange(setRowColumns(layout, "top", Number(value)))}
        />
        <PickMenuRow
          label="Bottom row"
          value={columnsLabel(layout.bottom.columns)}
          empty={layout.bottom.columns === 0}
          options={BOTTOM_ROW_COLUMNS.map((columns) => ({ value: String(columns), label: columnsLabel(columns) }))}
          selected={String(layout.bottom.columns)}
          onPick={(value) => onChange(setRowColumns(layout, "bottom", Number(value)))}
        />
      </PickGroup>
      {rows.map((name) => (
        <PickGroup key={name} title={ROW_TITLES[name]}>
          {layout[name].spots.map((id, index) => (
            <PickMenuRow
              key={index}
              label={`Spot ${index + 1}`}
              value={labelOf(id) ?? "Empty"}
              empty={!id}
              options={spotOptions}
              selected={id ?? EMPTY}
              onPick={(value) => onChange(placeWidget(layout, name, index, value === EMPTY ? null : value))}
            />
          ))}
        </PickGroup>
      ))}
    </div>
  )
}

/** Where a widget sits: its row and its spot in the row. */
export type Spot = { row: WidgetRowName; index: number }

/**
 * A widget's ⋮, in the place of its range line (Tyler, 8 Nov 2026: "Remove
 * the label and add a 3 vertical dots dropdown here to replace a widget"):
 * every widget to swap in, this one ticked, then Remove widget under a line,
 * which leaves the spot empty. Shown while the widget's heading is pointed
 * at, as a block's ⋮ is, and always on a phone.
 */
export function WidgetMenu({
  title,
  layout,
  spot,
  onChange,
}: {
  title: string
  layout: WidgetLayout
  spot: Spot
  onChange: (layout: WidgetLayout) => void
}) {
  const current = layout[spot.row].spots[spot.index]
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`More for ${title}`}
          className="ml-auto shrink-0 text-muted-foreground opacity-0 group-hover/widget:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={16} className="max-h-[min(60vh,24rem)] w-max min-w-60">
        <WidgetChoices layout={layout} current={current} onPick={(id) => onChange(placeWidget(layout, spot.row, spot.index, id))} />
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onChange(placeWidget(layout, spot.row, spot.index, null))}>
          <Trash2Icon className="size-4" />
          Remove widget
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * An empty spot, pressed to put a widget right there (Tyler, 8 Nov 2026:
 * "This part should be clickable to add a widget right there").
 */
export function EmptySpot({
  layout,
  spot,
  onChange,
}: {
  layout: WidgetLayout
  spot: Spot
  onChange: (layout: WidgetLayout) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "grid min-h-32 place-items-center rounded-[var(--shell-widget-radius,1rem)] border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            open && "bg-muted/40 text-foreground",
            focusRingInset
          )}
        >
          <span className="flex items-center gap-2">
            <PlusIcon className="size-4" />
            Add a widget
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" collisionPadding={16} className="max-h-[min(60vh,24rem)] w-max min-w-60">
        <WidgetChoices layout={layout} current={null} onPick={(id) => onChange(placeWidget(layout, spot.row, spot.index, id))} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Every widget there is. The one in this spot is ticked; one already shown
 * elsewhere says so, and picking it moves it here.
 */
function WidgetChoices({
  layout,
  current,
  onPick,
}: {
  layout: WidgetLayout
  current: string | null
  onPick: (id: string) => void
}) {
  const placed = placedIds(layout)
  return (
    <>
      {widgetChoices().map((choice) => {
        const Icon = choice.icon
        return (
          // One line a row: the menu is as wide as its longest name and
          // note (Tyler, 8 Nov 2026: "fix the spacing issue", where names
          // and "Moves here" wrapped).
          <DropdownMenuItem
            key={choice.id}
            className="whitespace-nowrap"
            onSelect={() => choice.id !== current && onPick(choice.id)}
          >
            <Icon className="size-4" />
            {choice.label}
            {choice.id === current ? (
              <CheckIcon className="ml-auto size-4" aria-label="Picked" />
            ) : placed.has(choice.id) ? (
              <span className="ml-auto shrink-0 pl-4 text-xs text-muted-foreground">Moves here</span>
            ) : null}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
