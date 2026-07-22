import * as React from "react"
import { Loader2Icon, SettingsIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
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
} from "@/components/ui/table"
import {
  deleteAccountAsAdmin,
  deleteAccountsAsAdmin,
  getAdminUserErrorMessage,
  grantAccountPlan,
  listAdminAccounts,
  updateAccountRole,
  updateAccountStatus,
  type AccountRow,
} from "@/lib/api/admin-users"
import { formatDate } from "@/lib/money"

type AssignablePlan = { id: string; name: string; slug: string }
type SortColumn = "name" | "email" | "role" | "plan" | "created"

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
  const [status, setStatus] = React.useState<"all" | "active" | "suspended">(
    "all"
  )
  const [sort, setSort] = React.useState<SortColumn>("created")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [editing, setEditing] = React.useState<AccountRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AccountRow | null>(null)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)

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
    async (action: () => Promise<unknown>, successText: string) => {
      try {
        await action()
        toast.success(successText)
        await refresh()
        return true
      } catch (actionError) {
        toast.error(getAdminUserErrorMessage(actionError))
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <DashboardTable
        title="Users"
        icon={<UsersIcon className="size-4" />}
        count={total}
        status={error ? { tone: "error", text: error } : null}
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
                {massDeleting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="user-search"
              aria-label="Search accounts"
              placeholder="Search name or email..."
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
                labels={["All roles", "Admins", "Members"]}
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
                labels={["All accounts", "Active", "Suspended"]}
              >
                <SelectValue placeholder="Status" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
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
              <button
                type="button"
                className="text-left text-sm font-medium group-hover:underline"
                onClick={() => setEditing(account)}
              >
                {account.name}
              </button>
              {account.status === "suspended" ? (
                <span className="ml-2 text-xs text-destructive">Suspended</span>
              ) : account.emailVerified ? null : (
                <span className="ml-2 text-xs text-muted-foreground">
                  Not verified
                </span>
              )}
            </TableCell>
            <TableCell column="meta">{account.email}</TableCell>
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

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this account?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `${deleteTarget.name} (${deleteTarget.email}) and everything they own is removed. This cannot be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const target = deleteTarget
                if (!target) return
                const ok = await runAction(
                  () => deleteAccountAsAdmin(target.id),
                  "Account deleted."
                )
                if (ok) setDeleteTarget(null)
              }}
            >
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={massDeleteOpen} onOpenChange={setMassDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size}{" "}
              {selectedIds.size === 1 ? "account" : "accounts"}?
            </DialogTitle>
            <DialogDescription>
              Everything those people own is removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMassDeleteOpen(false)}
              disabled={massDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={massDeleting}
              onClick={async () => {
                setMassDeleting(true)
                const ok = await runAction(
                  () => deleteAccountsAsAdmin([...selectedIds]),
                  "Accounts deleted."
                )
                setMassDeleting(false)
                if (ok) {
                  setSelectedIds(new Set())
                  setMassDeleteOpen(false)
                }
              }}
            >
              {massDeleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              Delete accounts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Role, status and a granted plan live here, not as controls inside the table. */
function EditAccountDialog({
  account,
  plans,
  onClose,
  onSaved,
}: {
  account: AccountRow | null
  plans: AssignablePlan[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const grantedPlanId =
    account?.subscriptionSource === "manual"
      ? (plans.find((plan) => plan.slug === account.planSlug)?.id ?? "none")
      : "none"
  const grantedEndsOn =
    account?.subscriptionSource === "manual" && account.currentPeriodEnd
      ? account.currentPeriodEnd.slice(0, 10)
      : ""

  const [role, setRole] = React.useState<"admin" | "member">(
    account?.role === "admin" ? "admin" : "member"
  )
  const [status, setStatus] = React.useState<"active" | "suspended">(
    account?.status === "suspended" ? "suspended" : "active"
  )
  const [planId, setPlanId] = React.useState(grantedPlanId)
  const [endsOn, setEndsOn] = React.useState(grantedEndsOn)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const initial = React.useRef({
    role: account?.role === "admin" ? "admin" : "member",
    status: account?.status === "suspended" ? "suspended" : "active",
    planId: grantedPlanId,
    endsOn: grantedEndsOn,
  })

  const handleSave = React.useCallback(async () => {
    if (!account) return

    setError(null)
    setSaving(true)
    try {
      // Only send what changed, so a no-op save writes no audit rows.
      if (role !== initial.current.role) {
        await updateAccountRole(account.id, role)
      }
      if (status !== initial.current.status) {
        await updateAccountStatus(account.id, status)
      }
      if (
        planId !== initial.current.planId ||
        endsOn !== initial.current.endsOn
      ) {
        await grantAccountPlan(
          account.id,
          planId === "none" ? null : planId,
          endsOn ? new Date(`${endsOn}T23:59:59`).toISOString() : null
        )
      }

      toast.success("Account updated.")
      await onSaved()
    } catch (saveError) {
      setError(getAdminUserErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }, [account, endsOn, onSaved, planId, role, status])

  return (
    <Dialog
      open={Boolean(account)}
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account?.name ?? "Account"}</DialogTitle>
          <DialogDescription>
            {account?.email ?? "Change what this person can do and pays for."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Access</CardTitle>
              <CardDescription>
                Admins reach the whole back office. Suspending someone signs them
                out everywhere.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
                <div className="grid gap-2">
                  <Label htmlFor="account-role">Role</Label>
                  <Select
                    value={role}
                    onValueChange={(value) =>
                      setRole(value as "admin" | "member")
                    }
                  >
                    <SelectTrigger id="account-role" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="account-status">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(value) =>
                      setStatus(value as "active" | "suspended")
                    }
                  >
                    <SelectTrigger id="account-status" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Granted plan</CardTitle>
              <CardDescription>
                Puts this person on a paid plan without charging them. Plans paid
                through Stripe are not affected.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid gap-2">
                  <Label htmlFor="account-plan">Plan</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger id="account-plan" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No granted plan</SelectItem>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="account-ends-on"
                    hint="Leave empty to keep the plan until you remove it."
                  >
                    Ends on
                  </FieldLabel>
                  <DatePicker
                    id="account-ends-on"
                    value={endsOn ? new Date(`${endsOn}T00:00:00`) : undefined}
                    disabled={planId === "none"}
                    onChange={(date) =>
                      setEndsOn(date ? format(date, "yyyy-MM-dd") : "")
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
