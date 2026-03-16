"use client"

import { Suspense, useEffect, useState, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Trash2,
  ShoppingCart,
  List,
  Magnet,
  CreditCard,
  Package,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteContext } from "@/contexts/site-context"
import {
  getOrdersWithProducts,
  deleteOrders,
  type ProductOrder,
  type OrderType,
} from "@/lib/actions/email/order-actions"

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

const emailStatusStyles = {
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  clicked:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  pending:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10",
}

type SortColumn = "created_at" | "customer_email" | "product" | "amount" | null

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersContent />
    </Suspense>
  )
}

function OrdersContent() {
  const { currentSite, pageSize: contextPageSize } = useSiteContext()
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<ProductOrder[]>([])
  const [productMap, setProductMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const typeParam = searchParams.get("type") as OrderType | null
  const [activeTab, setActiveTab] = useState<"all" | OrderType>(
    typeParam === "lead_magnet" || typeParam === "paid_purchase"
      ? typeParam
      : "all"
  )

  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = contextPageSize
  const [sortColumn, setSortColumn] = useState<SortColumn>("created_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    if (!currentSite?.id) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const result = await getOrdersWithProducts(currentSite.id, { page: currentPage, pageSize })

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
      setSelectedIds(new Set())
    } catch (error) {
      console.error("Error deleting orders:", error)
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
      setDeleteIds([])
    }
  }, [deleteIds])

  const filteredOrders = useMemo(
    () =>
      activeTab === "all"
        ? orders
        : orders.filter((o) => o.order_type === activeTab),
    [orders, activeTab]
  )

  const tabCounts = useMemo(
    () => ({
      all: total,
      lead_magnet: orders.filter((o) => o.order_type === "lead_magnet").length,
      paid_purchase: orders.filter((o) => o.order_type === "paid_purchase").length,
    }),
    [orders, total]
  )

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "desc") {
        setSortColumn(null)
        setSortDirection("asc")
      } else {
        setSortDirection("desc")
      }
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === "asc") return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedOrders = useMemo(() => {
    if (!sortColumn) return filteredOrders
    return [...filteredOrders].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1
      if (sortColumn === "created_at") {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
      }
      if (sortColumn === "customer_email") {
        return a.customer_email.localeCompare(b.customer_email) * dir
      }
      if (sortColumn === "product") {
        const nameA = productMap[a.product_id] || ""
        const nameB = productMap[b.product_id] || ""
        return nameA.localeCompare(nameB) * dir
      }
      if (sortColumn === "amount") {
        return ((a.amount_total || 0) - (b.amount_total || 0)) * dir
      }
      return 0
    })
  }, [filteredOrders, sortColumn, sortDirection, productMap])

  const toggleSelectOrder = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredOrders.map((o) => o.id)))
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

  const totalPages = Math.ceil(total / pageSize)

  return (
    <>
      <StickyHeader
        navLinks={[
          { label: "Products", href: "/admin/products", icon: Package },
          { label: "Orders", href: "/admin/orders", icon: ShoppingCart, active: true },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Orders"
            extraContent={
              <div className="flex items-center gap-3">
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleting}
                    onClick={() => promptDelete(Array.from(selectedIds))}
                  >
                    {deleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete ({selectedIds.size})
                      </>
                    )}
                  </Button>
                )}
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => {
                    setActiveTab(v as "all" | OrderType)
                    setCurrentPage(1)
                    setSelectedIds(new Set())
                  }}
                >
                  <TabsList className="gap-1">
                    <TabsTrigger value="all"><List className="h-3.5 w-3.5 mr-1.5" />All ({tabCounts.all})</TabsTrigger>
                    <TabsTrigger value="lead_magnet">
                      <Magnet className="h-3.5 w-3.5 mr-1.5" />Lead Magnets ({tabCounts.lead_magnet})
                    </TabsTrigger>
                    <TabsTrigger value="paid_purchase">
                      <CreditCard className="h-3.5 w-3.5 mr-1.5" />Paid ({tabCounts.paid_purchase})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={filteredOrders.length > 0 && selectedIds.size === filteredOrders.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all orders"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort("customer_email")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Customer</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("customer_email")}</span>
                  </button>
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("created_at")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Date</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("created_at")}</span>
                  </button>
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("product")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Product</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("product")}</span>
                  </button>
                </div>
                <div className="col-span-1">
                  <span className="text-[0.8125rem]">Type</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[0.8125rem]">Email Status</span>
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("amount")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Amount</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("amount")}</span>
                  </button>
                </div>
                <div className="col-span-1">
                  <span className="text-[0.8125rem]">Actions</span>
                </div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                            <div className="h-4 bg-muted rounded animate-pulse w-32" />
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="h-4 bg-muted rounded animate-pulse w-24" />
                        </div>
                        <div className="col-span-2">
                          <div className="h-4 bg-muted rounded animate-pulse w-28" />
                        </div>
                        <div className="col-span-1">
                          <div className="h-5 bg-muted rounded-full animate-pulse w-16" />
                        </div>
                        <div className="col-span-2">
                          <div className="h-5 bg-muted rounded-full animate-pulse w-16" />
                        </div>
                        <div className="col-span-2">
                          <div className="h-4 bg-muted rounded animate-pulse w-16" />
                        </div>
                        <div className="col-span-1">
                          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
                    className={`p-6 transition-colors ${selectedIds.has(order.id) ? "bg-accent/50" : ""}`}
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={selectedIds.has(order.id)}
                            onCheckedChange={() => toggleSelectOrder(order.id)}
                            aria-label={`Select order ${order.id}`}
                          />
                          <h4 className="font-medium truncate">{order.customer_email}</h4>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(order.created_at)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm font-medium">
                          {productMap[order.product_id] || "Unknown Product"}
                        </span>
                      </div>
                      <div className="col-span-1">
                        <Badge
                          variant="outline"
                          className={orderTypeStyles[order.order_type as OrderBadgeType]}
                        >
                          {orderTypeLabels[order.order_type as OrderBadgeType]}
                        </Badge>
                      </div>
                      <div className="col-span-2">
                        {getEmailStatusBadge(order)}
                      </div>
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
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  showFirstLast={false}
                />
              </div>
            )}
          </Card>
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
