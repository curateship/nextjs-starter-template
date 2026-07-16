import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Loader2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DashboardToolbar,
  DashboardToolbarControls,
  DashboardToolbarSelectTrigger,
  DashboardToolbarTitle,
} from "@/components/dashboard-toolbar"
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
  TableStatusIndicator,
  TableSurface,
} from "@/components/ui/table"

const defaultPageSizeOptions = [10, 25, 50]

type DashboardTableStatus = {
  tone: "error" | "success"
  text: string
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
  // Plain text or a richer node (e.g. the creator drill-down breadcrumb).
  title: React.ReactNode
  icon?: React.ReactNode
  count: number
  controls?: React.ReactNode
  status?: DashboardTableStatus | null
  selectedCount?: number
  onClearSelection?: () => void
  footer: DashboardTableFooter
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
    status,
    selectedCount = 0,
    onClearSelection,
    footer,
  } = props

  return (
    <TableSurface>
      <DashboardToolbar>
        <DashboardToolbarTitle>
          {icon ? (
            <span className="flex size-7 shrink-0 items-center justify-center sm:size-8">
              {icon}
            </span>
          ) : null}
          <span className="text-sm font-medium sm:text-base">{title}</span>
          <Badge variant="secondary">{count}</Badge>
          {selectedCount && onClearSelection ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={onClearSelection}
            >
              Clear {selectedCount} selected
            </button>
          ) : null}
          {status ? (
            <TableStatusIndicator tone={status.tone}>
              {status.text}
            </TableStatusIndicator>
          ) : null}
        </DashboardToolbarTitle>

        {controls ? (
          <DashboardToolbarControls>{controls}</DashboardToolbarControls>
        ) : null}
      </DashboardToolbar>

      {"content" in props ? (
        <div className="min-h-72">{props.content}</div>
      ) : (
        <ScrollArea className="min-h-72 w-full">
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

      <DashboardTableFooter footer={footer} />
    </TableSurface>
  )
}

function DashboardTableFooter({ footer }: { footer: DashboardTableFooter }) {
  if (footer.type === "pagination") {
    const pageSizeOptions = footer.pageSizeOptions ?? defaultPageSizeOptions
    const totalPages = footer.totalPages || 1
    const currentPage = Math.max(1, Math.min(footer.page, totalPages))
    const firstRow = footer.total ? (currentPage - 1) * footer.pageSize + 1 : 0
    const lastRow = Math.min(currentPage * footer.pageSize, footer.total)

    return (
      <DashboardTablePaginationFooter
        pageSize={footer.pageSize}
        pageSizeOptions={pageSizeOptions}
        rangeText={`${firstRow ? `${firstRow}-${lastRow}` : "0"} of ${footer.total}`}
        onPageSizeChange={footer.onPageSizeChange}
        firstDisabled={currentPage === 1}
        previousDisabled={currentPage === 1}
        nextDisabled={currentPage === totalPages || footer.total === 0}
        lastDisabled={currentPage === totalPages || footer.total === 0}
        onFirst={() => footer.onPageChange(1)}
        onPrevious={() => footer.onPageChange(currentPage - 1)}
        onNext={() => footer.onPageChange(currentPage + 1)}
        onLast={() => footer.onPageChange(totalPages)}
      />
    )
  }

  if (footer.type === "loadMore") {
    const pageSize = footer.count || defaultPageSizeOptions[0]

    return (
      <DashboardTablePaginationFooter
        pageSize={pageSize}
        pageSizeOptions={[pageSize]}
        rangeText={`${footer.count ? `1-${footer.count}` : "0"} of ${footer.count}${footer.hasMore ? "+" : ""}`}
        firstDisabled
        previousDisabled
        nextDisabled={!footer.hasMore || footer.loading}
        lastDisabled
        onNext={footer.onLoadMore}
        nextIcon={footer.loading ? <Loader2Icon className="size-4 animate-spin" /> : undefined}
      />
    )
  }

  const pageSize = footer.count || defaultPageSizeOptions[0]

  return (
    <DashboardTablePaginationFooter
      pageSize={pageSize}
      pageSizeOptions={[pageSize]}
      rangeText={`${footer.count ? `1-${footer.count}` : "0"} of ${footer.count}`}
      firstDisabled
      previousDisabled
      nextDisabled
      lastDisabled
    />
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
  return (
    <div className="flex flex-col justify-between gap-3 bg-muted/50 p-4 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
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
