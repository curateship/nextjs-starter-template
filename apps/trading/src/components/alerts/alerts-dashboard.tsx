import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  BellIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

import {
  AlertDialog,
  type EditableAlertRule,
} from "@/components/alerts/alert-dialog"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { ConfirmDeleteDialog } from "@/components/feedback-shared"
import { SortHeaderRow, type SortDir } from "@/components/scanner/sort-head"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  activateAlert,
  deleteAlert,
  loadAlertsPage,
  pauseAlert,
} from "@/lib/api/alerts"
import {
  alertTradeTarget,
  type AlertKind,
  type AlertRuleItem,
  type AlertStatus,
} from "@/lib/alerts"
import { useVisibleInterval } from "@/lib/use-visible-interval"

const POLL_MS = 10_000
type AlertsPage = Awaited<ReturnType<typeof loadAlertsPage>>
type SortKey =
  | "name"
  | "market"
  | "condition"
  | "trigger"
  | "status"
  | "lastFired"
  | "updated"

const COLUMNS = [
  { key: "name", label: "Name", main: true },
  { key: "market", label: "Market" },
  { key: "condition", label: "Condition" },
  { key: "trigger", label: "Trigger" },
  { key: "status", label: "Status" },
  { key: "lastFired", label: "Last fired" },
  { key: "updated", label: "Updated" },
] as const

export function AlertsDashboard({ initial }: { initial: AlertsPage }) {
  const [data, setData] = React.useState(initial)
  const [editing, setEditing] = React.useState<EditableAlertRule | null>(null)
  const [deleting, setDeleting] = React.useState<AlertRuleItem | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [market, setMarket] = React.useState("all")
  const [kind, setKind] = React.useState<"all" | AlertKind>("all")
  const [status, setStatus] = React.useState<"all" | AlertStatus>("all")
  const [sort, setSort] = React.useState<{ sortBy: SortKey; dir: SortDir }>({
    sortBy: "updated",
    dir: "desc",
  })
  const refresh = React.useCallback(async () => {
    setData(await loadAlertsPage())
  }, [])

  useVisibleInterval(refresh, POLL_MS)

  const rows = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...data.rules]
      .filter(
        (rule) =>
          (!query ||
            rule.name.toLowerCase().includes(query) ||
            rule.coin.toLowerCase().includes(query)) &&
          (market === "all" || rule.coin === market) &&
          (kind === "all" || rule.kind === kind) &&
          (status === "all" || rule.status === status)
      )
      .sort((a, b) =>
        compare(sortValue(a, sort.sortBy), sortValue(b, sort.sortBy), sort.dir)
      )
  }, [data.rules, kind, market, search, sort, status])

  const stale = data.rules.some(
    (rule) =>
      rule.status === "active" &&
      rule.lastEvaluatedAt &&
      data.checkedAt - new Date(rule.lastEvaluatedAt).getTime() > 120_000
  )

  async function changeStatus(rule: AlertRuleItem) {
    setBusyId(rule.id)
    setError(null)
    try {
      if (rule.status === "active") await pauseAlert(rule.id)
      else await activateAlert(rule.id)
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusyId(null)
    }
  }

  async function remove() {
    if (!deleting) return
    setBusyId(deleting.id)
    setError(null)
    try {
      await deleteAlert(deleting.id)
      setDeleting(null)
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="grid w-full gap-[var(--shell-gutter,0.75rem)]">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      {!data.marketsAvailable ? (
        <div
          role="status"
          className="rounded-lg border px-3 py-2 text-sm text-muted-foreground"
        >
          The market list is temporarily unavailable. Retrying automatically.
        </div>
      ) : null}

      <DashboardTable
        title="Alerts"
        icon={
          <BellIcon className="text-muted-foreground" />
        }
        count={rows.length}
        status={
          !data.workerOnline
            ? { tone: "error", text: "Worker offline" }
            : !data.workerActive
              ? { tone: "error", text: "Worker off" }
              : stale
                ? { tone: "error", text: "Worker stale" }
                : { tone: "success", text: "Watching mainnet" }
        }
        controls={
          <>
            <DashboardToolbarSearch
              aria-label="Search alerts"
              placeholder="Search alerts"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <FilterSelect
              label="Market"
              value={market}
              onValueChange={setMarket}
              options={data.markets.map((coin) => ({
                value: coin,
                label: coin,
              }))}
            />
            <FilterSelect
              label="Type"
              value={kind}
              onValueChange={(value) => setKind(value as typeof kind)}
              options={[
                { value: "price_level", label: "Exact price" },
                { value: "price_move", label: "Price move" },
                { value: "volume_spike", label: "Unusual volume" },
                { value: "trendline", label: "Drawn line" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={status}
              onValueChange={(value) => setStatus(value as typeof status)}
              options={[
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "triggered", label: "Triggered" },
              ]}
            />
          </>
        }
        header={
          <SortHeaderRow
            columns={COLUMNS}
            activeKey={sort.sortBy}
            dir={sort.dir}
            onSort={setSort}
            trailing={<TableHead column="actions">Actions</TableHead>}
          />
        }
        isEmpty={rows.length === 0}
        emptyText={
          <span>
            No alerts match. Create one by right-clicking a price on the{" "}
            <Link
              to="/trade"
              search={{ market: "BTC" }}
              className="font-medium text-foreground underline underline-offset-2"
            >
              Trade chart
            </Link>
            .
          </span>
        }
        emptyColSpan={8}
        footer={{ type: "summary", count: rows.length }}
      >
        {rows.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell column="main">
              <Link
                {...alertTradeTarget(rule.coin)}
                className="block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="truncate font-medium">{rule.name}</div>
                <div className="text-xs text-muted-foreground">
                  {typeLabel(rule.kind)}
                </div>
              </Link>
            </TableCell>
            <TableCell column="meta">{rule.coin}</TableCell>
            <TableCell column="meta">{conditionLabel(rule)}</TableCell>
            <TableCell column="meta">{triggerLabel(rule)}</TableCell>
            <TableCell column="meta">
              <Badge
                variant={rule.status === "active" ? "default" : "secondary"}
              >
                {statusLabel(rule.status)}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta">
              {formatTime(rule.lastTriggeredAt)}
            </TableCell>
            <TableCell column="mutedMeta">
              {formatTime(rule.updatedAt)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center justify-end">
                {rule.kind !== "trendline" ? (
                  <RowButton
                    label={`Edit ${rule.name}`}
                    onClick={() => setEditing(rule)}
                  >
                    <PencilIcon className="size-4" />
                  </RowButton>
                ) : null}
                <RowButton
                  label={`${rule.status === "active" ? "Pause" : rule.status === "triggered" ? "Restart" : "Resume"} ${rule.name}`}
                  disabled={busyId === rule.id}
                  onClick={() => void changeStatus(rule)}
                >
                  {rule.status === "active" ? (
                    <PauseIcon className="size-4" />
                  ) : rule.status === "triggered" ? (
                    <RotateCcwIcon className="size-4" />
                  ) : (
                    <PlayIcon className="size-4" />
                  )}
                </RowButton>
                <RowButton
                  label={`Delete ${rule.name}`}
                  disabled={busyId === rule.id}
                  onClick={() => setDeleting(rule)}
                >
                  <Trash2Icon className="size-4" />
                </RowButton>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {editing ? (
        <AlertDialog
          key={editing.id}
          open
          alert={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete ${deleting?.name ?? "alert"}?`}
        body="The alert will be deleted. Its Alert Log history will be kept."
        deleting={Boolean(deleting && busyId === deleting.id)}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <DashboardToolbarSelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </DashboardToolbarSelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </Button>
  )
}

function sortValue(rule: AlertRuleItem, key: SortKey): string | number {
  if (key === "market") return rule.coin
  if (key === "condition") return conditionLabel(rule)
  if (key === "trigger") return triggerLabel(rule)
  if (key === "lastFired") return rule.lastTriggeredAt ?? ""
  if (key === "updated") return rule.updatedAt
  return rule[key]
}

function compare(a: string | number, b: string | number, dir: SortDir) {
  const value =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true })
  return dir === "asc" ? value : -value
}

function conditionLabel(rule: AlertRuleItem) {
  if (rule.kind === "price_level") {
    const operator =
      rule.operator === "crossing_up"
        ? "Crosses upward"
        : rule.operator === "crossing_down"
          ? "Crosses downward"
          : "Crosses"
    return `${operator} ${rule.level}`
  }
  if (rule.kind === "price_move") {
    return `${rule.direction === "up" ? "Up" : "Down"} ${rule.percent}% in ${rule.window}`
  }
  if (rule.kind === "trendline") {
    return rule.touch === "close"
      ? "1m candle closes past the drawn line"
      : "Price touches the drawn line"
  }
  return `${rule.multiplier}× volume in ${rule.window}`
}

function triggerLabel(rule: AlertRuleItem) {
  return rule.triggerMode === "once" ? "Once" : `Repeat / ${rule.cooldown}`
}

function typeLabel(kind: AlertKind) {
  return kind === "price_level"
    ? "Exact price"
    : kind === "price_move"
      ? "Price move"
      : kind === "trendline"
        ? "Drawn line"
        : "Unusual volume"
}

function statusLabel(status: AlertStatus) {
  return status === "triggered"
    ? "Triggered once"
    : status[0].toUpperCase() + status.slice(1)
}

function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Never"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The alert request failed."
}
