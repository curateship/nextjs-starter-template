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
import { ErrorBanner } from "@/components/ui/error-banner"
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
import { focusRing } from "@/lib/focus-ring"
import { cn } from "@/lib/utils"

const defaultPageSizeOptions = [10, 25, 50]

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
      type: "loadMore"
      count: number
      hasMore: boolean
      loading?: boolean
      onLoadMore?: () => void
      label?: string
      actionLabel?: string
    }
  | {
      type: "summary"
      count: number
      label?: string
    }

type DashboardTableBaseProps = {
  title: string
  icon?: React.ReactNode
  count: number
  controls?: React.ReactNode
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
}

type DashboardTableProps = DashboardTableBaseProps & (
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
    error,
    selectedCount = 0,
    onClearSelection,
    selectAll,
    footer,
    countsPending = false,
  } = props

  return (
    <TableSurface>
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

      {error ? (
        <ErrorBanner message={error.message} onRetry={error.onRetry} />
      ) : null}

      {"content" in props ? (
        <div>{props.content}</div>
      ) : (
        <ScrollArea className="w-full">
          <Table>
            {props.header}
            <TableBody>
              {props.isEmpty ? (
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
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      <DashboardTableFooter footer={footer} countsPending={countsPending} />
    </TableSurface>
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

  if (footer.type === "loadMore") {
    const pageSize = footer.count || defaultPageSizeOptions[0]

    return (
      <DashboardTablePaginationFooter
        pageSize={pageSize}
        pageSizeOptions={[pageSize]}
        rangeText={`${footer.count ? `1-${footer.count.toLocaleString()}` : "0"} of ${footer.count.toLocaleString()}${footer.hasMore ? "+" : ""}`}
        firstDisabled
        previousDisabled
        nextDisabled={!footer.hasMore || Boolean(footer.loading)}
        lastDisabled
        onNext={footer.onLoadMore}
        nextIcon={undefined}
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
    <div className="flex items-center bg-muted/50 p-4 text-sm text-muted-foreground">
      {countsPending ? "—" : `${footer.count.toLocaleString()} ${label}`}
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
  nextIcon,
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
  nextIcon?: React.ReactNode
}) {
  // A single option is not a choice. Surfaces with a fixed page size (the media
  // picker, the load-more footer) showed a dropdown that could only reopen on
  // the value it already had, so they get the range on its own.
  const canChangePageSize = pageSizeOptions.length > 1

  return (
    <div className="flex flex-col justify-between gap-3 bg-muted/50 p-4 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        {canChangePageSize ? (
          <>
            <span className="hidden sm:inline">Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange?.(Number(value))}
              disabled={!onPageSizeChange}
            >
              <DashboardToolbarSelectTrigger>
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
        <PageButton label="Go to first page" disabled={firstDisabled} onClick={onFirst}>
          <ChevronsLeftIcon className="size-4" />
        </PageButton>
        <PageButton label="Go to previous page" disabled={previousDisabled} onClick={onPrevious}>
          <ChevronLeftIcon className="size-4" />
        </PageButton>
        <PageButton label="Go to next page" disabled={nextDisabled} onClick={onNext}>
          {nextIcon ?? <ChevronRightIcon className="size-4" />}
        </PageButton>
        <PageButton label="Go to last page" disabled={lastDisabled} onClick={onLast}>
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
