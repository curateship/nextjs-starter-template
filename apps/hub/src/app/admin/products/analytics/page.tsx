"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye, Users, ShoppingCart, DollarSign, Package, BarChart3, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSiteSwitcher } from "@/components/admin/site-switcher/site-switcher-provider"
import {
  getProductAnalyticsOverview,
  getProductTrafficOverTime,
  getProductOrdersOverTime,
  type ProductAnalyticsRow,
  type ProductAnalyticsTotals,
} from "@/lib/actions/analytics/product-analytics-actions"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

/* Period filter options — same as site analytics */
const PERIODS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
] as const

type Period = (typeof PERIODS)[number]["id"]

export default function ProductAnalyticsPage() {
  const { currentSite } = useSiteSwitcher()
  const [period, setPeriod] = useState<Period>("7d")
  const [loading, setLoading] = useState(true)

  // Data state
  const [products, setProducts] = useState<ProductAnalyticsRow[]>([])
  const [totals, setTotals] = useState<ProductAnalyticsTotals>({
    totalViews: 0,
    totalVisitors: 0,
    totalOrders: 0,
    totalRevenue: 0,
  })
  const [traffic, setTraffic] = useState<{ date: string; views: number; visitors: number }[]>([])
  const [orders, setOrders] = useState<{ date: string; orders: number; revenue: number }[]>([])

  /* Load all analytics data when site or period changes */
  const loadData = useCallback(async () => {
    if (!currentSite?.id) return
    setLoading(true)
    try {
      const [overviewData, trafficData, ordersData] = await Promise.all([
        getProductAnalyticsOverview(currentSite.id, period),
        getProductTrafficOverTime(currentSite.id, period),
        getProductOrdersOverTime(currentSite.id, period),
      ])
      setProducts(overviewData.products)
      setTotals(overviewData.totals)
      setTraffic(trafficData)
      setOrders(ordersData)
    } catch (err) {
      console.error("Failed to load product analytics:", err)
    } finally {
      setLoading(false)
    }
  }, [currentSite?.id, period])

  useEffect(() => { loadData() }, [loadData])

  /* Format cents to dollar string */
  function formatRevenue(cents: number): string {
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  /* Format chart date labels */
  function formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    if (period === "today" || period === "yesterday") {
      return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  /* Merge traffic + orders time series for the combined chart */
  const chartData = traffic.map(t => {
    const matching = orders.find(o => o.date === t.date)
    return {
      date: formatDate(t.date),
      views: t.views,
      visitors: t.visitors,
      orders: matching?.orders ?? 0,
    }
  })

  /* Sorting state for product performance table */
  type SortColumn = "title" | "views" | "visitors" | "orders" | "conv" | "revenue" | null
  const [sortColumn, setSortColumn] = useState<SortColumn>("views")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

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

  /* Sort products based on current sort state */
  const sortedProducts = useMemo(() => {
    if (!sortColumn) return products
    return [...products].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1
      if (sortColumn === "title") return a.title.localeCompare(b.title) * dir
      if (sortColumn === "views") return (a.views - b.views) * dir
      if (sortColumn === "visitors") return (a.visitors - b.visitors) * dir
      if (sortColumn === "orders") return (a.orders - b.orders) * dir
      if (sortColumn === "revenue") return (a.revenue - b.revenue) * dir
      if (sortColumn === "conv") {
        const convA = a.visitors > 0 ? a.orders / a.visitors : 0
        const convB = b.visitors > 0 ? b.orders / b.visitors : 0
        return (convA - convB) * dir
      }
      return 0
    })
  }, [products, sortColumn, sortDirection])

  /* Loading skeleton for stat cards */
  const StatSkeleton = () => <div className="h-8 w-20 bg-muted rounded animate-pulse" />

  return (
    <>
      <StickyHeader
        navLinks={[
          { label: "Products", href: "/admin/products", icon: Package },
          { label: "Orders", href: "/admin/orders", icon: ShoppingCart },
          { label: "Analytics", href: "/admin/products/analytics", icon: BarChart3, active: true },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Products", href: "/admin/products" },
              { label: "Analytics" },
            ]}
            preActions={
              <span className="text-sm text-muted-foreground">
                {period === "today" && new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {period === "yesterday" && new Date(Date.now() - 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {period === "7d" && `${new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                {period === "30d" && `${new Date(Date.now() - 30 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </span>
            }
            tabs={{
              value: period,
              onValueChange: (v) => setPeriod(v as Period),
              items: PERIODS.map(p => ({ value: p.id, label: p.label })),
            }}
          />

          {/* Stats Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Product Views</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? <StatSkeleton /> : (
                  <div className="text-2xl font-bold">{totals.totalViews.toLocaleString()}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? <StatSkeleton /> : (
                  <div className="text-2xl font-bold">{totals.totalVisitors.toLocaleString()}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? <StatSkeleton /> : (
                  <div className="text-2xl font-bold">{totals.totalOrders.toLocaleString()}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? <StatSkeleton /> : (
                  <div className="text-2xl font-bold">{formatRevenue(totals.totalRevenue)}</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Traffic & Orders Chart */}
          {!loading && chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Traffic & Orders Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 12 }} />
                      <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Views" />
                      <Line type="monotone" dataKey="visitors" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="Visitors" />
                      <Line type="monotone" dataKey="orders" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} name="Orders" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-Product Performance Table */}
          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("title")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Product</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("title")}</span>
                  </button>
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("views")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Views</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("views")}</span>
                  </button>
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("visitors")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Visitors</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("visitors")}</span>
                  </button>
                </div>
                <div className="col-span-1">
                  <button
                    type="button"
                    onClick={() => toggleSort("orders")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Orders</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("orders")}</span>
                  </button>
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("conv")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Conv. Rate</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("conv")}</span>
                  </button>
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("revenue")}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Revenue</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("revenue")}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="px-6 py-3 border-b border-muted/80">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-muted rounded animate-pulse shrink-0" />
                            <div className="h-4 bg-muted rounded animate-pulse w-32" />
                          </div>
                        </div>
                        <div className="col-span-2"><div className="h-4 bg-muted rounded animate-pulse w-16" /></div>
                        <div className="col-span-2"><div className="h-4 bg-muted rounded animate-pulse w-16" /></div>
                        <div className="col-span-1"><div className="h-4 bg-muted rounded animate-pulse w-10" /></div>
                        <div className="col-span-2"><div className="h-4 bg-muted rounded animate-pulse w-14" /></div>
                        <div className="col-span-2"><div className="h-4 bg-muted rounded animate-pulse w-16" /></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : sortedProducts.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No products yet</p>
                </div>
              ) : (
                sortedProducts.map((product) => {
                  const convRate = product.visitors > 0
                    ? ((product.orders / product.visitors) * 100).toFixed(1)
                    : "0.0"

                  return (
                    <div key={product.id} className="px-6 py-3">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-3">
                          <div className="flex items-center gap-3">
                            {product.featuredImage && (
                              <img
                                src={product.featuredImage}
                                alt=""
                                className="h-8 w-8 rounded object-cover shrink-0"
                              />
                            )}
                            <span className="font-medium truncate">{product.title}</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <span className="text-sm">{product.views.toLocaleString()}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-sm">{product.visitors.toLocaleString()}</span>
                        </div>
                        <div className="col-span-1">
                          <span className="text-sm">{product.orders.toLocaleString()}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-sm">{convRate}%</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-sm font-semibold">{formatRevenue(product.revenue)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
        </div>
      </AdminLayout>
    </>
  )
}
