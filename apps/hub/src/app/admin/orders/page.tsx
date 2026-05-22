"use client"

import { Suspense, useEffect, useState, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Trash2, ShoppingCart, List, Magnet, CreditCard } from "lucide-react"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardTableHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
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
    setDeleteIds(ids)
    setShowDeleteDialog(true)
  }, [])

  const confirmDelete = useCallback(async () => {
    setDeleting(true)
    try {
      await deleteOrders(deleteIds)
      setOrders((prev) => prev.filter((o) => !deleteIds.includes(o.id)))
      clearOrderSelection()
    } catch (error) {
      console.error("Error deleting orders:", error)
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
      setDeleteIds([])
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
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[{ label: "Products", href: "/admin/products" }, { label: "Orders" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search orders"
            }}
            filterMenu={{
              value: activeTab,
              onValueChange: (v) => {
                setActiveTab(v as "all" | OrderType)
                setCurrentPage(1)
                clearOrderSelection()
              },
              items: [
                {
                  value: "all",
                  label: "All",
                  icon: List,
                  count: tabCounts.all
                },
                {
                  value: "lead_magnet",
                  label: "Lead Magnets",
                  icon: Magnet,
                  count: tabCounts.lead_magnet
                },
                {
                  value: "paid_purchase",
                  label: "Paid",
                  icon: CreditCard,
                  count: tabCounts.paid_purchase
                }
              ]
            }}
            preActions={
              /* Product filter dropdown — skeleton while loading */
              loading ? (
                <Skeleton className="w-[180px] h-9 rounded-md" />
              ) : Object.keys(productMap).length > 0 ? (
                <Select
                  value={selectedProduct}
                  onValueChange={(v) => {
                    setSelectedProduct(v)
                    setCurrentPage(1)
                    clearOrderSelection()
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {Object.entries(productMap).map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : undefined
            }
            actions={
              <AdminBulkDeleteButton
                deleting={deleting}
                onClick={() => promptDelete(Array.from(orderSelection.selectedIds))}
                selectedCount={orderSelection.selectedCount}
              />
            }
          />

          <Card>
            {/* Table Header */}
            <CardTableHeader className="grid-cols-12">
              <div className="col-span-2 flex items-center space-x-4">
                <Checkbox
                  checked={orderSelection.isPageSelected(filteredOrderIds)}
                  onCheckedChange={() => orderSelection.togglePage(filteredOrderIds)}
                  aria-label="Select all orders"
                />
                <AdminSortButton
                  active={orderSort.sortColumn === "customer_email"}
                  direction={orderSort.sortDirection}
                  onClick={() => orderSort.toggleSort("customer_email")}
                >
                  Customer
                </AdminSortButton>
              </div>
              <div className="col-span-2">
                <AdminSortButton
                  active={orderSort.sortColumn === "created_at"}
                  direction={orderSort.sortDirection}
                  onClick={() => orderSort.toggleSort("created_at")}
                >
                  Date
                </AdminSortButton>
              </div>
              <div className="col-span-2">
                <AdminSortButton
                  active={orderSort.sortColumn === "product"}
                  direction={orderSort.sortDirection}
                  onClick={() => orderSort.toggleSort("product")}
                >
                  Product
                </AdminSortButton>
              </div>
              <div className="col-span-1">
                <span className="text-[0.8125rem]">Type</span>
              </div>
              <div className="col-span-2">
                <span className="text-[0.8125rem]">Email Status</span>
              </div>
              <div className="col-span-2">
                <AdminSortButton
                  active={orderSort.sortColumn === "amount"}
                  direction={orderSort.sortDirection}
                  onClick={() => orderSort.toggleSort("amount")}
                >
                  Amount
                </AdminSortButton>
              </div>
              <div className="col-span-1">
                <span className="text-[0.8125rem]">Actions</span>
              </div>
            </CardTableHeader>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            <AdminSelectionBanner
              allSelected={orderSelection.allSelected}
              onClearSelection={orderSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={orderSelection.selectedCount}
              total={total}
              visibleCount={filteredOrders.length}
            />

            {/* Table Body */}
            <div className="divide-y divide-muted/80">
              {loading ? (
                <AdminListSkeleton columns={6} rowCount={5} showThumbnail={false} />
              ) : filteredOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {orders.length === 0
                      ? "No orders found"
                      : `No ${activeTab === "lead_magnet" ? "lead magnet" : activeTab === "paid_purchase" ? "paid" : ""} orders found`}
                  </p>
                </div>
              ) : (
                sortedOrders.map((order) => (
                  <div
                    key={order.id}
                    className={`p-6 transition-colors ${orderSelection.selectedIds.has(order.id) ? "bg-accent/50" : ""}`}
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={orderSelection.selectedIds.has(order.id)}
                            onCheckedChange={() => orderSelection.toggleOne(order.id)}
                            aria-label={`Select order ${order.id}`}
                          />
                          <h4 className="font-medium truncate">{order.customer_email}</h4>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-muted-foreground">{formatDate(order.created_at)}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm font-medium">{productMap[order.product_id] || "Unknown Product"}</span>
                      </div>
                      <div className="col-span-1">
                        <Badge variant="outline" className={orderTypeStyles[order.order_type as OrderBadgeType]}>
                          {orderTypeLabels[order.order_type as OrderBadgeType]}
                        </Badge>
                      </div>
                      <div className="col-span-2">{getEmailStatusBadge(order)}</div>
                      <div className="col-span-2">
                        {order.order_type === "lead_magnet" ? (
                          <span className="text-sm text-muted-foreground">Free</span>
                        ) : (
                          <span className="text-sm font-semibold">
                            {formatCurrency((order.amount_total || 0) / 100)}
                          </span>
                        )}
                      </div>
                      <div className="col-span-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => promptDelete([order.id])}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {!loading && total > 0 && (
              <AdminListFooter
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                total={total}
              />
            )}
          </Card>
        </div>
      </AdminLayout>

      <AdminConfirmDialog
        open={showDeleteDialog}
        title={`Delete ${deleteIds.length === 1 ? "Order" : `${deleteIds.length} Orders`}`}
        description={
          deleteIds.length === 1
            ? "Are you sure you want to delete this order? This action cannot be undone."
            : `Are you sure you want to delete these ${deleteIds.length} orders? This action cannot be undone.`
        }
        disabled={deleting}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        onCancel={() => setShowDeleteDialog(false)}
        onConfirm={confirmDelete}
      />
    </>
  )
}
