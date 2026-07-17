import * as React from "react"
import { Loader2Icon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { PomoderAdminRecordDialog } from "@/components/pomoder-admin-record-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  loadAdminData,
  runAdminAction,
  type AdminAction,
  type AdminData,
} from "@/lib/api/admin"
import {
  reportStatuses,
  type PomoderAdminSection,
  type PomoderReportStatus,
} from "@/server/admin-contract"

type Act = (key: string, action: AdminAction) => Promise<boolean>
type Sort = { column: number; direction: TableSortDirection }
type ReportStatusFilter = "all" | PomoderReportStatus

export function PomoderAdminPage({
  section,
}: {
  section: PomoderAdminSection
}) {
  const [data, setData] = React.useState<AdminData | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [sort, setSort] = React.useState<Sort>({
    column: 0,
    direction: "asc",
  })
  const [reportStatus, setReportStatus] =
    React.useState<ReportStatusFilter>("all")
  const query = React.useMemo(
    () => ({
      section,
      page,
      pageSize,
      sortColumn: sort.column,
      sortDirection: sort.direction,
      reportStatus,
    }),
    [section, page, pageSize, sort, reportStatus]
  )

  const refresh = React.useCallback(
    async (isActive: () => boolean = () => true) => {
      try {
        const result = await loadAdminData(query)
        if (!isActive()) return
        const lastPage = Math.max(1, result.pagination.totalPages)
        if (query.page > lastPage) {
          setPage(lastPage)
          return
        }
        setData(result)
        setError("")
      } catch {
        if (isActive()) setError("Pomoder management data could not be loaded.")
      }
    },
    [query]
  )

  React.useEffect(() => {
    let active = true
    void refresh(() => active)
    return () => {
      active = false
    }
  }, [refresh])

  async function act(key: string, action: AdminAction) {
    setBusy(key)
    try {
      await runAdminAction(action)
      await refresh()
      return true
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : ""
      setError(getAdminActionError(message))
      return false
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="w-full space-y-6 pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Pomoder management
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage users, sessions, rooms, media, billing, AI usage, and reports.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {!data ? (
        <Card>
          <CardHeader>
            <CardTitle>Loading management data…</CardTitle>
            <CardDescription>
              The latest Pomoder records are being retrieved.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <AdminTable
          key={section}
          section={section}
          data={data}
          busy={busy}
          act={act}
          sort={sort}
          reportStatus={reportStatus}
          onReportStatusChange={(status) => {
            setPage(1)
            setReportStatus(status)
          }}
          onSort={(column) => {
            setPage(1)
            setSort((current) => ({
              column,
              direction:
                current.column === column && current.direction === "asc"
                  ? "desc"
                  : "asc",
            }))
          }}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPage(1)
            setPageSize(size)
          }}
        />
      )}
    </div>
  )
}

function AdminTable({
  section,
  data,
  busy,
  act,
  sort,
  reportStatus,
  onReportStatusChange,
  onSort,
  onPageChange,
  onPageSizeChange,
}: {
  section: PomoderAdminSection
  data: AdminData
  busy: string
  act: Act
  sort: Sort
  reportStatus: ReportStatusFilter
  onReportStatusChange: (status: ReportStatusFilter) => void
  onSort: (column: number) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleteIds, setDeleteIds] = React.useState<string[]>([])
  const [editingId, setEditingId] = React.useState<string | null | undefined>(
    undefined
  )
  const allIds = getSectionIds(section, data)
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  const partiallySelected =
    !allSelected && allIds.some((id) => selectedIds.has(id))

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(allIds))
  }

  async function confirmDelete() {
    const deleted = await act(`delete:${section}`, {
      type: "delete_records",
      resource: section,
      ids: deleteIds,
    })
    if (deleted) {
      setSelectedIds(new Set())
      setDeleteIds([])
    }
  }

  const tableProps = {
    sort,
    onSort,
    selectedIds,
    allSelected,
    partiallySelected,
    onToggleAll: toggleAll,
    onClearSelection: () => setSelectedIds(new Set()),
    onDeleteSelected: () => setDeleteIds([...selectedIds]),
    onCreate: () => setEditingId(null),
    addLabel: sectionLabels[section],
    pagination: data.pagination,
    onPageChange: (nextPage: number) => {
      setSelectedIds(new Set())
      onPageChange(nextPage)
    },
    onPageSizeChange: (nextSize: number) => {
      setSelectedIds(new Set())
      onPageSizeChange(nextSize)
    },
  }

  const selectCell = (id: string) => (
    <TableCell column="select">
      <Checkbox
        checked={selectedIds.has(id)}
        onCheckedChange={() => toggleSelection(id)}
        aria-label="Select row"
      />
    </TableCell>
  )
  const deleteButton = (id: string) => (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={() => setDeleteIds([id])}
      title="Delete record"
      aria-label="Delete record"
    >
      <Trash2Icon className="size-4" />
      <span className="sr-only">Delete record</span>
    </Button>
  )
  const editButton = (id: string) => (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={() => setEditingId(id)}
      title="Edit record"
      aria-label="Edit record"
    >
      <SettingsIcon className="size-4" />
      <span className="sr-only">Edit record</span>
    </Button>
  )

  let table: React.ReactNode

  if (section === "users") {
    table = (
      <ManagementTable
        {...tableProps}
        title="Users"
        count={data.pagination.total}
        headers={["User", "Role", "Verified", "Actions"]}
      >
        {data.users.map((user) => (
          <TableRow key={user.id}>
            {selectCell(user.id)}
            <TableCell column="main">
              <PrimaryCell title={user.name} detail={user.email} />
            </TableCell>
            <TableCell column="meta">{user.role}</TableCell>
            <TableCell column="meta">
              {user.emailVerifiedAt ? "Yes" : "No"}
            </TableCell>
            <TableCell column="meta">
              <ActionCell>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === user.id}
                  onClick={() =>
                    void act(user.id, {
                      type: "revoke_user_sessions",
                      userId: user.id,
                    })
                  }
                >
                  Sign out
                </Button>
                {editButton(user.id)}
                {deleteButton(user.id)}
              </ActionCell>
            </TableCell>
          </TableRow>
        ))}
      </ManagementTable>
    )
  } else if (section === "tasks") {
    table = (
      <ManagementTable
        {...tableProps}
        title="Tasks"
        count={data.pagination.total}
        headers={["User", "Task", "Date", "Status", "Actions"]}
      >
        {data.tasks.map(({ task, email }) => (
          <TableRow key={task.id}>
            {selectCell(task.id)}
            <TableCell column="main">{email}</TableCell>
            <TableCell column="meta">{task.title}</TableCell>
            <TableCell column="meta">{task.plannedDate}</TableCell>
            <TableCell column="meta">
              {task.status} · {task.pomodoroCount}
            </TableCell>
            <TableCell column="meta">
              <ActionCell>
                {editButton(task.id)}
                {deleteButton(task.id)}
              </ActionCell>
            </TableCell>
          </TableRow>
        ))}
      </ManagementTable>
    )
  } else if (section === "sessions") {
    table = (
      <ManagementTable
        {...tableProps}
        title="Focus sessions"
        count={data.pagination.total}
        headers={["User", "Mode", "Status", "Seconds", "Actions"]}
      >
        {data.focusSessions.map(({ session, email }) => (
          <TableRow key={session.id}>
            {selectCell(session.id)}
            <TableCell column="main">{email}</TableCell>
            <TableCell column="meta">{session.mode}</TableCell>
            <TableCell column="meta">{session.status}</TableCell>
            <TableCell column="meta">
              {session.accumulatedSeconds}/{session.plannedSeconds}
            </TableCell>
            <TableCell column="meta">
              <ActionCell>
                {editButton(session.id)}
                {deleteButton(session.id)}
              </ActionCell>
            </TableCell>
          </TableRow>
        ))}
      </ManagementTable>
    )
  } else if (section === "rooms") {
    table = (
      <ManagementTable
        {...tableProps}
        title="Rooms"
        count={data.pagination.total}
        headers={["Room", "Host", "Phase", "Actions"]}
      >
        {data.rooms.map(({ room, hostEmail }) => (
          <TableRow key={room.id}>
            {selectCell(room.id)}
            <TableCell column="main">
              <PrimaryCell title={room.name} detail={room.visibility} />
            </TableCell>
            <TableCell column="meta">{hostEmail}</TableCell>
            <TableCell column="meta">{room.phase}</TableCell>
            <TableCell column="meta">
              <ActionCell>
                {editButton(room.id)}
                {deleteButton(room.id)}
              </ActionCell>
            </TableCell>
          </TableRow>
        ))}
      </ManagementTable>
    )
  } else if (section === "media") {
    table = (
      <ManagementTable
        {...tableProps}
        title="Pomoder media"
        count={data.pagination.total}
        headers={["Asset", "Owner", "Status", "Access", "Actions"]}
      >
        {data.media.map(({ media, ownerEmail }) => (
          <TableRow key={media.id}>
            {selectCell(media.id)}
            <TableCell column="main">
              <PrimaryCell
                title={media.name}
                detail={`${media.kind} · ${media.source}`}
              />
            </TableCell>
            <TableCell column="meta">{ownerEmail || "Curated"}</TableCell>
            <TableCell column="meta">{media.status}</TableCell>
            <TableCell column="meta">
              {media.premium ? "Pro" : "Free"}
            </TableCell>
            <TableCell column="meta">
              <ActionCell>
                {editButton(media.id)}
                {deleteButton(media.id)}
              </ActionCell>
            </TableCell>
          </TableRow>
        ))}
      </ManagementTable>
    )
  } else if (section === "billing") {
    table = (
      <ManagementTable
        {...tableProps}
        title="Billing"
        count={data.pagination.total}
        headers={["User", "Status", "Price", "Renews", "Actions"]}
      >
        {data.subscriptions.map(({ subscription, email }) => (
          <TableRow key={subscription.id}>
            {selectCell(subscription.id)}
            <TableCell column="main">{email}</TableCell>
            <TableCell column="meta">{subscription.status}</TableCell>
            <TableCell column="meta">{subscription.priceId || "—"}</TableCell>
            <TableCell column="meta">
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : "—"}
            </TableCell>
            <TableCell column="meta">
              <ActionCell>
                {editButton(subscription.id)}
                {deleteButton(subscription.id)}
              </ActionCell>
            </TableCell>
          </TableRow>
        ))}
      </ManagementTable>
    )
  } else if (section === "ai") {
    table = (
      <ManagementTable
        {...tableProps}
        title="AI usage"
        count={data.pagination.total}
        headers={["User", "Month", "Kind", "Usage", "Actions"]}
      >
        {data.generationUsage.map(({ usage, email }) => (
          <TableRow key={usage.id}>
            {selectCell(usage.id)}
            <TableCell column="main">{email}</TableCell>
            <TableCell column="meta">{usage.month}</TableCell>
            <TableCell column="meta">{usage.kind}</TableCell>
            <TableCell column="meta">
              {usage.completed} completed · {usage.reserved} reserved ·{" "}
              {usage.refunded} refunded
            </TableCell>
            <TableCell column="meta">
              <ActionCell>
                {editButton(usage.id)}
                {deleteButton(usage.id)}
              </ActionCell>
            </TableCell>
          </TableRow>
        ))}
      </ManagementTable>
    )
  } else {
    table = (
      <ManagementTable
        {...tableProps}
        title="Moderation reports"
        count={data.pagination.total}
        headers={["Room", "Reporter", "Report", "Status", "Reviewed", "Actions"]}
        filters={
          <Select
            value={reportStatus}
            onValueChange={(value) =>
              onReportStatusChange(value as ReportStatusFilter)
            }
          >
            <SelectTrigger className="w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">All statuses</SelectItem>
              {reportStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabels[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {data.reports.map(
          ({
            report,
            roomName,
            reporterEmail,
            messageBody,
            messageAuthorEmail,
            reviewerEmail,
          }) => (
            <TableRow key={report.id}>
              {selectCell(report.id)}
              <TableCell column="main">{roomName}</TableCell>
              <TableCell column="meta">{reporterEmail}</TableCell>
              <TableCell column="main">
                <PrimaryCell
                  title={report.reason}
                  detail={
                    messageBody
                      ? `“${messageBody}” — ${messageAuthorEmail ?? "unknown author"}`
                      : "Reported message is no longer available"
                  }
                />
              </TableCell>
              <TableCell column="meta">{statusLabels[report.status as PomoderReportStatus] ?? report.status}</TableCell>
              <TableCell column="meta">
                {reviewerEmail && report.reviewedAt
                  ? `${reviewerEmail} · ${new Date(report.reviewedAt).toLocaleDateString()}`
                  : "—"}
              </TableCell>
              <TableCell column="meta">
                <ActionCell>
                  {report.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === report.id}
                        onClick={() =>
                          void act(report.id, {
                            type: "review_report",
                            id: report.id,
                            decision: "resolved",
                          })
                        }
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === report.id}
                        onClick={() =>
                          void act(report.id, {
                            type: "review_report",
                            id: report.id,
                            decision: "dismissed",
                          })
                        }
                      >
                        Dismiss
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === report.id}
                      onClick={() =>
                        void act(report.id, {
                          type: "review_report",
                          id: report.id,
                          decision: "pending",
                        })
                      }
                    >
                      Reopen
                    </Button>
                  )}
                  {editButton(report.id)}
                  {deleteButton(report.id)}
                </ActionCell>
              </TableCell>
            </TableRow>
          )
        )}
      </ManagementTable>
    )
  }

  return (
    <>
      {table}
      {editingId !== undefined ? (
        <PomoderAdminRecordDialog
          key={`${section}:${editingId ?? "new"}`}
          section={section}
          data={data}
          editingId={editingId}
          onOpenChange={(open) => {
            if (!open) setEditingId(undefined)
          }}
          onSave={(action) => act(`${action.type}:${section}`, action)}
        />
      ) : null}
      <Dialog
        open={deleteIds.length > 0}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteIds([])
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Delete{" "}
              {deleteIds.length === 1
                ? "record"
                : `${deleteIds.length} records`}
              ?
            </DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This permanently removes the selected {section} data.
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => setDeleteIds([])}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(busy)}
              onClick={() => void confirmDelete()}
            >
              {busy === `delete:${section}` ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type ManagementTableProps = {
  title: string
  count: number
  headers: string[]
  sort: Sort
  onSort: (column: number) => void
  selectedIds: Set<string>
  allSelected: boolean
  partiallySelected: boolean
  onToggleAll: () => void
  onClearSelection: () => void
  onDeleteSelected: () => void
  onCreate: () => void
  addLabel: string
  filters?: React.ReactNode
  pagination: AdminData["pagination"]
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  children: React.ReactNode
}

function ManagementTable({
  title,
  count,
  headers,
  sort,
  onSort,
  selectedIds,
  allSelected,
  partiallySelected,
  onToggleAll,
  onClearSelection,
  onDeleteSelected,
  onCreate,
  addLabel,
  filters,
  pagination,
  onPageChange,
  onPageSizeChange,
  children,
}: ManagementTableProps) {
  return (
    <DashboardTable
      title={title}
      count={count}
      selectedCount={selectedIds.size}
      onClearSelection={onClearSelection}
      controls={
        <>
          {selectedIds.size ? (
            <DashboardToolbarButton
              type="button"
              variant="destructive"
              onClick={onDeleteSelected}
            >
              <Trash2Icon className="size-4" />
              Delete ({selectedIds.size})
            </DashboardToolbarButton>
          ) : null}
          {filters}
          <DashboardToolbarButton type="button" onClick={onCreate}>
            <PlusIcon className="size-4" />
            Add {addLabel}
          </DashboardToolbarButton>
        </>
      }
      header={
        <TableHeader>
          <TableRow>
            <TableHead column="select">
              <Checkbox
                checked={
                  allSelected
                    ? true
                    : partiallySelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={onToggleAll}
                aria-label={`Select all ${title.toLowerCase()}`}
              />
            </TableHead>
            {headers.map((header, index) => (
              <TableHead
                key={header}
                column={index === 0 ? "main" : "meta"}
                aria-sort={
                  sort.column === index
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <TableSortButton
                  active={sort.column === index}
                  direction={sort.direction}
                  onClick={() => onSort(index)}
                >
                  {header}
                </TableSortButton>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      }
      isEmpty={count === 0}
      emptyText={`No ${title.toLowerCase()} found.`}
      emptyColSpan={headers.length + 1}
      footer={{
        type: "pagination",
        ...pagination,
        onPageChange,
        onPageSizeChange,
      }}
    >
      {children}
    </DashboardTable>
  )
}

const sectionLabels: Record<PomoderAdminSection, string> = {
  users: "User",
  tasks: "Task",
  sessions: "Focus Session",
  rooms: "Room",
  media: "Media Asset",
  billing: "Subscription",
  ai: "AI Usage",
  reports: "Report",
}

const statusLabels: Record<PomoderReportStatus, string> = {
  pending: "Pending",
  resolved: "Resolved",
  dismissed: "Dismissed",
}

function getSectionIds(section: PomoderAdminSection, data: AdminData) {
  if (section === "users") return data.users.map((item) => item.id)
  if (section === "tasks") return data.tasks.map(({ task }) => task.id)
  if (section === "sessions")
    return data.focusSessions.map(({ session }) => session.id)
  if (section === "rooms") return data.rooms.map(({ room }) => room.id)
  if (section === "media") return data.media.map(({ media }) => media.id)
  if (section === "billing")
    return data.subscriptions.map(({ subscription }) => subscription.id)
  if (section === "ai") return data.generationUsage.map(({ usage }) => usage.id)
  return data.reports.map(({ report }) => report.id)
}

function PrimaryCell({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{title}</div>
      <div className="truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

function ActionCell({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>
}

function getAdminActionError(message: string) {
  if (message.includes("CANNOT_DEMOTE_SELF"))
    return "You cannot remove your own admin access."
  if (message.includes("CANNOT_DELETE_SELF"))
    return "You cannot delete your own account."
  return "That admin action could not be completed."
}
