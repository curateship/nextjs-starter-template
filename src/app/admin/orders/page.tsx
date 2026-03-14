"use client"

import * as React from "react"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  type Column,
  type ColumnDef,
  type PaginationState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteContext } from "@/contexts/site-context"
import {
  getOrdersBySite,
  deleteOrders,
  type ProductOrder,
  type OrderType,
} from "@/lib/actions/email/order-actions"
import { getSiteProductsAction } from "@/lib/actions/products/product-actions"
import { getAdminSettingsAction } from "@/lib/actions/admin-settings/admin-settings-actions"

// --- Data table utilities (from data-table26 pattern) ---

type ColumnMeta = {
  headerClassName?: string
  cellClassName?: string
  width?: number | string
  minWidth?: number | string
  maxWidth?: number | string
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const formatCurrency = (value: number) => currencyFormatter.format(value)
const formatDate = (value: string) => dateFormatter.format(new Date(value))

type OrderBadgeType = "lead_magnet" | "paid_purchase"
type EmailStatusType = "sent" | "clicked" | "pending"

const orderTypeStyles: Record<OrderBadgeType, string> = {
  lead_magnet:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10",
  paid_purchase:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10",
}

const orderTypeLabels: Record<OrderBadgeType, string> = {
  lead_magnet: "Lead Magnet",
  paid_purchase: "Paid",
}

const emailStatusStyles: Record<EmailStatusType, string> = {
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  clicked:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  pending:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10",
}

// --- DataTableColumnHeader ---

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>
  title: string
}

const DataTableColumnHeader = <TData, TValue>({
  column,
  title,
}: DataTableColumnHeaderProps<TData, TValue>) => {
  const canSort = column.getCanSort()
  const sorted = column.getIsSorted()

  if (!canSort) {
    return (
      <div className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
        <span>{title}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-1.5",
        "py-2 text-[0.8125rem]",
        "text-muted-foreground hover:text-foreground",
        "cursor-pointer outline-none transition-colors"
      )}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      <span>{title}</span>
      <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">
        {sorted === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : sorted === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-70" />
        )}
      </span>
    </button>
  )
}

// --- Column definitions ---

function getColumns(
  productMap: Record<string, string>,
  onDelete: (ids: string[]) => void
): ColumnDef<ProductOrder>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all rows"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: {
        width: 48,
        minWidth: 48,
        headerClassName: "!px-0 !border-r-0",
        cellClassName: "!px-0 !border-r-0",
      } satisfies ColumnMeta,
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">
            {formatDate(row.original.created_at)}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.original.id.slice(0, 8)}
          </span>
        </div>
      ),
      meta: {
        width: 140,
        minWidth: 140,
        headerClassName:
          "!border-r-0 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60",
        cellClassName:
          "!border-r-0 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60",
      } satisfies ColumnMeta,
    },
    {
      accessorKey: "customer_email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Customer" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">
            {row.original.customer_email}
          </span>
          <span className="text-xs text-muted-foreground capitalize">
            {row.original.order_type === "lead_magnet"
              ? "Lead Magnet"
              : "Purchase"}
          </span>
        </div>
      ),
      meta: {
        width: 240,
        minWidth: 240,
        headerClassName:
          "!border-r-0 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[0.5px] before:bg-border/60",
        cellClassName:
          "!border-r-0 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[0.5px] after:bg-border/60",
      } satisfies ColumnMeta,
    },
    {
      accessorKey: "product_id",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Product" />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {productMap[row.original.product_id] || "Unknown Product"}
        </span>
      ),
      meta: {
        width: 200,
        minWidth: 200,
      } satisfies ColumnMeta,
    },
    {
      accessorKey: "order_type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={orderTypeStyles[row.original.order_type as OrderBadgeType]}
        >
          {orderTypeLabels[row.original.order_type as OrderBadgeType]}
        </Badge>
      ),
      meta: {
        width: 140,
        minWidth: 140,
      } satisfies ColumnMeta,
    },
    {
      id: "email_status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Email Status" />
      ),
      cell: ({ row }) => {
        const order = row.original
        if (order.clicked_at) {
          return (
            <Badge variant="outline" className={emailStatusStyles.clicked}>
              Clicked ({order.click_count})
            </Badge>
          )
        }
        if (order.email_sent_at) {
          return (
            <Badge variant="outline" className={emailStatusStyles.sent}>
              Sent
            </Badge>
          )
        }
        return (
          <Badge variant="outline" className={emailStatusStyles.pending}>
            Pending
          </Badge>
        )
      },
      enableSorting: false,
      meta: {
        width: 140,
        minWidth: 140,
      } satisfies ColumnMeta,
    },
    {
      id: "amount",
      accessorFn: (row) => row.amount_total,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      cell: ({ row }) => {
        if (row.original.order_type === "lead_magnet") {
          return <span className="text-muted-foreground">Free</span>
        }
        return (
          <span className="font-semibold text-foreground">
            {formatCurrency((row.original.amount_total || 0) / 100)}
          </span>
        )
      },
      meta: {
        width: 120,
        minWidth: 120,
      } satisfies ColumnMeta,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
            onClick={() => onDelete([row.original.id])}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: {
        width: 48,
        minWidth: 48,
        headerClassName:
          "!px-0 md:sticky md:right-0 z-20 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60",
        cellClassName:
          "!px-0 md:sticky md:right-0 z-20 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[0.5px] before:bg-border/60",
      } satisfies ColumnMeta,
    },
  ]
}

// --- Skeleton Row ---

function SkeletonRow() {
  return (
    <TableRow className="h-11 !border-b-[0.5px] border-border/60">
      {Array.from({ length: 8 }).map((_, i) => (
        <TableCell key={i} className="!px-3 !py-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// --- Page Component ---

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersContent />
    </Suspense>
  )
}

function OrdersContent() {
  const { currentSite } = useSiteContext()
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<ProductOrder[]>([])
  const [productMap, setProductMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Read type from query param for sidebar deep-link filtering
  const typeParam = searchParams.get("type") as OrderType | null
  const [activeTab, setActiveTab] = useState<"all" | OrderType>(
    typeParam === "lead_magnet" || typeParam === "paid_purchase"
      ? typeParam
      : "all"
  )

  const [total, setTotal] = useState(0)
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })

  useEffect(() => {
    if (!currentSite?.id) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const adminSettings = await getAdminSettingsAction()
        const pageSize = adminSettings.data?.settings?.dashboard_page_size || pagination.pageSize
        if (pageSize !== pagination.pageSize) {
          setPagination((prev) => ({ ...prev, pageSize }))
        }

        const [ordersResult, productsResult] = await Promise.all([
          getOrdersBySite(currentSite.id, { page: pagination.pageIndex + 1, pageSize: pagination.pageSize }),
          getSiteProductsAction(currentSite.id),
        ])

        setOrders(ordersResult.data)
        setTotal(ordersResult.total)

        const map: Record<string, string> = {}
        if (productsResult.data) {
          for (const p of productsResult.data) {
            map[p.id] = p.title
          }
        }
        setProductMap(map)
      } catch (error) {
        console.error("Error fetching orders data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [currentSite?.id, pagination.pageIndex, pagination.pageSize])

  const promptDelete = React.useCallback((ids: string[]) => {
    setDeleteIds(ids)
    setShowDeleteDialog(true)
  }, [])

  const confirmDelete = React.useCallback(async () => {
    setDeleting(true)
    try {
      await deleteOrders(deleteIds)
      setOrders((prev) => prev.filter((o) => !deleteIds.includes(o.id)))
      setRowSelection({})
    } catch (error) {
      console.error("Error deleting orders:", error)
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
      setDeleteIds([])
    }
  }, [deleteIds])

  // Filter data by active tab
  const filteredOrders = React.useMemo(
    () =>
      activeTab === "all"
        ? orders
        : orders.filter((o) => o.order_type === activeTab),
    [orders, activeTab]
  )

  const tabCounts = React.useMemo(
    () => ({
      all: orders.length,
      lead_magnet: orders.filter((o) => o.order_type === "lead_magnet").length,
      paid_purchase: orders.filter((o) => o.order_type === "paid_purchase").length,
    }),
    [orders]
  )

  const columns = React.useMemo(() => getColumns(productMap, promptDelete), [productMap, promptDelete])

  const coreRowModel = React.useMemo(() => getCoreRowModel<ProductOrder>(), [])
  const sortedRowModel = React.useMemo(() => getSortedRowModel<ProductOrder>(), [])
  const table = useReactTable({
    data: filteredOrders,
    columns,
    state: { sorting, rowSelection, pagination },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: coreRowModel,
    getSortedRowModel: sortedRowModel,
    getRowId: (row) => row.id,
    manualPagination: true,
    pageCount: Math.ceil(total / pagination.pageSize),
  })

  const visibleColumnCount = table.getVisibleLeafColumns().length
  const totalPages = Math.ceil(total / pagination.pageSize)
  const currentPage = pagination.pageIndex + 1

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { label: "Orders", isPage: true },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Orders"
            extraContent={
              <div className="flex items-center gap-3">
                {Object.keys(rowSelection).length > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {Object.keys(rowSelection).length} selected
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting}
                      onClick={() => promptDelete(Object.keys(rowSelection))}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      {deleting ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                )}
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => {
                    setActiveTab(v as "all" | OrderType)
                    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
                  }}
                >
                  <TabsList className="gap-1">
                    <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
                    <TabsTrigger value="lead_magnet">
                      Lead Magnets ({tabCounts.lead_magnet})
                    </TabsTrigger>
                    <TabsTrigger value="paid_purchase">
                      Paid Purchases ({tabCounts.paid_purchase})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            }
          />

          <div className="mx-6 pb-10 space-y-6">

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-border/60 bg-card [--dt-cell-bg:var(--background)] [--dt-header-bg:var(--muted)] [--dt-row-hover-bg:color-mix(in_oklab,var(--background)_98%,var(--foreground)_2%)] [--dt-row-selected-bg:color-mix(in_oklab,var(--background)_98%,var(--foreground)_2%)] [--dt-row-selected-hover-bg:color-mix(in_oklab,var(--background)_96%,var(--foreground)_4%)] dark:[--dt-header-bg:var(--card)] dark:[--dt-row-hover-bg:var(--muted)] dark:[--dt-row-selected-bg:var(--muted)] dark:[--dt-row-selected-hover-bg:color-mix(in_oklab,var(--muted)_80%,var(--foreground)_20%)]">
            <div className="overflow-x-auto overscroll-x-none">
              <table className="w-full min-w-[1080px] caption-bottom text-[0.8125rem]">
                <TableHeader className="sticky top-0 z-10 border-b-[0.5px] border-border/60 bg-[var(--dt-header-bg)]">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="!border-0 hover:bg-transparent"
                    >
                      {headerGroup.headers.map((header) => {
                        const meta =
                          (header.column.columnDef.meta as ColumnMeta) ?? {}
                        const sizeStyle: React.CSSProperties = {}
                        if (meta.width !== undefined) {
                          sizeStyle.width =
                            typeof meta.width === "number"
                              ? `${meta.width}px`
                              : meta.width
                        }
                        if (meta.minWidth !== undefined) {
                          sizeStyle.minWidth =
                            typeof meta.minWidth === "number"
                              ? `${meta.minWidth}px`
                              : meta.minWidth
                        }
                        if (meta.maxWidth !== undefined) {
                          sizeStyle.maxWidth =
                            typeof meta.maxWidth === "number"
                              ? `${meta.maxWidth}px`
                              : meta.maxWidth
                        }
                        return (
                          <TableHead
                            key={header.id}
                            colSpan={header.colSpan}
                            className={cn(
                              "relative !h-11 border-r-[0.5px] border-border/60 bg-[var(--dt-header-bg)] !px-3 text-left align-middle !text-[0.8125rem] font-medium !text-muted-foreground whitespace-nowrap last:border-r-0",
                              meta.headerClassName
                            )}
                            style={sizeStyle}
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
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))
                  ) : table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() && "selected"}
                        className="group h-11 !border-b-[0.5px] border-border/60 bg-[var(--dt-row-bg)] [--dt-row-bg:var(--dt-cell-bg)] transition-colors hover:[--dt-row-bg:var(--dt-row-hover-bg)] data-[state=selected]:[--dt-row-bg:var(--dt-row-selected-bg)] data-[state=selected]:hover:[--dt-row-bg:var(--dt-row-selected-hover-bg)] last:border-b-0"
                      >
                        {row.getVisibleCells().map((cell) => {
                          const meta =
                            (cell.column.columnDef.meta as ColumnMeta) ?? {}
                          const sizeStyle: React.CSSProperties = {}
                          if (meta.width !== undefined) {
                            sizeStyle.width =
                              typeof meta.width === "number"
                                ? `${meta.width}px`
                                : meta.width
                          }
                          if (meta.minWidth !== undefined) {
                            sizeStyle.minWidth =
                              typeof meta.minWidth === "number"
                                ? `${meta.minWidth}px`
                                : meta.minWidth
                          }
                          if (meta.maxWidth !== undefined) {
                            sizeStyle.maxWidth =
                              typeof meta.maxWidth === "number"
                                ? `${meta.maxWidth}px`
                                : meta.maxWidth
                          }
                          return (
                            <TableCell
                              key={cell.id}
                              className={cn(
                                "relative h-11 border-r-[0.5px] border-border/60 bg-[var(--dt-row-bg)] !px-3 !py-2 align-middle !text-[0.8125rem] text-foreground whitespace-nowrap last:border-r-0",
                                meta.cellClassName
                              )}
                              style={sizeStyle}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={visibleColumnCount}
                        className="h-24 text-center text-[0.8125rem] text-muted-foreground"
                      >
                        No orders found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="flex items-center justify-between">
              <PaginationInfo
                currentPage={currentPage}
                pageSize={pagination.pageSize}
                total={total}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => setPagination((prev) => ({ ...prev, pageIndex: page - 1 }))}
                showFirstLast={false}
              />
            </div>
          )}
          </div>
        </div>
      </AdminLayout>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Delete {deleteIds.length === 1 ? "Order" : `${deleteIds.length} Orders`}</DialogTitle>
            <DialogDescription>
              {deleteIds.length === 1
                ? "Are you sure you want to delete this order? This action cannot be undone."
                : `Are you sure you want to delete these ${deleteIds.length} orders? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
