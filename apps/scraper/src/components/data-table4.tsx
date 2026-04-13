/* eslint-disable react-refresh/only-export-components */
"use client"

import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"

import type { RunSummary } from "../lib/api"
import { formatDateTime, formatNumber } from "../lib/format"
import { cn } from "../lib/utils"
import { StatusPill } from "./status-pill"
import { Button } from "./ui/button"
import { ScrollArea, ScrollBar } from "./ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table"

type UseDataTableOptions<TData> = {
  data: Array<TData>
  columns: Array<ColumnDef<TData, unknown>>
  getRowId?: (row: TData) => string
  initialSorting?: SortingState
}

export function useDataTable<TData>(options: UseDataTableOptions<TData>) {
  const { data, columns, getRowId, initialSorting = [] } = options

  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return {
    table,
    sorting,
    setSorting,
  }
}

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>
  title: string
}

export const DataTableColumnHeader = <TData, TValue>({
  column,
  title,
}: DataTableColumnHeaderProps<TData, TValue>) => {
  const canSort = column.getCanSort()
  const sorted = column.getIsSorted()

  if (!canSort) {
    return (
      <span className="flex h-8 items-center text-xs font-medium text-foreground sm:text-sm">
        {title}
      </span>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex h-8 items-center gap-2 px-0 text-xs font-medium text-foreground sm:text-sm"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      <span>{title}</span>
      {sorted === "desc" ? (
        <ArrowDown className="h-3 w-3 sm:h-4 sm:w-4" />
      ) : sorted === "asc" ? (
        <ArrowUp className="h-3 w-3 sm:h-4 sm:w-4" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-50 sm:h-4 sm:w-4" />
      )}
    </Button>
  )
}

export const columns: ColumnDef<RunSummary>[] = [
  {
    accessorKey: "keyword",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Query" />
    ),
    cell: ({ row }) => {
      const run = row.original

      return (
        <div className="min-w-0 space-y-1">
          <Link
            to="/google-maps/runs/$runId"
            params={{ runId: run.id }}
            className="scraper-link block truncate font-medium"
          >
            {run.keyword}
          </Link>
          <p className="truncate text-xs text-muted-foreground sm:text-sm">{run.area}</p>
        </div>
      )
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const run = row.original

      return (
        <div className="space-y-2">
          <StatusPill status={run.status} />
          {run.cancel_requested_at ? (
            <p className="text-xs whitespace-nowrap text-muted-foreground">Cancel requested</p>
          ) : null}
        </div>
      )
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "total_places_saved",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Saved" />
    ),
    cell: ({ row }) => {
      return (
        <span className="font-medium whitespace-nowrap tabular-nums">
          {formatNumber(row.original.total_places_saved)}
        </span>
      )
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "attempt_count",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Attempts" />
    ),
    cell: ({ row }) => {
      return (
        <span className="whitespace-nowrap tabular-nums">
          {formatNumber(row.original.attempt_count)}
        </span>
      )
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      return (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(row.original.created_at)}
        </span>
      )
    },
    enableSorting: true,
    enableHiding: false,
  },
]

export const DataTable4 = ({
  className,
  runs,
}: {
  className?: string
  runs: RunSummary[]
}) => {
  const { table } = useDataTable({
    data: runs,
    columns,
    getRowId: (row) => row.id.toString(),
    initialSorting: [{ id: "created_at", desc: true }],
  })

  return (
    <section className={cn(className)}>
      <div className="w-full">
        <div className="w-full overflow-hidden">
          <div>

          </div>
          <div>
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="min-w-[800px]">
                <Table className="table-fixed border-separate border-spacing-0 [&_tr:not(:last-child)_td]:border-b [&_tr:not(:last-child)_td]:border-muted">
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow
                        key={headerGroup.id}
                        className="hover:bg-transparent"
                      >
                        {headerGroup.headers.map((header) => {
                          return (
                            <TableHead
                              key={header.id}
                              colSpan={header.colSpan}
                              className="relative h-12 border-y border-border bg-muted/50 px-3 text-left text-xs font-medium select-none first:rounded-l-lg first:border-l first:pl-3 last:rounded-r-lg last:border-r last:pr-3 sm:px-4 sm:text-sm sm:first:pl-5 sm:last:pr-5"
                            >
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows?.length ? (
                      table.getRowModel().rows.map((row) => (
                        <TableRow
                          key={row.id}
                          data-state={row.getIsSelected() && "selected"}
                          className="border-0 hover:bg-muted/50 [&:first-child>td:first-child]:rounded-tl-lg [&:first-child>td:last-child]:rounded-tr-lg [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              key={cell.id}
                              className="px-3 py-2 text-xs first:pl-3 last:pr-3 sm:px-4 sm:py-3 sm:text-sm sm:first:pl-5 sm:last:pr-5"
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow className="border-0 [&>td:first-child]:rounded-tl-lg [&>td:first-child]:rounded-bl-lg [&>td:last-child]:rounded-tr-lg [&>td:last-child]:rounded-br-lg">
                        <TableCell
                          colSpan={columns.length}
                          className="h-24 px-4 text-center text-sm text-muted-foreground"
                        >
                          No results.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground sm:hidden">
          ← Swipe to see more →
        </p>
      </div>
    </section>
  )
}
