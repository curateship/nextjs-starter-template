import * as React from "react"
import {
  PhoneIncomingIcon,
  PhoneIcon,
  PhoneOutgoingIcon,
} from "lucide-react"

import { ErrorAlert } from "@/components/error-alert"

import { Badge } from "@/components/ui/badge"
import { CallDetailModal } from "@/components/call-detail-modal"
import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarSelectTrigger } from "@/components/dashboard-toolbar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getCallErrorMessage,
  listCalls,
  pollCalls,
  type CallItem,
} from "@/lib/api/calls"
import {
  CALL_STATUS_LABELS,
  callStatusBadgeVariant,
  formatCallDuration,
} from "@/lib/call-format"

const pageSizeOptions = [10, 20, 50]
const POLL_INTERVAL_MS = 3000

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Completed" },
  { value: "failed", label: "Failed" },
]

// Call log: every outbound/inbound call with live status, recording and
// transcript in the detail sheet. Polls while any call is still active.
export function CallsDashboard() {
  const [calls, setCalls] = React.useState<CallItem[]>([])
  const [hasActive, setHasActive] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [detailCallId, setDetailCallId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    listCalls()
      .then((data) => {
        if (!active) return
        setCalls(data.calls)
        setHasActive(data.has_active)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getCallErrorMessage(loadError))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // While calls are live, refresh provider state every few seconds.
  React.useEffect(() => {
    if (!hasActive) return
    const timer = setInterval(() => {
      pollCalls()
        .then((data) => {
          setCalls(data.calls)
          setHasActive(data.has_active)
        })
        .catch(() => {
          // Transient poll failures resolve on the next tick; the page keeps
          // showing the last known state.
        })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [hasActive])

  const filteredCalls = React.useMemo(() => {
    if (statusFilter === "all") return calls
    if (statusFilter === "active") {
      return calls.filter((call) => call.status !== "ended" && call.status !== "failed")
    }
    return calls.filter((call) => call.status === statusFilter)
  }, [calls, statusFilter])

  const totalPages = Math.ceil(filteredCalls.length / pageSize)
  const paginatedCalls = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredCalls.slice(start, start + pageSize)
  }, [currentPage, filteredCalls, pageSize])

  const controls = (
    <Select
      value={statusFilter}
      onValueChange={(value) => {
        setStatusFilter(value)
        setCurrentPage(1)
      }}
    >
      <DashboardToolbarSelectTrigger aria-label="Filter by status">
        <SelectValue />
      </DashboardToolbarSelectTrigger>
      <SelectContent>
        {STATUS_FILTERS.map((filter) => (
          <SelectItem key={filter.value} value={filter.value}>
            {filter.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="w-full pb-8">
      {error ? (
        <ErrorAlert className="mb-4" message={error} />
      ) : null}

      <DashboardTable
        title="Calls"
        icon={<PhoneIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filteredCalls.length}
        controls={controls}
        status={hasActive ? { tone: "success", text: "Live" } : undefined}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Contact</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta">Agent</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Campaign
              </TableHead>
              <TableHead column="meta">Duration</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Cost
              </TableHead>
              <TableHead column="meta">Time</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && paginatedCalls.length === 0}
        emptyText="No calls yet. Test-call an agent from its editor, or launch a campaign."
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: filteredCalls.length,
          totalPages,
          pageSizeOptions,
          onPageChange: (page: number) =>
            setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))),
          onPageSizeChange: (size: number) => {
            setPageSize(size)
            setCurrentPage(1)
          },
        }}
      >
        {paginatedCalls.map((call) => (
          <CallTableRow
            key={call.id}
            call={call}
            onOpen={() => setDetailCallId(call.id)}
          />
        ))}
      </DashboardTable>

      <CallDetailModal
        callId={detailCallId}
        onOpenChange={(open) => !open && setDetailCallId(null)}
      />
    </div>
  )
}

function CallTableRow({ call, onOpen }: { call: CallItem; onOpen: () => void }) {
  const DirectionIcon =
    call.direction === "inbound" ? PhoneIncomingIcon : PhoneOutgoingIcon
  return (
    <TableRow className="group">
      <TableCell column="main">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={onOpen}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <DirectionIcon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <span className="block max-w-full truncate font-medium group-hover:underline">
              {call.contact_name ?? call.customer_number}
            </span>
            {call.contact_name ? (
              <span className="block truncate text-xs text-muted-foreground">
                {call.customer_number}
              </span>
            ) : null}
          </div>
        </button>
      </TableCell>
      <TableCell column="meta">
        <Badge variant={callStatusBadgeVariant(call.status)}>
          {CALL_STATUS_LABELS[call.status] ?? call.status}
        </Badge>
      </TableCell>
      <TableCell column="meta">{call.agent_name ?? "—"}</TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {call.campaign_name ?? "—"}
      </TableCell>
      <TableCell column="meta">{formatCallDuration(call.duration_seconds) ?? "—"}</TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {call.cost != null ? `$${call.cost.toFixed(2)}` : "—"}
      </TableCell>
      <TableCell column="mutedMeta">
        {dateTimeFormatter.format(new Date(call.started_at ?? call.created_at))}
      </TableCell>
    </TableRow>
  )
}
