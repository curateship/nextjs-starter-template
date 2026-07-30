import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ActivityIcon,
  BellIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { ConfirmDeleteDialog } from "@/components/feedback-shared"
import { SortHeaderRow, type SortDir } from "@/components/scanner/sort-head"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  createMarketScannerRule,
  deleteAllMarketScannerAlerts,
  deleteMarketScannerRule,
  loadMarketScannerAlertsPage,
  loadMarketScannerRulesPage,
  markAllMarketScannerAlertsRead,
  markMarketScannerAlertRead,
  updateMarketScannerRule,
} from "@/lib/api/market-scanner"
import {
  MARKET_SCANNER_COOLDOWNS,
  MARKET_SCANNER_WINDOWS,
  marketScannerTradeTarget,
  type MarketScannerAlertItem,
  type MarketScannerCooldown,
  type MarketScannerRuleInput,
  type MarketScannerRuleItem,
  type MarketScannerWindow,
} from "@/lib/market-scanner"
import { useVisibleInterval } from "@/lib/use-visible-interval"

const POLL_MS = 10_000
const ALERT_PAGE_SIZE = 25

type RulesPage = Awaited<ReturnType<typeof loadMarketScannerRulesPage>>
type AlertsPage = Awaited<ReturnType<typeof loadMarketScannerAlertsPage>>
type RuleSort =
  | "name"
  | "condition"
  | "markets"
  | "window"
  | "cooldown"
  | "status"
  | "lastAlert"
type AlertSort = "coin" | "alert" | "observed" | "window" | "time" | "status"

const RULE_COLUMNS = [
  { key: "name", label: "Rule", main: true },
  { key: "condition", label: "Condition" },
  { key: "markets", label: "Markets" },
  { key: "window", label: "Window" },
  { key: "cooldown", label: "Cooldown" },
  { key: "status", label: "Status" },
  { key: "lastAlert", label: "Last alert" },
] as const

const ALERT_COLUMNS = [
  { key: "coin", label: "Market", main: true },
  { key: "alert", label: "Alert" },
  { key: "observed", label: "Observed" },
  { key: "window", label: "Window" },
  { key: "time", label: "Time" },
  { key: "status", label: "Status" },
] as const

export function MarketScannerDashboard({ initial }: { initial: RulesPage }) {
  const [data, setData] = useState(initial)
  const [editing, setEditing] = useState<MarketScannerRuleItem | null | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [ruleSort, setRuleSort] = useState<{ sortBy: RuleSort; dir: SortDir }>({
    sortBy: "name",
    dir: "asc",
  })
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported")

  useEffect(() => {
    queueMicrotask(() => {
      setNotificationPermission(
        "Notification" in window ? Notification.permission : "unsupported"
      )
    })
  }, [])
  useVisibleInterval(async () => {
    setData(await loadMarketScannerRulesPage())
  }, POLL_MS)

  const rules = useMemo(
    () => sortRules(data.rules, ruleSort.sortBy, ruleSort.dir),
    [data.rules, ruleSort]
  )
  const scannerStale = data.rules.some((rule) =>
    rule.enabled && rule.lastEvaluatedAt && data.checkedAt - new Date(rule.lastEvaluatedAt).getTime() > 120_000
  )

  async function refresh() {
    setData(await loadMarketScannerRulesPage())
  }

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) return
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  return (
    <div className="grid w-full gap-3">
      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {!data.marketsAvailable ? (
        <div role="status" className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
          The market list is temporarily unavailable. Retrying automatically.
        </div>
      ) : null}

      <DashboardTable
        title="Market scanner"
        icon={<ActivityIcon className="text-muted-foreground" />}
        count={rules.length}
        status={!data.runtimeEnabled
          ? { tone: "neutral", text: "Scanner off" }
          : data.paused
            ? null
            : !data.workerOnline
            ? { tone: "error", text: "Scanner offline" }
          : scannerStale
            ? { tone: "error", text: "Worker stale" }
            : { tone: "success", text: "Watching mainnet" }}
        controls={
          <>
            {notificationPermission !== "granted" && notificationPermission !== "unsupported" ? (
              <DashboardToolbarButton type="button" variant="outline" onClick={() => void enableBrowserAlerts()}>
                <BellIcon className="size-4" />
                Enable browser alerts
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarButton type="button" onClick={() => setEditing(null)}>
              <PlusIcon className="size-4" />
              New rule
            </DashboardToolbarButton>
          </>
        }
        header={<SortHeaderRow columns={RULE_COLUMNS} activeKey={ruleSort.sortBy} dir={ruleSort.dir} onSort={setRuleSort} />}
        isEmpty={rules.length === 0}
        emptyText="No rules yet. Create one to watch price moves or unusual volume."
        emptyColSpan={7}
        footer={{ type: "summary", count: rules.length }}
      >
        {rules.map((rule) => (
          <TableRow key={rule.id} onClick={() => setEditing(rule)}>
            <TableCell column="main">
              <div className="font-medium">{rule.name}</div>
              <div className="text-xs text-muted-foreground">{rule.kind === "price_move" ? "Price move" : "Volume spike"}</div>
            </TableCell>
            <TableCell column="meta">{ruleCondition(rule)}</TableCell>
            <TableCell column="meta">{rule.marketScope === "all" ? "All markets" : `${rule.markets.length} selected`}</TableCell>
            <TableCell column="meta">{rule.window}</TableCell>
            <TableCell column="meta">{rule.cooldown}</TableCell>
            <TableCell column="meta"><Badge variant={data.runtimeEnabled && !data.paused && rule.enabled && data.workerOnline && !scannerStale && rule.lastEvaluatedAt ? "default" : "secondary"}>{ruleStatus(rule, data.runtimeEnabled, data.paused, data.workerOnline, scannerStale)}</Badge></TableCell>
            <TableCell column="mutedMeta">{formatTime(rule.lastTriggeredAt)}</TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {editing !== undefined ? (
        <RuleDialog
          key={editing?.id ?? "new"}
          open
          rule={editing ?? null}
          markets={data.markets}
          onOpenChange={(open) => { if (!open) setEditing(undefined) }}
          onSaved={async () => { setEditing(undefined); setError(null); await refresh() }}
          onError={(message) => setError(message)}
        />
      ) : null}
    </div>
  )
}

export function MarketScannerAlertsDashboard({ initial }: { initial: AlertsPage }) {
  const navigate = useNavigate()
  const [data, setData] = useState(initial)
  const [loadingMore, setLoadingMore] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alertSort, setAlertSort] = useState<{ sortBy: AlertSort; dir: SortDir }>({
    sortBy: "time",
    dir: "desc",
  })
  const alerts = useMemo(
    () => sortAlerts(data.alerts, alertSort.sortBy, alertSort.dir),
    [data.alerts, alertSort]
  )

  useVisibleInterval(async () => {
    const latest = await loadMarketScannerAlertsPage(ALERT_PAGE_SIZE)
    setData((current) => ({
      ...latest,
      alerts: mergeAlerts(latest.alerts, current.alerts),
      nextCursor:
        current.alerts.length > ALERT_PAGE_SIZE
          ? current.nextCursor
          : latest.nextCursor,
    }))
  }, POLL_MS)

  async function loadMore() {
    if (!data.nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await loadMarketScannerAlertsPage(
        ALERT_PAGE_SIZE,
        data.nextCursor
      )
      setData((current) => ({
        ...current,
        alerts: mergeAlerts(current.alerts, next.alerts),
        unreadCount: next.unreadCount,
        nextCursor: next.nextCursor,
      }))
    } finally {
      setLoadingMore(false)
    }
  }

  async function markRead(alert: MarketScannerAlertItem) {
    if (alert.readAt) return
    const result = await markMarketScannerAlertRead(alert.id)
    setData((current) => ({
      ...current,
      unreadCount: Math.max(0, current.unreadCount - 1),
      alerts: current.alerts.map((item) =>
        item.id === alert.id ? { ...item, readAt: result.readAt } : item
      ),
    }))
  }

  async function markAllRead() {
    const result = await markAllMarketScannerAlertsRead()
    const ids = new Set(result.ids)
    setData((current) => ({
      ...current,
      unreadCount: 0,
      alerts: current.alerts.map((alert) =>
        ids.has(alert.id) ? { ...alert, readAt: result.readAt } : alert
      ),
    }))
  }

  async function clearAll() {
    setClearing(true)
    setError(null)
    try {
      await deleteAllMarketScannerAlerts()
      setData((current) => ({
        ...current,
        alerts: [],
        unreadCount: 0,
        nextCursor: null,
      }))
      setConfirmClearOpen(false)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setClearing(false)
    }
  }

  function openTrade(alert: MarketScannerAlertItem) {
    void markRead(alert).catch(() => {})
    void navigate(marketScannerTradeTarget(alert.coin))
  }

  return (
    <div className="grid w-full gap-3">
      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <DashboardTable
        title="Market alerts"
        icon={<BellIcon className="text-muted-foreground" />}
        count={alerts.length}
        controls={alerts.length > 0 ? (
          <>
            {data.unreadCount > 0 ? (
              <DashboardToolbarButton type="button" variant="outline" onClick={() => void markAllRead()}>
                Mark all read
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarButton type="button" variant="destructive" disabled={clearing} onClick={() => setConfirmClearOpen(true)}>
              <Trash2Icon className="size-4" />
              {clearing ? "Clearing…" : "Clear all"}
            </DashboardToolbarButton>
          </>
        ) : undefined}
        header={<SortHeaderRow columns={ALERT_COLUMNS} activeKey={alertSort.sortBy} dir={alertSort.dir} onSort={setAlertSort} />}
        isEmpty={alerts.length === 0}
        emptyText="No alerts yet. Alerts appear after a rule resets and crosses its threshold."
        emptyColSpan={6}
        footer={{
          type: "loadMore",
          count: alerts.length,
          hasMore: Boolean(data.nextCursor),
          loading: loadingMore,
          onLoadMore: () => void loadMore(),
        }}
      >
        {alerts.map((alert) => (
          <TableRow key={alert.id} onClick={() => openTrade(alert)}>
            <TableCell column="main"><span className="font-medium">{alert.coin}</span></TableCell>
            <TableCell column="meta">
              <button
                type="button"
                className="block w-full text-left hover:underline"
                onClick={(event) => {
                  event.stopPropagation()
                  openTrade(alert)
                }}
              >
                <span className="block font-medium">{alert.title}</span>
                <span className="block text-xs text-muted-foreground">{alert.ruleName}</span>
              </button>
            </TableCell>
            <TableCell column="meta" className="font-mono text-xs tabular-nums">{formatObserved(alert)}</TableCell>
            <TableCell column="meta">{alert.window}</TableCell>
            <TableCell column="mutedMeta">{formatTime(alert.occurredAt)}</TableCell>
            <TableCell column="meta"><Badge variant={alert.readAt ? "secondary" : "default"}>{alert.readAt ? "Read" : "New"}</Badge></TableCell>
          </TableRow>
        ))}
      </DashboardTable>
      <ConfirmDeleteDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Delete all market alerts?"
        body="Every market alert in your history will be permanently deleted."
        deleting={clearing}
        onConfirm={() => void clearAll()}
      />
    </div>
  )
}

type RuleDraft = {
  name: string
  kind: "price_move" | "volume_spike"
  direction: "up" | "down"
  threshold: string
  marketScope: "all" | "selected"
  markets: string[]
  window: MarketScannerWindow
  cooldown: MarketScannerCooldown
  enabled: boolean
}

function RuleDialog({ open, rule, markets, onOpenChange, onSaved, onError }: {
  open: boolean
  rule: MarketScannerRuleItem | null
  markets: string[]
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
  onError: (message: string) => void
}) {
  const [draft, setDraft] = useState<RuleDraft>(() => draftFor(rule))
  const [marketSearch, setMarketSearch] = useState("")
  const [saving, setSaving] = useState(false)

  const visibleMarkets = markets.filter((market) => market.toLowerCase().includes(marketSearch.trim().toLowerCase()))

  async function save() {
    const threshold = Number(draft.threshold)
    const input: MarketScannerRuleInput = draft.kind === "price_move"
      ? { ...draft, threshold, direction: draft.direction }
      : {
          name: draft.name,
          kind: "volume_spike",
          threshold,
          marketScope: draft.marketScope,
          markets: draft.markets,
          window: draft.window,
          cooldown: draft.cooldown,
          enabled: draft.enabled,
        }
    setSaving(true)
    try {
      if (rule) await updateMarketScannerRule(rule.id, input)
      else await createMarketScannerRule(input)
      await onSaved()
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!rule || !window.confirm(`Delete “${rule.name}”? Its alert history will be kept.`)) return
    setSaving(true)
    try {
      await deleteMarketScannerRule(rule.id)
      await onSaved()
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit scanner rule" : "New scanner rule"}</DialogTitle>
          <DialogDescription>Watch Hyperliquid mainnet and alert when this condition crosses its threshold.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Label htmlFor="scanner-rule-name">Name</Label>
              <Input id="scanner-rule-name" autoFocus maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Condition</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Condition" value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind: kind as RuleDraft["kind"] })} options={[{ value: "price_move", label: "Price move" }, { value: "volume_spike", label: "Volume spike" }]} />
              {draft.kind === "price_move" ? (
                <SelectField label="Direction" value={draft.direction} onValueChange={(direction) => setDraft({ ...draft, direction: direction as RuleDraft["direction"] })} options={[{ value: "up", label: "Up" }, { value: "down", label: "Down" }]} />
              ) : <div />}
              <div className="grid gap-2">
                <Label htmlFor="scanner-rule-threshold">{draft.kind === "volume_spike" ? "Times normal volume" : "Move percent"}</Label>
                <Input id="scanner-rule-threshold" type="number" min={draft.kind === "volume_spike" ? 1.1 : 0.1} max={100} step={0.1} value={draft.threshold} onChange={(event) => setDraft({ ...draft, threshold: event.target.value })} />
              </div>
              <SelectField label="Time window" value={draft.window} onValueChange={(window) => setDraft({ ...draft, window: window as MarketScannerWindow })} options={MARKET_SCANNER_WINDOWS.map((value) => ({ value, label: value }))} />
              <SelectField label="Cooldown" value={draft.cooldown} onValueChange={(cooldown) => setDraft({ ...draft, cooldown: cooldown as MarketScannerCooldown })} options={MARKET_SCANNER_COOLDOWNS.map((value) => ({ value, label: value }))} />
              <SelectField label="Markets" value={draft.marketScope} onValueChange={(marketScope) => setDraft({ ...draft, marketScope: marketScope as RuleDraft["marketScope"] })} options={[{ value: "all", label: "All markets" }, { value: "selected", label: "Selected markets" }]} />
            </CardContent>
          </Card>

          {draft.marketScope === "selected" ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Choose markets</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="scanner-market-search">Search</Label>
                  <span className="text-xs text-muted-foreground">{draft.markets.length} selected</span>
                </div>
                <Input id="scanner-market-search" placeholder="Search markets" value={marketSearch} onChange={(event) => setMarketSearch(event.target.value)} />
                <ScrollArea className="h-48 rounded-lg border bg-card">
                  <div className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-4">
                    {visibleMarkets.map((market) => (
                      <label key={market} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                        <Checkbox checked={draft.markets.includes(market)} onCheckedChange={(checked) => setDraft({ ...draft, markets: checked ? [...draft.markets, market] : draft.markets.filter((item) => item !== market) })} />
                        {market}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : null}

          <Card size="sm">
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled: enabled === true })} />
                <span className="text-sm font-medium">Rule enabled</span>
              </label>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter className="justify-between">
          <div>{rule ? <Button type="button" variant="destructive" disabled={saving} onClick={() => void remove()}>Delete</Button> : null}</div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save rule"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SelectField({ label, value, onValueChange, options }: { label: string; value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

function draftFor(rule: MarketScannerRuleItem | null): RuleDraft {
  return rule ? {
    name: rule.name,
    kind: rule.kind,
    direction: rule.direction ?? "up",
    threshold: String(rule.threshold),
    marketScope: rule.marketScope,
    markets: rule.markets,
    window: rule.window,
    cooldown: rule.cooldown,
    enabled: rule.enabled,
  } : {
    name: "",
    kind: "price_move",
    direction: "up",
    threshold: "5",
    marketScope: "all",
    markets: [],
    window: "15m",
    cooldown: "1h",
    enabled: true,
  }
}

function sortRules(items: MarketScannerRuleItem[], key: RuleSort, dir: SortDir) {
  return [...items].sort((a, b) => compare(ruleSortValue(a, key), ruleSortValue(b, key), dir))
}

function ruleSortValue(rule: MarketScannerRuleItem, key: RuleSort): string | number {
  if (key === "condition") return `${rule.kind}:${rule.direction ?? ""}:${rule.threshold}`
  if (key === "markets") return rule.marketScope === "all" ? 9999 : rule.markets.length
  if (key === "status") return rule.enabled ? 1 : 0
  if (key === "lastAlert") return rule.lastTriggeredAt ?? ""
  return rule[key]
}

function sortAlerts(items: MarketScannerAlertItem[], key: AlertSort, dir: SortDir) {
  return [...items].sort((a, b) => compare(alertSortValue(a, key), alertSortValue(b, key), dir))
}

function alertSortValue(alert: MarketScannerAlertItem, key: AlertSort): string | number {
  if (key === "alert") return alert.title
  if (key === "time") return alert.occurredAt
  if (key === "status") return alert.readAt ? 0 : 1
  return alert[key]
}

function compare(a: string | number, b: string | number, dir: SortDir) {
  const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })
  return dir === "asc" ? result : -result
}

function ruleCondition(rule: MarketScannerRuleItem) {
  return rule.kind === "volume_spike" ? `${rule.threshold}× normal` : `${rule.direction === "down" ? "Falls" : "Rises"} ${rule.threshold}%`
}

function ruleStatus(rule: MarketScannerRuleItem, runtimeEnabled: boolean, paused: boolean, workerOnline: boolean, scannerStale: boolean) {
  if (!rule.enabled) return "Off"
  if (!runtimeEnabled) return "Scanner off"
  if (paused) return "Paused"
  if (!workerOnline) return "Offline"
  if (scannerStale) return "Stale"
  return rule.lastEvaluatedAt ? "Active" : "Warming up"
}

function formatObserved(alert: MarketScannerAlertItem) {
  return alert.kind === "volume_spike" ? `${alert.observed.toFixed(1)}×` : `${alert.observed > 0 ? "+" : ""}${alert.observed.toFixed(2)}%`
}

function mergeAlerts(
  first: MarketScannerAlertItem[],
  second: MarketScannerAlertItem[]
) {
  return [...new Map([...first, ...second].map((alert) => [alert.id, alert])).values()]
}

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong."
}
