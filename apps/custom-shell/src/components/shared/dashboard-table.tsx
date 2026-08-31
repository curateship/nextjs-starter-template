import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DashboardToolbar,
  DashboardToolbarControls,
  DashboardToolbarSelectTrigger,
  DashboardToolbarTitle,
} from "@/components/shared/dashboard-toolbar"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableSurface,
} from "@/components/ui/table"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The same four choices Settings offers, so a table that forgets to pass its
 * own list still shows the number actually in use.
 */
const defaultPageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

type DashboardTableError = {
  message: string
  onRetry?: () => void
}

type DashboardTableFooter =
  | {
      type: "pagination"
      page: number
      pageSize: number
      total: number
      totalPages: number
      onPageChange: (page: number) => void
      onPageSizeChange?: (pageSize: number) => void
      pageSizeOptions?: number[]
    }
  | {
      type: "summary"
      count: number
      label?: string
      /**
       * Something to do about the count — typically a link to the full list
       * when this one is trimmed, so the rest is one click away rather than a
       * sentence telling you to go and find it.
       */
      action?: React.ReactNode
    }

type DashboardTableBaseProps = {
  title: string
  icon?: React.ReactNode
  count: number
  controls?: React.ReactNode
  /**
   * A strip under the toolbar for the filters currently on — one removable chip
   * each, and a way to clear them. Inside the surface on purpose: the filters
   * belong to this table, and a row of chips floating above the card reads as
   * page furniture that happens to sit nearby.
   */
  filters?: React.ReactNode
  error?: DashboardTableError | null
  selectedCount?: number
  onClearSelection?: () => void
  /**
   * Lets the toolbar chip offer the rest of the matches, so the selection is
   * reported in one place instead of a second strip under the table. `total`
   * is every row the current search and filters match, not just the page on
   * screen; the offer hides itself once they are all selected.
   */
  selectAll?: {
    total: number
    onSelectAll: () => void
  }
  footer: DashboardTableFooter
  /**
   * The first load has not answered yet, so `count` and the footer totals are
   * not known. Both show an em-dash instead of a 0 that is about to be wrong.
   * Pass this only for the first load — a refetch already has real numbers on
   * screen and must not blank them out.
   */
  countsPending?: boolean
  /**
   * A search or filter is being fetched while the previous rows are still on
   * screen. They dim so a slow round trip reads as working rather than
   * broken, and settle the moment the new rows land. Not for the first load,
   * which has no rows to dim.
   */
  busy?: boolean
  /**
   * Extra classes for the table's surface. Mainly `shrink-0`: a page that
   * stacks several blocks is a flex column, and a table left to shrink loses
   * its last rows off the bottom instead of scrolling.
   */
  className?: string
  /**
   * Take whatever height the column has left and scroll the rows inside it,
   * rather than growing to fit them and pushing the page down. The toolbar and
   * the footer stay put, and the column headings stick to the top of the rows
   * — a heading that scrolled away would leave unlabelled columns.
   *
   * The column has to be a flex one that is itself bounded, or there is no
   * leftover height to take and this does nothing. Only for a table sharing a
   * screen meant to fit; a page whose whole job is one table should keep
   * scrolling with the page.
   */
  fillHeight?: boolean
}

type DashboardTableProps = DashboardTableBaseProps &
  (
    | {
        header: React.ReactNode
        children: React.ReactNode
        isEmpty: boolean
        emptyText: string
        emptyColSpan: number
        content?: never
      }
    | {
        content: React.ReactNode
        header?: never
        children?: never
        isEmpty?: never
        emptyText?: never
        emptyColSpan?: never
      }
  )

export function DashboardTable(props: DashboardTableProps) {
  const {
    title,
    icon,
    count,
    controls,
    filters,
    error,
    selectedCount = 0,
    onClearSelection,
    selectAll,
    footer,
    countsPending = false,
    busy = false,
    className,
    fillHeight = false,
  } = props

  const busyClassName = cn(
    "transition-opacity duration-150",
    busy && "opacity-50"
  )

  return (
    <TableSurface
      // `h-full` to take the height the column hands down, `min-h-0` so it can
      // pass a smaller one on. Where it stops shrinking is set on the rows
      // themselves, further in.
      className={cn(fillHeight && "flex h-full min-h-0 flex-col", className)}
    >
      <DashboardToolbar>
        <DashboardToolbarTitle>
          {icon ? (
            <span className="flex size-7 shrink-0 items-center justify-center sm:size-8 [&_svg]:size-4">
              {icon}
            </span>
          ) : null}
          <span className="text-sm font-medium sm:text-base">{title}</span>
          <Badge variant="secondary">
            {countsPending ? "—" : count.toLocaleString()}
          </Badge>
          {selectedCount && onClearSelection ? (
            <ToolbarChipButton onClick={onClearSelection}>
              Clear {selectedCount.toLocaleString()} selected
            </ToolbarChipButton>
          ) : null}
          {selectedCount && selectAll && selectAll.total > selectedCount ? (
            <ToolbarChipButton onClick={selectAll.onSelectAll}>
              Select all {selectAll.total.toLocaleString()}
            </ToolbarChipButton>
          ) : null}
        </DashboardToolbarTitle>

        {controls ? (
          <DashboardToolbarControls>{controls}</DashboardToolbarControls>
        ) : null}
      </DashboardToolbar>

      {filters ? (
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          {filters}
        </div>
      ) : null}

      {"content" in props ? (
        error ? (
          <ErrorRow message={error.message} onRetry={error.onRetry} />
        ) : (
          <div aria-busy={busy || undefined} className={busyClassName}>
            {props.content}
          </div>
        )
      ) : (
        <TableRows fill={fillHeight}>
          <Table
            containerClassName={cn(
              fillHeight &&
                // The `ScrollArea` around it is the only scrolling box now, so
                // this one stops being one. Two nested scrollers would fight,
                // and the inner one would be what a sticky heading sticks to —
                // which here is the wrong one.
                //
                // The headings ride along at the top of the rows. They need an
                // opaque fill of their own — the row's `bg-muted/50` is
                // see-through, so rows would slide up behind the words. Their
                // top and bottom hairlines come from `theme.css`, which draws
                // them as inset shadows for exactly this reason.
                "overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-muted"
            )}
          >
            {props.header}
            <TableBody aria-busy={busy || undefined} className={busyClassName}>
              {error ? (
                <TableRow>
                  <TableCell colSpan={props.emptyColSpan} className="p-0">
                    <ErrorRow message={error.message} onRetry={error.onRetry} />
                  </TableCell>
                </TableRow>
              ) : props.isEmpty ? (
                <TableRow>
                  <TableCell
                    colSpan={props.emptyColSpan}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    {props.emptyText}
                  </TableCell>
                </TableRow>
              ) : (
                props.children
              )}
            </TableBody>
          </Table>
        </TableRows>
      )}

      <DashboardTableFooter footer={footer} countsPending={countsPending} />
    </TableSurface>
  )
}

/**
 * The rows, either in the app's own scroll frame (the usual case, where the
 * table is as tall as its rows) or bare, when it is filling a column and the
 * table's own box does the scrolling.
 */
function TableRows({
  fill,
  children,
}: {
  fill: boolean
  children: React.ReactNode
}) {
  return (
    <ScrollArea
      className={cn("w-full", fill && "min-h-0 flex-1")}
      // The height goes on the viewport, never the frame — see `ScrollArea`.
      // `min-h-24` is where it stops giving height back: squeezed under about
      // two rows this is a heading and a total with a sliver between them, and
      // the page is better off scrolling.
      viewportClassName={cn(fill && "h-full min-h-24")}
    >
      {children}
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

// The toolbar's selection chips read as quiet text, not buttons, so they sit
// beside the count without competing with the toolbar's real controls.
function ToolbarChipButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground",
        focusRing
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// The one pagination control. Exported so non-table surfaces (the media
// picker) page with the same footer instead of hand-rolling buttons.
export function DashboardTablePagination({
  page,
  pageSize,
  total,
  totalPages: totalPagesInput,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  countsPending = false,
}: {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  /** The total is not known yet — show a dash, not "0 of 0". */
  countsPending?: boolean
}) {
  const options = pageSizeOptions ?? defaultPageSizeOptions
  const totalPages = totalPagesInput || 1
  const currentPage = Math.max(1, Math.min(page, totalPages))
  const firstRow = total ? (currentPage - 1) * pageSize + 1 : 0
  const lastRow = Math.min(currentPage * pageSize, total)

  return (
    <DashboardTablePaginationFooter
      pageSize={pageSize}
      pageSizeOptions={options}
      rangeText={
        countsPending
          ? "—"
          : `${firstRow ? `${firstRow.toLocaleString()}-${lastRow.toLocaleString()}` : "0"} of ${total.toLocaleString()}`
      }
      onPageSizeChange={onPageSizeChange}
      firstDisabled={countsPending || currentPage === 1}
      previousDisabled={countsPending || currentPage === 1}
      nextDisabled={countsPending || currentPage === totalPages || total === 0}
      lastDisabled={countsPending || currentPage === totalPages || total === 0}
      onFirst={() => onPageChange(1)}
      onPrevious={() => onPageChange(currentPage - 1)}
      onNext={() => onPageChange(currentPage + 1)}
      onLast={() => onPageChange(totalPages)}
    />
  )
}

function DashboardTableFooter({
  footer,
  countsPending = false,
}: {
  footer: DashboardTableFooter
  countsPending?: boolean
}) {
  if (footer.type === "pagination") {
    return (
      <DashboardTablePagination
        page={footer.page}
        pageSize={footer.pageSize}
        total={footer.total}
        totalPages={footer.totalPages}
        onPageChange={footer.onPageChange}
        onPageSizeChange={footer.onPageSizeChange}
        pageSizeOptions={footer.pageSizeOptions}
        countsPending={countsPending}
      />
    )
  }

  // A summary footer counts rows; it has no pages. Rendering the pagination
  // control here showed a dead "Rows per page" select set to the row count.
  // Call sites pass the plural ("workspaces"), so drop the "s" for a single row.
  const plural = footer.label ?? "items"
  const label =
    footer.count === 1 && plural.endsWith("s") ? plural.slice(0, -1) : plural

  return (
    <div
      data-slot="table-footer"
      className="flex items-center gap-3 bg-muted/50 p-4 text-sm text-muted-foreground"
    >
      <span className="min-w-0 flex-1">
        {countsPending ? "—" : `${footer.count.toLocaleString()} ${label}`}
      </span>
      {footer.action}
    </div>
  )
}

function DashboardTablePaginationFooter({
  pageSize,
  pageSizeOptions,
  rangeText,
  onPageSizeChange,
  firstDisabled,
  previousDisabled,
  nextDisabled,
  lastDisabled,
  onFirst,
  onPrevious,
  onNext,
  onLast,
}: {
  pageSize: number
  pageSizeOptions: number[]
  rangeText: string
  onPageSizeChange?: (pageSize: number) => void
  firstDisabled: boolean
  previousDisabled: boolean
  nextDisabled: boolean
  lastDisabled: boolean
  onFirst?: () => void
  onPrevious?: () => void
  onNext?: () => void
  onLast?: () => void
}) {
  // A single option is not a choice. The media picker has a fixed page size,
  // so it gets the range on its own instead of a dropdown that can only reopen
  // on the value it already had.
  const canChangePageSize = pageSizeOptions.length > 1
  const pageSizeId = React.useId()

  return (
    <div
      data-slot="table-footer"
      className="flex flex-col justify-between gap-3 bg-muted/50 p-4 sm:flex-row"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        {canChangePageSize ? (
          <>
            <label htmlFor={pageSizeId} className="sr-only sm:not-sr-only">
              Rows per page:
            </label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange?.(Number(value))}
              disabled={!onPageSizeChange}
            >
              <DashboardToolbarSelectTrigger id={pageSizeId}>
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}
        <span>{rangeText}</span>
      </div>

      <div className="flex items-center gap-1">
        <PageButton
          label="Go to first page"
          disabled={firstDisabled}
          onClick={onFirst}
        >
          <ChevronsLeftIcon className="size-4" />
        </PageButton>
        <PageButton
          label="Go to previous page"
          disabled={previousDisabled}
          onClick={onPrevious}
        >
          <ChevronLeftIcon className="size-4" />
        </PageButton>
        <PageButton
          label="Go to next page"
          disabled={nextDisabled}
          onClick={onNext}
        >
          <ChevronRightIcon className="size-4" />
        </PageButton>
        <PageButton
          label="Go to last page"
          disabled={lastDisabled}
          onClick={onLast}
        >
          <ChevronsRightIcon className="size-4" />
        </PageButton>
      </div>
    </div>
  )
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-8"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </Button>
  )
}
