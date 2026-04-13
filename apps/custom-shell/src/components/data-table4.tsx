/* eslint-disable react-refresh/only-export-components */
"use client"

import * as React from "react"
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
import { z } from "zod"

import { cn } from "../lib/utils"
import { Badge } from "./ui/badge"
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

export const schema = z.object({
  id: z.string(),
  item: z.string(),
  type: z.string(),
  stock: z.boolean(),
  sku: z.string(),
  price: z.number(),
  availability: z.array(z.enum(["In store", "Online"])),
})

const data = [
  {
    id: "prod-001",
    item: "Tablet Case",
    type: "Electronics",
    stock: true,
    sku: "TC-001",
    price: 83.24,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-002",
    item: "Smart Watch",
    type: "Electronics",
    stock: true,
    sku: "SW-002",
    price: 246.27,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-003",
    item: "Wool Sweater",
    type: "Accessories",
    stock: true,
    sku: "WS-003",
    price: 168.27,
    availability: ["In store"],
  },
  {
    id: "prod-004",
    item: "Wireless Earbuds",
    type: "Electronics",
    stock: true,
    sku: "WE-004",
    price: 107.75,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-005",
    item: "Laptop Sleeve",
    type: "Electronics",
    stock: true,
    sku: "LS-005",
    price: 248.02,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-006",
    item: "Running Shoes",
    type: "Footwear",
    stock: true,
    sku: "RS-006",
    price: 208.26,
    availability: ["In store"],
  },
  {
    id: "prod-007",
    item: "Winter Jacket",
    type: "Clothing",
    stock: true,
    sku: "WJ-007",
    price: 148.06,
    availability: ["In store"],
  },
  {
    id: "prod-008",
    item: "Phone Case",
    type: "Accessories",
    stock: true,
    sku: "PC-008",
    price: 298.08,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-009",
    item: "Fitness Tracker",
    type: "Clothing",
    stock: true,
    sku: "FT-009",
    price: 222.09,
    availability: ["In store"],
  },
  {
    id: "prod-010",
    item: "Sunglasses",
    type: "Accessories",
    stock: true,
    sku: "SG-010",
    price: 60.17,
    availability: ["In store"],
  },
]

export const validatedData = schema.array().parse(data)

export const columns: ColumnDef<z.infer<typeof schema>>[] = [
  {
    accessorKey: "sku",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="SKU" />
    ),
    cell: ({ row }) => {
      const sku = row.getValue("sku") as string

      return (
        <span className="font-mono text-xs tracking-wide whitespace-nowrap text-muted-foreground uppercase">
          {sku}
        </span>
      )
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "item",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Item" />
    ),
    cell: ({ row }) => (
      <div className="max-w-[180px] truncate font-medium sm:max-w-[220px]">
        {row.getValue("item")}
      </div>
    ),
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = row.getValue("type") as string

      return (
        <span className="text-xs whitespace-nowrap text-muted-foreground sm:text-sm">
          {type}
        </span>
      )
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "stock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="In Stock" />
    ),
    cell: ({ row }) => {
      const inStock: boolean = row.getValue("stock")

      return (
        <div className="flex justify-start">
          <span className="inline-flex min-w-[3rem] justify-center rounded-full border px-2 py-1 text-xs font-semibold tracking-wide whitespace-nowrap uppercase">
            {inStock ? "Yes" : "No"}
          </span>
        </div>
      )
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Price" />
    ),
    cell: ({ row }) => {
      const price = parseFloat(row.getValue("price"))
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(price)

      return (
        <div className="font-medium whitespace-nowrap tabular-nums">
          {formatted}
        </div>
      )
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "availability",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Available In" />
    ),
    cell: ({ row }) => {
      const availability: ("In store" | "Online")[] =
        row.getValue("availability")

      return (
        <div className="flex space-x-2">
          {availability.map((location) => (
            <Badge
              key={location}
              variant="secondary"
              className="text-xs whitespace-nowrap"
            >
              {location}
            </Badge>
          ))}
        </div>
      )
    },
    enableSorting: false,
    enableHiding: false,
  },
]

export const DataTable4 = ({ className }: { className?: string }) => {
  const { table } = useDataTable({
    data: validatedData,
    columns,
    getRowId: (row) => row.id.toString(),
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
