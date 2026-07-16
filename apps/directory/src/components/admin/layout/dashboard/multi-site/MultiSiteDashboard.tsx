"use client"

import { useMemo, useState } from "react"
import Bell from "lucide-react/dist/esm/icons/bell.js"
import Check from "lucide-react/dist/esm/icons/check.js"
import CheckCheck from "lucide-react/dist/esm/icons/check-check.js"
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js"
import Globe from "lucide-react/dist/esm/icons/globe.js"
import Minus from "lucide-react/dist/esm/icons/minus.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js"
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check.js"
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart.js"
import TriangleAlert from "lucide-react/dist/esm/icons/triangle-alert.js"
import Zap from "lucide-react/dist/esm/icons/zap.js"

import Link from "@/components/app-link"
import { useRouter } from "@/lib/navigation-client"
import {
  AdminSortButton,
  AdminTableShell,
  AdminTableSummaryFooter,
  useAdminSort,
} from "@/components/admin/layout/list"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { showActionError } from "@/lib/utils/admin-action-feedback"
import type { Site } from "@/lib/actions/sites/site-actions"
import type { DashboardRange, MultiSiteDashboardData } from "@/lib/actions/analytics/analytics-actions"
import type { HubNotificationItem } from "@/lib/actions/notifications/notification-actions"
import type { HubNotificationType } from "@/lib/actions/notifications/notification-service"
import { markAllHubNotificationsReadForUser } from "@/lib/actions/notifications/notification-actions"
import type { DashboardAutomationRun } from "@/lib/actions/automations/automation-actions"
import { MultiSiteChartCard } from "./MultiSiteChartCard"
import { SiteTrendSparkline } from "./SiteTrendSparkline"

// Multi-site admin dashboard (from the imported "Multi-site Dashboard" design, direction 1b):
// combined stats + chart, Automations and Notifications panels, and a dense sortable sites
// table — built on the app's existing chart and table patterns.

interface MultiSiteDashboardProps {
  sites: Site[]
  metrics: MultiSiteDashboardData
  notifications: { items: HubNotificationItem[]; unreadCount: number }
  automationRuns: DashboardAutomationRun[]
}

type StatusFilter = "all" | "active" | "inactive" | "draft"
type SiteSortColumn = "name" | "visitors" | "revenue" | "contacts" | "orders"

// Exactly the design's four ranges.
const rangeOptions: Array<{ value: DashboardRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "Month" },
  { value: "365d", label: "Year" },
]

// Letter-avatar palette from the design, picked deterministically per site.
const AVATAR_COLORS = [
  "#0f766e", "#1d4ed8", "#b45309", "#4338ca", "#9f1239", "#047857", "#0e7490",
  "#7c2d12", "#6d28d9", "#a16207", "#be123c", "#15803d", "#334155", "#3f3f46",
]

function siteAvatarColor(siteId: string) {
  let hash = 0
  for (let i = 0; i < siteId.length; i++) hash = (hash * 31 + siteId.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// Status pill (colored dot + label) from the design.
const STATUS_DISPLAY: Record<string, { label: string; dotClass: string }> = {
  active: { label: "Live", dotClass: "bg-green-500" },
  draft: { label: "Draft", dotClass: "bg-amber-500" },
  inactive: { label: "Inactive", dotClass: "bg-red-500" },
  suspended: { label: "Suspended", dotClass: "bg-red-500" },
}

const RUN_STATUS_META: Record<DashboardAutomationRun["status"], {
  label: string
  icon: typeof Check
  iconClass: string
  labelClass: string
}> = {
  success: { label: "Success", icon: Check, iconClass: "bg-green-100 text-green-700", labelClass: "text-green-600" },
  running: { label: "Running", icon: RefreshCw, iconClass: "bg-blue-100 text-blue-700", labelClass: "text-blue-600" },
  failed: { label: "Failed", icon: TriangleAlert, iconClass: "bg-red-100 text-red-700", labelClass: "text-red-600" },
  partial: { label: "Partial", icon: TriangleAlert, iconClass: "bg-amber-100 text-amber-700", labelClass: "text-amber-600" },
  noop: { label: "Skipped", icon: Minus, iconClass: "bg-muted text-muted-foreground", labelClass: "text-muted-foreground" },
}

const NOTIFICATION_ICONS: Record<HubNotificationType, typeof Bell> = {
  product_order: ShoppingCart,
  directory_claim: ShieldCheck,
  directory_owner_edit: ShieldCheck,
  directory_featured: ShoppingCart,
  newsletter_paused: TriangleAlert,
}

const TRIGGER_LABELS: Record<string, string> = {
  schedule: "Scheduled",
  manual: "Manual",
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function getSiteTag(site: Site) {
  return typeof site.settings?.site_tag === "string" ? site.settings.site_tag.trim() : ""
}

function relativeTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function getStatusPill(status: string) {
  const display = STATUS_DISPLAY[status] ?? { label: status, dotClass: "bg-amber-500" }
  return (
    <Badge variant="secondary" className="gap-1.5 rounded-full font-semibold">
      <span className={`size-[7px] rounded-full ${display.dotClass}`} aria-hidden="true" />
      {display.label}
    </Badge>
  )
}

function DashboardRangeDropdown({ value }: { value: DashboardRange }) {
  const selectedOption = rangeOptions.find((option) => option.value === value) ?? rangeOptions[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-28 justify-between">
          {selectedOption.label}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {rangeOptions.map((option) => (
          <DropdownMenuItem key={option.value} asChild>
            <Link className="justify-between" href={`/admin?range=${option.value}`} scroll={false}>
              {option.label}
              {option.value === value ? <Check className="h-4 w-4" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DashboardRangeTabs({ value }: { value: DashboardRange }) {
  return (
    <Tabs value={value}>
      <TabsList className="h-8">
        {rangeOptions.map((option) => (
          <TabsTrigger key={option.value} value={option.value} asChild className="h-6 px-2 text-sm">
            <Link href={`/admin?range=${option.value}`} scroll={false}>
              {option.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function PanelEmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-6 text-center text-sm text-muted-foreground">{children}</p>
}

export function MultiSiteDashboard({ sites, metrics, notifications, automationRuns }: MultiSiteDashboardProps) {
  const router = useRouter()
  const [notifFilter, setNotifFilter] = useState<"unread" | "all">("all")
  const [autoFilter, setAutoFilter] = useState<"all" | "attention">("all")
  const [tagFilter, setTagFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  // Local override instead of copied state so server refreshes keep flowing through props.
  const [readAllAt, setReadAllAt] = useState<string | null>(null)
  const [markingRead, setMarkingRead] = useState(false)
  const siteSort = useAdminSort<SiteSortColumn>()

  const attentionRuns = automationRuns.filter((run) => run.status === "failed" || run.status === "partial")
  const visibleRuns = autoFilter === "attention" ? attentionRuns : automationRuns

  const notifItems = useMemo(() => {
    const items = readAllAt
      ? notifications.items.map((item) => (item.read_at ? item : { ...item, read_at: readAllAt }))
      : notifications.items
    return notifFilter === "unread" ? items.filter((item) => !item.read_at) : items
  }, [notifications.items, notifFilter, readAllAt])
  const unreadCount = readAllAt ? 0 : notifications.unreadCount

  const perSiteMap = useMemo(
    () => new Map(metrics.perSite.map((entry) => [entry.siteId, entry])),
    [metrics.perSite]
  )

  const siteRows = useMemo(() => sites.map((site) => {
    const entry = perSiteMap.get(site.id)
    return {
      site,
      tag: getSiteTag(site),
      visitors: entry?.visitors ?? 0,
      revenue: entry?.revenue ?? 0,
      contacts: entry?.contacts ?? 0,
      orders: entry?.orders ?? 0,
      sparkline: entry?.sparkline ?? [],
    }
  }), [sites, perSiteMap])

  const siteTags = useMemo(
    () => Array.from(new Set(siteRows.map((row) => row.tag).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [siteRows]
  )

  const filteredRows = siteRows.filter((row) =>
    (statusFilter === "all" || row.site.status === statusFilter) &&
    (tagFilter === "all" || row.tag === tagFilter)
  )
  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!siteSort.sortColumn) return 0
    const dir = siteSort.sortDirection === "asc" ? 1 : -1
    if (siteSort.sortColumn === "name") return a.site.name.localeCompare(b.site.name) * dir
    return (a[siteSort.sortColumn] - b[siteSort.sortColumn]) * dir
  })

  const handleMarkAllRead = async () => {
    if (markingRead) return
    setMarkingRead(true)
    try {
      const { readAt } = await markAllHubNotificationsReadForUser()
      setReadAllAt(readAt)
    } catch {
      showActionError("Failed to mark notifications as read")
    } finally {
      setMarkingRead(false)
    }
  }

  return (
    <CardGroup className="grid w-full min-w-0 gap-3">
      <MultiSiteChartCard
        metrics={metrics}
        rangeControl={
          <>
            <div className="sm:hidden">
              <DashboardRangeDropdown value={metrics.range} />
            </div>
            <div className="hidden sm:block">
              <DashboardRangeTabs value={metrics.range} />
            </div>
          </>
        }
      />

      <CardGroup className="grid gap-3 lg:grid-cols-2">
        <Card className="flex min-w-0 flex-col rounded-xl">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Automations</CardTitle>
            <Tabs value={autoFilter} onValueChange={(value) => setAutoFilter(value as "all" | "attention")}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="h-6 px-2 text-xs sm:text-sm">
                  All ({automationRuns.length})
                </TabsTrigger>
                <TabsTrigger value="attention" className="h-6 px-2 text-xs sm:text-sm">
                  Attention ({attentionRuns.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <div className="flex flex-1 flex-col gap-0.5 border-t p-2">
            {visibleRuns.length === 0 ? (
              <PanelEmptyState>
                {autoFilter === "attention" ? "Nothing needs attention." : "No automation runs yet."}
              </PanelEmptyState>
            ) : (
              visibleRuns.map((run) => {
                const meta = RUN_STATUS_META[run.status] ?? RUN_STATUS_META.noop
                const StatusIcon = meta.icon
                return (
                  <button
                    key={run.runId}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50"
                    onClick={() => router.push(`/admin/automations/${run.automationId}`)}
                  >
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${meta.iconClass}`}>
                      <StatusIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{run.name}</span>
                      <span className="block text-xs text-muted-foreground">{run.message}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {run.siteName} · {TRIGGER_LABELS[run.triggerType] ?? run.triggerType} · {relativeTime(run.startedAt)}
                      </span>
                    </span>
                    <span className={`shrink-0 whitespace-nowrap text-xs font-medium ${meta.labelClass}`}>
                      {meta.label}
                    </span>
                  </button>
                )
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t p-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/automations">
                <Zap className="h-4 w-4" />
                View all automations
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/automations">
                <Plus className="h-4 w-4" />
                New
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="flex min-w-0 flex-col rounded-xl">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Notifications</CardTitle>
            <Tabs value={notifFilter} onValueChange={(value) => setNotifFilter(value as "unread" | "all")}>
              <TabsList className="h-8">
                <TabsTrigger value="unread" className="h-6 px-2 text-xs sm:text-sm">
                  Unread ({unreadCount})
                </TabsTrigger>
                <TabsTrigger value="all" className="h-6 px-2 text-xs sm:text-sm">
                  View all
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <div className="flex flex-1 flex-col gap-0.5 border-t p-2">
            {notifItems.length === 0 ? (
              <PanelEmptyState>
                {notifFilter === "unread" ? "No unread notifications." : "No notifications yet."}
              </PanelEmptyState>
            ) : (
              notifItems.map((item) => {
                const NotificationIcon = NOTIFICATION_ICONS[item.type] ?? Bell
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50"
                    onClick={() => router.push(item.target_href)}
                  >
                    <span
                      className={`mt-3.5 size-2 shrink-0 rounded-full ${item.read_at ? "bg-transparent" : "bg-red-500"}`}
                      aria-hidden="true"
                    />
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <NotificationIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">{item.message}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.site_name} · {relativeTime(item.created_at)}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} disabled={markingRead}>
              <CheckCheck className="h-4 w-4" />
              {markingRead ? "Marking..." : "Mark all as read"}
            </Button>
          </div>
        </Card>
      </CardGroup>

      <AdminTableShell
        title="Your sites"
        icon={<Globe className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filteredRows.length}
        controls={
          <TableRightActions>
            {siteTags.length > 0 && (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <TableRightActionsSelectTrigger aria-label="Site tag filter">
                  <SelectValue />
                </TableRightActionsSelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {siteTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <TableRightActionsSelectTrigger aria-label="Site status filter">
                <SelectValue />
              </TableRightActionsSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Live</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <TableRightActionsButton asChild>
              <Link href="/admin/sites?create=1">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New site</span>
              </Link>
            </TableRightActionsButton>
          </TableRightActions>
        }
        footer={<AdminTableSummaryFooter count={filteredRows.length} label="sites" />}
      >
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead column="meta">Status</TableHead>
                <TableHead column="main">
                  <AdminSortButton
                    active={siteSort.sortColumn === "name"}
                    direction={siteSort.sortDirection}
                    onClick={() => siteSort.toggleSort("name")}
                  >
                    Site
                  </AdminSortButton>
                </TableHead>
                <TableHead column="meta">
                  <AdminSortButton
                    active={siteSort.sortColumn === "visitors"}
                    direction={siteSort.sortDirection}
                    onClick={() => siteSort.toggleSort("visitors")}
                  >
                    Visitors
                  </AdminSortButton>
                </TableHead>
                <TableHead column="meta">
                  <AdminSortButton
                    active={siteSort.sortColumn === "revenue"}
                    direction={siteSort.sortDirection}
                    onClick={() => siteSort.toggleSort("revenue")}
                  >
                    Revenue
                  </AdminSortButton>
                </TableHead>
                <TableHead column="meta">
                  <AdminSortButton
                    active={siteSort.sortColumn === "contacts"}
                    direction={siteSort.sortDirection}
                    onClick={() => siteSort.toggleSort("contacts")}
                  >
                    Contacts
                  </AdminSortButton>
                </TableHead>
                <TableHead column="meta">
                  <AdminSortButton
                    active={siteSort.sortColumn === "orders"}
                    direction={siteSort.sortDirection}
                    onClick={() => siteSort.toggleSort("orders")}
                  >
                    Orders
                  </AdminSortButton>
                </TableHead>
                <TableHead column="meta">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Globe className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                    <p className="mb-4 text-muted-foreground">
                      {sites.length === 0 ? "No sites found" : "No matching sites found"}
                    </p>
                    <Button asChild variant="outline">
                      <Link href="/admin/sites?create=1">
                        {sites.length === 0 ? "Create Your First Site" : "Create Site"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((row) => (
                  <TableRow key={row.site.id} className="group">
                    <TableCell column="meta">{getStatusPill(row.site.status)}</TableCell>
                    <TableCell column="main">
                      <Link
                        href={`/admin/sites/${row.site.id}/dashboard`}
                        className="flex min-w-0 items-center gap-3 transition-opacity hover:opacity-80"
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[15px] font-bold text-white"
                          style={{ background: row.site.settings?.favicon ? "var(--muted)" : siteAvatarColor(row.site.id) }}
                        >
                          {row.site.settings?.favicon ? (
                            <img
                              src={row.site.settings.favicon}
                              alt={`${row.site.name} favicon`}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            (row.site.name.charAt(0) || "S").toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <h4 className="truncate text-sm font-semibold hover:underline">
                              {row.site.name}
                            </h4>
                            {row.tag && <Badge variant="secondary">{row.tag}</Badge>}
                          </div>
                          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Globe className="size-3 shrink-0" />
                            <span className="truncate">{row.site.custom_domain || row.site.subdomain}</span>
                          </p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell column="meta" className="text-sm font-semibold">
                      {row.visitors.toLocaleString()}
                    </TableCell>
                    <TableCell column="meta" className="text-sm font-semibold">
                      {row.revenue === 0 ? "—" : currencyFormatter.format(row.revenue)}
                    </TableCell>
                    <TableCell column="meta" className="text-sm font-semibold">
                      {row.contacts.toLocaleString()}
                    </TableCell>
                    <TableCell column="meta" className="text-sm font-semibold">
                      {row.orders === 0 ? "—" : row.orders.toLocaleString()}
                    </TableCell>
                    <TableCell column="meta">
                      <div className="h-8 w-[140px]">
                        <SiteTrendSparkline values={row.sparkline} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </AdminTableShell>
    </CardGroup>
  )
}
