import * as React from "react"
import { getRouteApi, Link } from "@tanstack/react-router"
import {
  EyeIcon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
  ShieldBanIcon,
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
import { AddAccountDialog } from "@/components/admin/add-account-dialog"
import { LockedOutDialog } from "@/components/admin/locked-out-dialog"
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
import {
  useListSearchNavigate,
  useSearchBoxText,
} from "@/lib/list-search"

const usersRoute = getRouteApi("/_authenticated/admin/users")

type SortColumn = "name" | "email" | "role" | "plan" | "created"



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

/**
 * What a delete confirmation says about somebody's paid plan.
 *
 * Deleting cancels it there and then, and restoring the account does not buy it
 * back, so both have to be on screen before the button is pressed rather than
 * discovered afterwards.
 */
function describePaidPlans(paid: number) {
  if (paid === 0) {
    return ""
  }
  if (paid === 1) {
    return " One of them is on a paid plan; it is cancelled straight away and does not come back if the account is restored."
  }

  return ` ${paid} of them are on paid plans; those are cancelled straight away and do not come back if the accounts are restored.`
}

function describeAccountDeletion(account: AccountRow) {
  const base = isPendingDeletion(account)
    ? `${account.name} (${account.email}) and everything they own is removed now, without waiting out the rest of the restore window. This cannot be undone.`
    : `${account.name} (${account.email}) is signed out everywhere and cannot sign in. You can restore them for ${ACCOUNT_RESTORE_DAYS} days, after which they and everything they own are gone for good.`

  return account.planIsPaid
    ? `${base} Their paid plan is cancelled straight away, and restoring the account does not bring it back.`
    : base
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
  // Search, filters, sort and page live in the address, so opening an account
  // and pressing Back returns this exact list — see `lib/list-search.ts`.
  const listSearch = usersRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const search = listSearch.q ?? ""
  const role = listSearch.role ?? "all"
  const status = listSearch.status ?? "all"
  const sort: SortColumn = listSearch.sort ?? "created"
  const direction = listSearch.direction ?? "desc"
  const page = listSearch.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(search, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const [accounts, setAccounts] = React.useState(initialAccounts)
  const [total, setTotal] = React.useState(initialTotal)
  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<AccountRow | null>(null)
  const [lockedOutOpen, setLockedOutOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AccountRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [restoreTarget, setRestoreTarget] = React.useState<AccountRow | null>(
    null
  )
  // One flag per button: a row's restore confirmation and the toolbar's bulk
  // restore are separate actions, so neither may grey the other out.
  const [restoring, setRestoring] = React.useState(false)
  const [massRestoring, setMassRestoring] = React.useState(false)
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
      setListSearch(
        sort === column
          ? { direction: direction === "asc" ? "desc" : "asc" }
          : { sort: column, direction: "asc" }
      )
    },
    [direction, setListSearch, sort]
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

  // How many of the ticked rows are paying, so the bulk confirmation can say
  // how much money it is about to stop. Selection is cleared whenever the list
  // changes, so every ticked row is on the page and countable here.
  const selectedPaidCount = React.useMemo(
    () =>
      accounts.filter(
        (account) => selectedIds.has(account.id) && account.planIsPaid
      ).length,
    [accounts, selectedIds]
  )

  const restoreSelected = React.useCallback(async () => {
    setMassRestoring(true)
    const ok = await runAction(
      () => restoreAccountsAsAdmin(selectedDeletedIds),
      ({ restored }) =>
        `${restored} ${restored === 1 ? "account" : "accounts"} restored.`
    )
    setMassRestoring(false)
    if (ok) setSelectedIds(new Set())
  }, [runAction, selectedDeletedIds])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <>
      <DashboardTable
        title="Users"
        icon={<UsersIcon />}
        count={total}
        busy={loading}
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
                disabled={massRestoring}
                onClick={() => void restoreSelected()}
              >
                {massRestoring ? (
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
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={role}
              onValueChange={(value) =>
                setListSearch({
                  role: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
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
              onValueChange={(value) =>
                setListSearch({
                  status: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
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
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setLockedOutOpen(true)}
            >
              <ShieldBanIcon className="size-4" />
              Locked out
            </DashboardToolbarButton>
            <DashboardToolbarButton type="button" onClick={() => setAdding(true)}>
              <PlusIcon className="size-4" />
              Add account
            </DashboardToolbarButton>
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
                  active={sort === "status"}
                  direction={direction}
                  onClick={() => toggleSort("status")}
                >
                  Status
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
        emptyColSpan={8}
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
              <AccountStatusBadge account={account} />
            </TableCell>
            {/* Just the plan's name: whether it was granted or is already
                ending lives in the account window, not as extra badges. */}
            <TableCell column="meta">
              <Badge variant={account.planIsPaid ? "default" : "secondary"}>
                {account.planName}
              </Badge>
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

      <AddAccountDialog
        // Remounts on every open, so the last invite's fields never linger.
        // Prefixed so it never collides with the edit dialog's "closed" key.
        key={adding ? "add-open" : "add-closed"}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={async () => {
          setAdding(false)
          await refresh()
        }}
      />

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

      <LockedOutDialog open={lockedOutOpen} onOpenChange={setLockedOutOpen} />

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
        description={deleteTarget ? describeAccountDeletion(deleteTarget) : null}
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
        description={`Those people are signed out everywhere and cannot sign in. You can restore them for ${ACCOUNT_RESTORE_DAYS} days. Any that were already scheduled for deletion are removed for good now.${describePaidPlans(selectedPaidCount)}`}
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

/**
 * The one place a row's standing becomes a word. An account with nothing wrong
 * says "Active" instead of saying nothing, so a blank cell can never be
 * mistaken for a missing value.
 */
function AccountStatusBadge({ account }: { account: AccountRow }) {
  if (isPendingDeletion(account) && account.deletedAt) {
    return (
      <Badge variant="destructive">
        Deletes {formatDate(restoreDeadline(account.deletedAt))}
      </Badge>
    )
  }
  if (account.status === "suspended") {
    return <Badge variant="destructive">Suspended</Badge>
  }
  if (!account.emailVerified) {
    // No password and no verified email: an invited account whose
    // set-password link has not been used yet.
    return account.hasPassword ? (
      <Badge variant="secondary">Not verified</Badge>
    ) : (
      <Badge variant="secondary" title="Invited — hasn't set a password">
        Invited
      </Badge>
    )
  }
  return <Badge variant="outline">Active</Badge>
}
