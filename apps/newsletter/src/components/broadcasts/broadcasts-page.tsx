import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  CopyIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { BroadcastStatusBadge } from "@/components/broadcasts/broadcast-status-badge"
import { BroadcastsTabs } from "@/components/broadcasts/broadcasts-tabs"
import { CreateBroadcastDialog } from "@/components/broadcasts/create-broadcast-dialog"
import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarSearch } from "@/components/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  deleteBroadcasts,
  duplicateBroadcast,
  getBroadcastErrorMessage,
  listBroadcasts,
  pauseBroadcast,
  resumeBroadcast,
  type BroadcastListItem,
} from "@/lib/api/broadcasts"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useShellRuntime } from "@/components/shell-layout"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

type BroadcastSortColumn = "name" | "status" | "updated"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function BroadcastsPage() {
  const { config } = useShellRuntime()
  const navigate = useNavigate()
  const [broadcasts, setBroadcasts] = React.useState<BroadcastListItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [sortColumn, setSortColumn] =
    React.useState<BroadcastSortColumn>("updated")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] =
    React.useState<BroadcastListItem | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  React.useEffect(() => {
    let active = true
    listBroadcasts({
      search: debouncedSearch || undefined,
      page: currentPage - 1,
      pageSize,
    })
      .then((data) => {
        if (!active) return
        setBroadcasts(data.broadcasts)
        setTotal(data.total)
        setError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getBroadcastErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [debouncedSearch, currentPage, pageSize, refreshKey])

  // Keep the list live while anything is being delivered or is waiting on
  // its scheduled time.
  const hasActivity = broadcasts.some(
    (broadcast) =>
      broadcast.status === "sending" || broadcast.status === "scheduled"
  )
  React.useEffect(() => {
    if (!hasActivity) return
    const timer = setInterval(() => setRefreshKey((key) => key + 1), 5000)
    return () => clearInterval(timer)
  }, [hasActivity])

  const refresh = () => setRefreshKey((key) => key + 1)

  const sortedBroadcasts = React.useMemo(() => {
    const rows = [...broadcasts]
    const direction = sortDirection === "asc" ? 1 : -1
    rows.sort((a, b) => {
      const left = sortValue(a, sortColumn)
      const right = sortValue(b, sortColumn)
      return left.localeCompare(right) * direction
    })
    return rows
  }, [broadcasts, sortColumn, sortDirection])

  const toggleSort = (column: BroadcastSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection(column === "updated" ? "desc" : "asc")
    }
  }

  const runRowAction = async (
    broadcast: BroadcastListItem,
    action: () => Promise<unknown>,
    successMessage: string
  ) => {
    setBusyId(broadcast.id)
    try {
      await action()
      toast.success(successMessage)
      refresh()
    } catch (actionError) {
      toast.error(getBroadcastErrorMessage(actionError))
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="w-full space-y-[var(--shell-gutter,0.75rem)] pb-8">
      <BroadcastsTabs active="broadcasts" />

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <DashboardTable
        title="Broadcasts"
        icon={
          <SendIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={total}
        controls={
          <>
            <DashboardToolbarSearch
              name="broadcasts-search"
              aria-label="Search broadcasts"
              placeholder="Search broadcasts..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New broadcast
            </Button>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton
                  active={sortColumn === "name"}
                  direction={sortDirection}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "status"}
                  direction={sortDirection}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Audience
              </TableHead>
              <TableHead column="meta">Progress</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sortColumn === "updated"}
                  direction={sortDirection}
                  onClick={() => toggleSort("updated")}
                >
                  Updated
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" aria-label="Actions" />
            </TableRow>
          </TableHeader>
        }
        isEmpty={sortedBroadcasts.length === 0}
        emptyText={
          debouncedSearch
            ? "No broadcasts match your search."
            : "No broadcasts yet. Create one to email your list."
        }
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total,
          totalPages,
          onPageChange: setCurrentPage,
          onPageSizeChange: (size) => {
            setPageSize(size)
            setCurrentPage(1)
          },
          pageSizeOptions,
        }}
      >
        {sortedBroadcasts.map((broadcast) => (
          <TableRow key={broadcast.id}>
            <TableCell column="main" className="font-medium">
              <Link
                to="/broadcasts/$broadcastId"
                params={{ broadcastId: broadcast.id }}
                className="hover:underline"
              >
                {broadcast.name}
              </Link>
              {broadcast.subject ? (
                <p className="mt-0.5 max-w-72 truncate text-xs font-normal text-muted-foreground">
                  {broadcast.subject}
                </p>
              ) : null}
            </TableCell>
            <TableCell column="meta">
              <BroadcastStatusBadge status={broadcast.status} />
              {broadcast.status === "scheduled" && broadcast.scheduled_at ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {dateFormatter.format(new Date(broadcast.scheduled_at))}
                </p>
              ) : null}
            </TableCell>
            <TableCell
              column="meta"
              className="hidden text-muted-foreground md:table-cell"
            >
              {broadcast.audienceLabel}
            </TableCell>
            <TableCell column="meta" className="text-muted-foreground">
              {broadcast.status === "draft" ? (
                "—"
              ) : (
                <>
                  {broadcast.totalSent}/{broadcast.totalRecipients} sent
                  {broadcast.totalFailed > 0 ? (
                    <span className="text-destructive">
                      {" "}
                      · {broadcast.totalFailed} failed
                    </span>
                  ) : null}
                </>
              )}
            </TableCell>
            <TableCell
              column="meta"
              className="hidden text-muted-foreground lg:table-cell"
            >
              {dateFormatter.format(new Date(broadcast.updated_at))}
            </TableCell>
            <TableCell column="meta">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${broadcast.name}`}
                    disabled={busyId === broadcast.id}
                  >
                    {busyId === broadcast.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <MoreHorizontalIcon className="size-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link
                      to="/broadcasts/$broadcastId"
                      params={{ broadcastId: broadcast.id }}
                    >
                      <PencilIcon className="size-4" />
                      Open
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void runRowAction(
                        broadcast,
                        () => duplicateBroadcast(broadcast.id),
                        "Broadcast duplicated"
                      )
                    }
                  >
                    <CopyIcon className="size-4" />
                    Duplicate
                  </DropdownMenuItem>
                  {broadcast.status === "sending" ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void runRowAction(
                          broadcast,
                          () => pauseBroadcast(broadcast.id),
                          "Broadcast paused"
                        )
                      }
                    >
                      <PauseIcon className="size-4" />
                      Pause
                    </DropdownMenuItem>
                  ) : null}
                  {broadcast.status === "paused" ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void runRowAction(
                          broadcast,
                          () => resumeBroadcast(broadcast.id),
                          "Broadcast resumed"
                        )
                      }
                    >
                      <PlayIcon className="size-4" />
                      Resume
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleteTarget(broadcast)}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <CreateBroadcastDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(broadcast) =>
          void navigate({
            to: "/broadcasts/$broadcastId",
            params: { broadcastId: broadcast.id },
          })
        }
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete broadcast</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}” will be removed permanently. Delivery
              history for already-sent emails is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="py-0" />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const target = deleteTarget
                if (!target) return
                setDeleteTarget(null)
                void runRowAction(
                  target,
                  () => deleteBroadcasts([target.id]),
                  "Broadcast deleted"
                )
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function sortValue(broadcast: BroadcastListItem, column: BroadcastSortColumn) {
  switch (column) {
    case "name":
      return broadcast.name
    case "status":
      return broadcast.status
    case "updated":
      return broadcast.updated_at
  }
}
