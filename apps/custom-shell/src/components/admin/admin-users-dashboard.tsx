import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  EyeIcon,
  Loader2Icon,
  RotateCcwIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EditAccountDialog } from "@/components/admin/edit-account-dialog"
import { showErrorToast } from "@/lib/error-toast"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
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
  TableSortButton,
} from "@/components/ui/table"
import {
  deleteAccountAsAdmin,
  deleteAccountsAsAdmin,
  getAdminUserErrorMessage,
  listAdminAccounts,
  restoreAccountsAsAdmin,
  type AccountRow,
  type AssignablePlan,
} from "@/lib/api/admin-users"
import {
  ACCOUNT_RESTORE_DAYS,
  isPendingDeletion,
  restoreDeadline,
} from "@/lib/account-deletion"
import {
  getViewAsErrorMessage,
  startViewingAsMember,
} from "@/lib/api/view-as"
import { formatDate } from "@/lib/format-time"

type SortColumn = "name" | "email" | "role" | "plan" | "created"

type StatusFilter = "all" | "active" | "suspended" | "pending_deletion"

/**
 * What deleting these accounts did, said plainly. The same button both marks an
 * account and, on a second press, removes one for good, so a mixed selection
 * has to be able to report both.
 */
function describeDeletion({
  marked,
  deleted,
}: {
  marked: number
  deleted: number
}) {
  const parts = []
  if (marked) {
    parts.push(
      `${marked} ${marked === 1 ? "account" : "accounts"} scheduled for deletion`
    )
  }
  if (deleted) {
    parts.push(`${deleted} deleted for good`)
  }

  return parts.length ? `${parts.join(", ")}.` : "Nothing to delete."
}

export function AdminUsersDashboard({
  initialAccounts,
  initialTotal,
  plans,
  currentUserId,
  defaultPageSize,
}: {
  initialAccounts: AccountRow[]
  initialTotal: number
  plans: AssignablePlan[]
  currentUserId: string
  defaultPageSize: number
}) {
  const [accounts, setAccounts] = React.useState(initialAccounts)
  const [total, setTotal] = React.useState(initialTotal)
  const [search, setSearch] = React.useState("")
  const [role, setRole] = React.useState<"all" | "admin" | "member">("all")
  const [status, setStatus] = React.useState<StatusFilter>("all")
  const [sort, setSort] = React.useState<SortColumn>("created")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [editing, setEditing] = React.useState<AccountRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AccountRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [restoreTarget, setRestoreTarget] = React.useState<AccountRow | null>(
    null
  )
  const [restoring, setRestoring] = React.useState(false)
  const [viewAsTarget, setViewAsTarget] = React.useState<AccountRow | null>(null)
  const [startingViewAs, setStartingViewAs] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await listAdminAccounts({
        search,
        role,
        status,
        page,
        pageSize,
        sort,
        direction,
      })
      setAccounts(result.accounts)
      setTotal(result.total)
      setError(null)
    } catch (loadError) {
      setError(getAdminUserErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [direction, page, pageSize, role, search, sort, status])

  const isFirstRender = React.useRef(true)
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const timer = setTimeout(refresh, 250)
    return () => clearTimeout(timer)
  }, [refresh])

  useClearSelectionOnListChange(
    setSelectedIds,
    `${search}|${role}|${status}|${sort}|${direction}|${page}|${pageSize}`
  )

  const toggleSort = React.useCallback(
    (column: SortColumn) => {
      if (sort === column) {
        setDirection(direction === "asc" ? "desc" : "asc")
        return
      }
      setSort(column)
      setDirection("asc")
    },
    [direction, sort]
  )

  const runAction = React.useCallback(
    async <T,>(
      action: () => Promise<T>,
      successText: string | ((result: T) => string)
    ) => {
      try {
        const result = await action()
        toast.success(
          typeof successText === "function" ? successText(result) : successText
        )
        await refresh()
        return true
      } catch (actionError) {
        showErrorToast(getAdminUserErrorMessage(actionError))
        return false
      }
    },
    [refresh]
  )

  const toggleSelection = React.useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Your own row is never selectable: an admin cannot delete themselves here.
  const selectableIds = React.useMemo(
    () =>
      accounts
        .filter((account) => account.id !== currentUserId)
        .map((account) => account.id),
    [accounts, currentUserId]
  )
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))
  const someSelected = selectableIds.some((id) => selectedIds.has(id))

  const toggleVisibleSelection = React.useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (selectableIds.every((id) => next.has(id))) {
        selectableIds.forEach((id) => next.delete(id))
      } else {
        selectableIds.forEach((id) => next.add(id))
      }
      return next
    })
  }, [selectableIds])

  // The selected rows that are on their way out, so one press can bring back a
  // bulk delete somebody regrets.
  const selectedDeletedIds = React.useMemo(
    () =>
      accounts
        .filter(
          (account) => selectedIds.has(account.id) && isPendingDeletion(account)
        )
        .map((account) => account.id),
    [accounts, selectedIds]
  )

  const restoreSelected = React.useCallback(async () => {
    setRestoring(true)
    const ok = await runAction(
      () => restoreAccountsAsAdmin(selectedDeletedIds),
      ({ restored }) =>
        `${restored} ${restored === 1 ? "account" : "accounts"} restored.`
    )
    setRestoring(false)
    if (ok) setSelectedIds(new Set())
  }, [runAction, selectedDeletedIds])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <>
      <DashboardTable
        title="Users"
        icon={<UsersIcon />}
        count={total}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setMassDeleteOpen(true)}
                disabled={massDeleting}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            {selectedDeletedIds.length ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={restoring}
                onClick={() => void restoreSelected()}
              >
                {restoring ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <RotateCcwIcon className="size-4" />
                )}
                Restore ({selectedDeletedIds.length})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="user-search"
              aria-label="Search accounts"
              placeholder="Search name or email…"
              value={search}
              onChange={(event) => {
                setPage(1)
                setSearch(event.target.value)
              }}
            />
            <Select
              value={role}
              onValueChange={(value) => {
                setPage(1)
                setRole(value as typeof role)
              }}
            >
              <DashboardToolbarSelectTrigger
                aria-label="Filter by role"
              >
                <SelectValue placeholder="Role" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="member">Members</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => {
                setPage(1)
                setStatus(value as typeof status)
              }}
            >
              <DashboardToolbarSelectTrigger
                aria-label="Filter by status"
              >
                <SelectValue placeholder="Status" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending_deletion">
                  Scheduled for deletion
                </SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={toggleVisibleSelection}
                  aria-label="Select visible accounts"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "email"}
                  direction={direction}
                  onClick={() => toggleSort("email")}
                >
                  Email
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "role"}
                  direction={direction}
                  onClick={() => toggleSort("role")}
                >
                  Role
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "plan"}
                  direction={direction}
                  onClick={() => toggleSort("plan")}
                >
                  Plan
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sort === "created"}
                  direction={direction}
                  onClick={() => toggleSort("created")}
                >
                  Joined
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && accounts.length === 0}
        emptyText="No accounts match those filters."
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total,
          totalPages,
          onPageChange: setPage,
          onPageSizeChange: (nextSize) => {
            setPage(1)
            setPageSize(nextSize)
          },
        }}
      >
        {accounts.map((account) => (
          <TableRow key={account.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(account.id)}
                onCheckedChange={() => toggleSelection(account.id)}
                disabled={account.id === currentUserId}
                aria-label={`Select ${account.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <Link
                to="/admin/users/$userId"
                params={{ userId: account.id }}
                className="text-sm font-medium group-hover:underline"
              >
                {account.name}
              </Link>
              {isPendingDeletion(account) && account.deletedAt ? (
                <span className="ml-2 text-xs text-destructive">
                  Deletes {formatDate(restoreDeadline(account.deletedAt))}
                </span>
              ) : account.status === "suspended" ? (
                <span className="ml-2 text-xs text-destructive">Suspended</span>
              ) : account.emailVerified ? null : (
                <span className="ml-2 text-xs text-muted-foreground">
                  Not verified
                </span>
              )}
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <span className="block truncate" title={account.email}>
                {account.email}
              </span>
            </TableCell>
            <TableCell column="meta">
              <Badge variant={account.role === "admin" ? "default" : "outline"}>
                {account.role === "admin" ? "Admin" : "Member"}
              </Badge>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1.5">
                <Badge variant={account.planIsPaid ? "default" : "secondary"}>
                  {account.planName}
                </Badge>
                {account.subscriptionSource === "manual" ? (
                  <Badge variant="outline">Granted</Badge>
                ) : null}
                {account.cancelAtPeriodEnd ? (
                  <Badge variant="outline">Ending</Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {formatDate(account.createdAt)}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center">
                <DisabledReason
                  disabled={
                    account.role === "admin" || account.status !== "active"
                  }
                  reason={
                    account.role === "admin"
                      ? "You cannot view the app as another admin. Only members can be viewed as."
                      : isPendingDeletion(account)
                        ? "This account is scheduled for deletion. Restore it first."
                        : "This account is suspended. Set it back to active first."
                  }
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    // Members only, and only ones who can actually sign in. The
                    // server refuses the rest again; this just says so first.
                    disabled={
                      account.role === "admin" || account.status !== "active"
                    }
                    onClick={() => setViewAsTarget(account)}
                    title="View the app as this member"
                    aria-label={`View the app as ${account.name}`}
                  >
                    <EyeIcon className="size-4" />
                  </Button>
                </DisabledReason>
                {isPendingDeletion(account) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setRestoreTarget(account)}
                    title="Restore account"
                    aria-label={`Restore ${account.name}`}
                  >
                    <RotateCcwIcon className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(account)}
                  title="Account settings"
                  aria-label={`Account settings for ${account.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={account.id === currentUserId}
                  onClick={() => setDeleteTarget(account)}
                  title="Delete account"
                  aria-label={`Delete ${account.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <EditAccountDialog
        key={editing?.id ?? "closed"}
        account={editing}
        plans={plans}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={
          deleteTarget && isPendingDeletion(deleteTarget)
            ? "Delete this account for good?"
            : "Delete this account?"
        }
        description={
          !deleteTarget
            ? null
            : isPendingDeletion(deleteTarget)
              ? `${deleteTarget.name} (${deleteTarget.email}) and everything they own is removed now, without waiting out the rest of the restore window. This cannot be undone.`
              : `${deleteTarget.name} (${deleteTarget.email}) is signed out everywhere and cannot sign in. You can restore them for ${ACCOUNT_RESTORE_DAYS} days, after which they and everything they own are gone for good.`
        }
        confirmLabel="Delete account"
        loading={deleting}
        onConfirm={async () => {
          const target = deleteTarget
          if (!target) return
          setDeleting(true)
          const ok = await runAction(
            () => deleteAccountAsAdmin(target.id),
            describeDeletion
          )
          setDeleting(false)
          if (ok) setDeleteTarget(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null)
        }}
        title="Restore this account?"
        description={
          restoreTarget
            ? `${restoreTarget.name} (${restoreTarget.email}) becomes active again and can sign in. Nothing was deleted, so everything they own comes back with them.`
            : null
        }
        confirmLabel="Restore account"
        destructive={false}
        loading={restoring}
        onConfirm={async () => {
          const target = restoreTarget
          if (!target) return
          setRestoring(true)
          const ok = await runAction(
            () => restoreAccountsAsAdmin([target.id]),
            "Account restored."
          )
          setRestoring(false)
          if (ok) setRestoreTarget(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(viewAsTarget)}
        onOpenChange={(open) => {
          if (!open) setViewAsTarget(null)
        }}
        title="View the app as this member?"
        description={
          viewAsTarget
            ? `You will see exactly what ${viewAsTarget.name} sees, and anything you do will be done as them. You lose your admin pages until you stop. Starting and stopping are both recorded in the activity log.`
            : null
        }
        confirmLabel="View as member"
        destructive={false}
        loading={startingViewAs}
        onConfirm={async () => {
          const target = viewAsTarget
          if (!target) return
          setStartingViewAs(true)
          try {
            await startViewingAsMember(target.id)
            // A full load, not a router refresh: every loader on this page was
            // fetched as an admin and none of it is theirs to see now.
            window.location.href = "/"
          } catch (startError) {
            setStartingViewAs(false)
            showErrorToast(getViewAsErrorMessage(startError))
          }
        }}
      />

      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? "account" : "accounts"}?`}
        description={`Those people are signed out everywhere and cannot sign in. You can restore them for ${ACCOUNT_RESTORE_DAYS} days. Any that were already scheduled for deletion are removed for good now.`}
        confirmLabel="Delete accounts"
        loading={massDeleting}
        onConfirm={async () => {
          setMassDeleting(true)
          const ok = await runAction(
            () => deleteAccountsAsAdmin([...selectedIds]),
            describeDeletion
          )
          setMassDeleting(false)
          if (ok) {
            setSelectedIds(new Set())
            setMassDeleteOpen(false)
          }
        }}
      />
    </>
  )
}
