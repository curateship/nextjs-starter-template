"use client"

import { Suspense, useEffect, useState, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Trash2, ShoppingCart } from "lucide-react"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  AdminTableShell,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import {
  TableRightActions,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  getOrdersWithProducts,
  deleteOrders,
  getOrderIdsAction,
  type ProductOrder,
  type OrderType
} from "@/lib/actions/email/order-actions"

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
})

const formatCurrency = (value: number) => currencyFormatter.format(value)

type OrderBadgeType = "lead_magnet" | "paid_purchase"

const orderTypeStyles: Record<OrderBadgeType, string> = {
  lead_magnet: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10",
  paid_purchase: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10"
}

const orderTypeLabels: Record<OrderBadgeType, string> = {
  lead_magnet: "Lead Magnet",
  paid_purchase: "Paid"
}

const emailStatusStyles = {
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  clicked: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  pending: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10"
}

type OrderSortColumn = "created_at" | "customer_email" | "product" | "amount"

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersContent />
    </Suspense>
  )
}

function OrdersContent() {
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<ProductOrder[]>([])
  const [productMap, setProductMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const orderSelection = useAdminBulkSelection()
  const clearOrderSelection = orderSelection.clearSelection
  const orderSort = useAdminSort<OrderSortColumn>("created_at", "desc")

  const typeParam = searchParams.get("type") as OrderType | null
  const [activeTab, setActiveTab] = useState<"all" | OrderType>(
    typeParam === "lead_magnet" || typeParam === "paid_purchase" ? typeParam : "all"
  )

  // Product filter — "all" means no filter
  const [selectedProduct, setSelectedProduct] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = contextPageSize

  useEffect(() => {
    const nextTab = typeParam === "lead_magnet" || typeParam === "paid_purchase" ? typeParam : "all"
    setActiveTab(nextTab)
    setCurrentPage(1)
  }, [typeParam])

  useEffect(() => {
    if (!currentSite?.id) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const result = await getOrdersWithProducts(currentSite.id, {
          page: currentPage,
          pageSize
        })

        setOrders(result.data)
        setTotal(result.total)
        setProductMap(result.productMap)
      } catch (error) {
        console.error("Error fetching orders data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [currentSite?.id, currentPage, pageSize])

  const promptDelete = useCallback((ids: string[]) => {
    setDeleteError(null)
    setDeleteIds(ids)
    setShowDeleteDialog(true)
  }, [])

  const confirmDelete = useCallback(async () => {
    setDeleting(true)
    try {
      await deleteOrders(deleteIds)
      setOrders((prev) => prev.filter((o) => !deleteIds.includes(o.id)))
      clearOrderSelection()
      setShowDeleteDialog(false)
      setDeleteIds([])
    } catch (error) {
      console.error("Error deleting orders:", error)
      setDeleteError("Failed to delete orders")
    } finally {
      setDeleting(false)
    }
  }, [clearOrderSelection, deleteIds])

  const filteredOrders = useMemo(() => {
    let result = orders
    const normalizedSearchQuery = searchQuery.trim().toLowerCase()

    // Filter by order type tab
    if (activeTab !== "all") {
      result = result.filter((o) => o.order_type === activeTab)
    }
    // Filter by selected product
    if (selectedProduct !== "all") {
      result = result.filter((o) => o.product_id === selectedProduct)
    }
    if (normalizedSearchQuery) {
      result = result.filter((o) => {
        const productName = productMap[o.product_id] || ""
        return `${o.customer_email} ${productName} ${o.order_type} ${o.payment_status ?? ""} ${o.amount_total ?? ""}`
          .toLowerCase()
          .includes(normalizedSearchQuery)
      })
    }
    return result
  }, [orders, activeTab, selectedProduct, searchQuery, productMap])

  const tabCounts = useMemo(
    () => ({
      all: total,
      lead_magnet: orders.filter((o) => o.order_type === "lead_magnet").length,
      paid_purchase: orders.filter((o) => o.order_type === "paid_purchase").length
    }),
    [orders, total]
  )

  const sortedOrders = useMemo(() => {
    if (!orderSort.sortColumn) return filteredOrders
    return [...filteredOrders].sort((a, b) => {
      const dir = orderSort.sortDirection === "asc" ? 1 : -1
      if (orderSort.sortColumn === "created_at") {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
      }
      if (orderSort.sortColumn === "customer_email") {
        return a.customer_email.localeCompare(b.customer_email) * dir
      }
      if (orderSort.sortColumn === "product") {
        const nameA = productMap[a.product_id] || ""
        const nameB = productMap[b.product_id] || ""
        return nameA.localeCompare(nameB) * dir
      }
      if (orderSort.sortColumn === "amount") {
        return ((a.amount_total || 0) - (b.amount_total || 0)) * dir
      }
      return 0
    })
  }, [filteredOrders, orderSort.sortColumn, orderSort.sortDirection, productMap])

  const filteredOrderIds = filteredOrders.map((order) => order.id)

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getOrderIdsAction(currentSite.id)
    if (ids) {
      orderSelection.selectAll(ids)
    }
  }

  const getEmailStatusBadge = (order: ProductOrder) => {
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
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Products", href: "/admin/products" }, { label: "Orders" }]}
          />

          <AdminTableShell
            title="Orders"
            icon={<ShoppingCart className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={filteredOrders.length}
            selectedCount={orderSelection.selectedCount}
            onClearSelection={orderSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={deleting}
                onClick={() => promptDelete(Array.from(orderSelection.selectedIds))}
                selectedCount={orderSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search orders"
                />
                <Select
                  value={activeTab}
                  onValueChange={(v) => {
                    setActiveTab(v as "all" | OrderType)
                    setCurrentPage(1)
                    clearOrderSelection()
                  }}
                >
                  <TableRightActionsSelectTrigger aria-label="Order type filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({tabCounts.all})</SelectItem>
                    <SelectItem value="lead_magnet">Lead Magnets ({tabCounts.lead_magnet})</SelectItem>
                    <SelectItem value="paid_purchase">Paid ({tabCounts.paid_purchase})</SelectItem>
                  </SelectContent>
                </Select>
                {loading ? (
                  <Skeleton className="h-8 w-[160px] rounded-md" />
                ) : Object.keys(productMap).length > 0 ? (
                  <Select
                    value={selectedProduct}
                    onValueChange={(v) => {
                      setSelectedProduct(v)
                      setCurrentPage(1)
                      clearOrderSelection()
                    }}
                  >
                    <TableRightActionsSelectTrigger aria-label="Product filter" className="max-w-[180px]">
                      <SelectValue placeholder="All Products" />
                    </TableRightActionsSelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      {Object.entries(productMap).map(([id, name]) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </TableRightActions>
            }
            footer={
              !loading ? (
                <AdminListFooter currentPage={currentPage} onPageChange={setCurrentPage} pageSize={pageSize} total={total} />
              ) : null
            }
          >
            <AdminSelectionBanner
              allSelected={orderSelection.allSelected}
              onClearSelection={orderSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={orderSelection.selectedCount}
              total={total}
              visibleCount={filteredOrders.length}
            />
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={orderSelection.isPageSelected(filteredOrderIds)}
                        onCheckedChange={() => orderSelection.togglePage(filteredOrderIds)}
                        aria-label="Select all orders"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={orderSort.sortColumn === "customer_email"}
                        direction={orderSort.sortDirection}
                        onClick={() => orderSort.toggleSort("customer_email")}
                      >
                        Customer
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={orderSort.sortColumn === "created_at"}
                        direction={orderSort.sortDirection}
                        onClick={() => orderSort.toggleSort("created_at")}
                      >
                        Date
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="content">
                      <AdminSortButton
                        active={orderSort.sortColumn === "product"}
                        direction={orderSort.sortDirection}
                        onClick={() => orderSort.toggleSort("product")}
                      >
                        Product
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Type</TableHead>
                    <TableHead column="meta">Email Status</TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={orderSort.sortColumn === "amount"}
                        direction={orderSort.sortDirection}
                        onClick={() => orderSort.toggleSort("amount")}
                      >
                        Amount
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={8} rowCount={5} showThumbnail={false} />
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
                        <ShoppingCart className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {orders.length === 0
                            ? "No orders found"
                            : `No ${activeTab === "lead_magnet" ? "lead magnet" : activeTab === "paid_purchase" ? "paid" : ""} orders found`}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedOrders.map((order) => (
                      <TableRow
                        key={order.id}
                        data-state={orderSelection.selectedIds.has(order.id) ? "selected" : undefined}
                        className="group"
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={orderSelection.selectedIds.has(order.id)}
                            onCheckedChange={() => orderSelection.toggleOne(order.id)}
                            aria-label={`Select order ${order.id}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <h4 className="truncate text-sm font-medium sm:text-base">{order.customer_email}</h4>
                        </TableCell>
                        <TableCell column="mutedMeta">{formatDate(order.created_at)}</TableCell>
                        <TableCell column="content">
                          <span className="text-sm font-medium">{productMap[order.product_id] || "Unknown Product"}</span>
                        </TableCell>
                        <TableCell column="meta">
                          <Badge variant="outline" className={orderTypeStyles[order.order_type as OrderBadgeType]}>
                            {orderTypeLabels[order.order_type as OrderBadgeType]}
                          </Badge>
                        </TableCell>
                        <TableCell column="meta">{getEmailStatusBadge(order)}</TableCell>
                        <TableCell column="meta">
                          {order.order_type === "lead_magnet" ? (
                            <span className="text-sm text-muted-foreground">Free</span>
                          ) : (
                            <span className="text-sm font-semibold">{formatCurrency((order.amount_total || 0) / 100)}</span>
                          )}
                        </TableCell>
                        <TableCell column="meta">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                            onClick={() => promptDelete([order.id])}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>
        </div>
      </AdminLayout>

      <ConfirmDestructive
        action="delete-order"
        open={showDeleteDialog}
        title={`Delete ${deleteIds.length === 1 ? "Order" : `${deleteIds.length} Orders`}`}
        description={
          deleteIds.length === 1
            ? "Are you sure you want to delete this order? This action cannot be undone."
            : `Are you sure you want to delete these ${deleteIds.length} orders? This action cannot be undone.`
        }
        disabled={deleting}
        error={deleteError}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        onCancel={() => { setShowDeleteDialog(false); setDeleteIds([]); setDeleteError(null) }}
        onConfirm={confirmDelete}
      />
    </>
  )
}
