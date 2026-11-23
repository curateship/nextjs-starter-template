"use client"

import { useState, useEffect } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  AdminTableSummaryFooter,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch
} from "@/components/admin/layout/content/table-right-actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { deleteUser, deleteUsers, listUsers, type UserListItem } from "@/lib/actions/users/user-management-actions"
import { toCalendarDate, fromCalendarDate, formatDatePickerLabel } from "@/lib/utils/calendar-dates"
import { cn } from "@/lib/utils/tailwind"
import { CalendarIcon, Plus, SlidersHorizontal, Trash2, User, X } from "lucide-react"
import Link from "next/link"

type SortColumn = "user" | "role" | "status" | "added" | "active"
type FilterType = "role" | "status" | "dateAdded" | "lastActive"
type DateOperator = "is" | "isnt"
type RelativeDateFilterValue = { mode: "relative"; days: 7 | 30 | 60 | 90 }
type RangeDateFilterValue = { mode: "range"; from: string | null; to: string | null }
type DateFilterValue = RelativeDateFilterValue | RangeDateFilterValue
type FilterRule =
  | { id: string; type: "role" | "status"; value: string[] }
  | { id: string; type: "dateAdded" | "lastActive"; operator: DateOperator; value: DateFilterValue }
type FilterGroup = { match: "all" | "any"; rules: FilterRule[] }

const FILTER_TYPE_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: "role", label: "Role" },
  { value: "status", label: "Status" },
  { value: "dateAdded", label: "Date Added" },
  { value: "lastActive", label: "Last Active" },
]

const STATUS_OPTIONS: Array<{ value: UserListItem["status"]; label: string }> = [
  { value: "active", label: "Active" },
  { value: "unverified", label: "Unverified" },
  { value: "banned", label: "Banned" },
]

const DATE_FILTER_OPTIONS = [
  { value: 7, label: "In the last 7 days" },
  { value: 30, label: "In the last 30 days" },
  { value: 60, label: "In the last 60 days" },
  { value: 90, label: "In the last 90 days" },
]

function emptyFilterGroup(): FilterGroup {
  return { match: "all", rules: [] }
}

function makeFilterRuleId() {
  return `filter-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isDateRule(rule: FilterRule): rule is Extract<FilterRule, { type: "dateAdded" | "lastActive" }> {
  return rule.type === "dateAdded" || rule.type === "lastActive"
}

function isValueRule(rule: FilterRule): rule is Extract<FilterRule, { type: "role" | "status" }> {
  return rule.type === "role" || rule.type === "status"
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [pendingDeleteUser, setPendingDeleteUser] = useState<UserListItem | null>(null)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState<FilterGroup>(emptyFilterGroup)
  const [pendingFilters, setPendingFilters] = useState<FilterGroup>(emptyFilterGroup)
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const userSelection = useAdminBulkSelection()
  const userSort = useAdminSort<SortColumn>()

  async function loadUsers() {
    setLoading(true)
    const result = await listUsers(1, 50)

    if (result.error) {
      setError(result.error)
    } else if (result.success) {
      setUsers(result.users)
      setCurrentUserId(result.currentUserId)
      setError(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const getInitials = (email: string, displayName: string | null) => {
    if (displayName) {
      return displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    return email.slice(0, 2).toUpperCase()
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">Super Admin</Badge>
      case "end_user":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">User</Badge>
      default:
        return <Badge variant="secondary">{role}</Badge>
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "super_admin":
        return "Super Admin"
      case "end_user":
        return "User"
      default:
        return role
    }
  }

  const getStatusBadge = (status: UserListItem["status"]) => {
    switch (status) {
      case "banned":
        return <Badge variant="destructive">Banned</Badge>
      case "unverified":
        return <Badge variant="secondary">Unverified</Badge>
      default:
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Active</Badge>
    }
  }

  const getStatusLabel = (status: UserListItem["status"]) => {
    switch (status) {
      case "banned":
        return "Banned"
      case "unverified":
        return "Unverified"
      default:
        return "Active"
    }
  }

  const formatLastActive = (lastSignIn: string | null) => {
    if (!lastSignIn) return "Never"

    const date = new Date(lastSignIn)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return "Just now"
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? "s" : ""} ago`
    return `${Math.floor(diffDays / 30)} month${diffDays >= 60 ? "s" : ""} ago`
  }

  const handleDeleteUser = async () => {
    if (!pendingDeleteUser) {
      return
    }

    setDeletingUserId(pendingDeleteUser.id)
    const result = await deleteUser(pendingDeleteUser.id)

    if (!result.success) {
      setError(result.error || "Failed to delete user")
      setDeletingUserId(null)
      return
    }

    setPendingDeleteUser(null)
    setDeletingUserId(null)
    await loadUsers()
  }

  const handleMassDelete = async () => {
    if (!userSelection.selectedCount) {
      return
    }

    setMassDeleting(true)
    const result = await deleteUsers(Array.from(userSelection.selectedIds))

    if (!result.success) {
      setError(result.error || "Failed to delete users")
      setMassDeleting(false)
      return
    }

    userSelection.clearSelection()
    setMassDeleting(false)
    setMassDeleteConfirmOpen(false)
    await loadUsers()
  }

  function openFilterModal() {
    setPendingFilters({
      match: filters.match,
      rules: filters.rules.map((rule) =>
        isValueRule(rule) ? { ...rule, value: [...rule.value] } : { ...rule, value: { ...rule.value } }
      ),
    })
    setFilterModalOpen(true)
  }

  function addPendingFilter(type: FilterType) {
    const rule: FilterRule =
      type === "role" || type === "status"
        ? { id: makeFilterRuleId(), type, value: [] }
        : { id: makeFilterRuleId(), type, operator: "is", value: { mode: "relative", days: 7 } }

    setPendingFilters((prev) => ({
      ...prev,
      rules: [...prev.rules, rule],
    }))
  }

  function removePendingRule(ruleId: string) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== ruleId),
    }))
  }

  function togglePendingValue(ruleId: string, value: string) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) =>
        rule.id === ruleId && isValueRule(rule)
          ? { ...rule, value: rule.value.includes(value) ? rule.value.filter((item) => item !== value) : [...rule.value, value] }
          : rule
      ),
    }))
  }

  function updatePendingDateOperator(ruleId: string, operator: DateOperator) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => (rule.id === ruleId && isDateRule(rule) ? { ...rule, operator } : rule)),
    }))
  }

  function updatePendingDateValue(ruleId: string, nextValue: string) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => {
        if (rule.id !== ruleId || !isDateRule(rule)) return rule
        if (nextValue === "custom") {
          return { ...rule, value: { mode: "range", from: null, to: null } }
        }

        return { ...rule, value: { mode: "relative", days: Number(nextValue) as 7 | 30 | 60 | 90 } }
      }),
    }))
  }

  function updatePendingDateRange(ruleId: string, boundary: "from" | "to", selectedDate: Date | undefined) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => {
        if (rule.id !== ruleId || !isDateRule(rule)) return rule
        const currentRange = rule.value.mode === "range" ? rule.value : { mode: "range" as const, from: null, to: null }
        return { ...rule, value: { ...currentRange, [boundary]: fromCalendarDate(selectedDate) } }
      }),
    }))
  }

  function applyFilters() {
    setFilters({
      match: pendingFilters.match,
      rules: pendingFilters.rules.filter((rule) => {
        if (isValueRule(rule)) return rule.value.length > 0
        if (rule.value.mode === "relative") return true
        return Boolean(rule.value.from || rule.value.to)
      }),
    })
    userSelection.clearSelection()
    setFilterModalOpen(false)
  }

  function clearFilters() {
    setFilters(emptyFilterGroup())
    userSelection.clearSelection()
  }

  function formatFilterRule(rule: FilterRule) {
    if (rule.type === "status") {
      const labels = STATUS_OPTIONS.filter((option) => rule.value.includes(option.value)).map((option) => option.label)
      return labels.length ? `Status: ${labels.join(", ")}` : "Status"
    }

    if (rule.type === "role") {
      const labels = roleOptions.filter((role) => rule.value.includes(role)).map(getRoleLabel)
      return labels.length ? `Role: ${labels.join(", ")}` : "Role"
    }

    if (!isDateRule(rule)) return "Filter"

    const label = rule.type === "dateAdded" ? "Date Added" : "Last Active"
    const operatorLabel = rule.operator === "is" ? "is" : "isn't"
    if (rule.value.mode === "relative") {
      return `${label} ${operatorLabel} in the last ${rule.value.days} days`
    }

    const formatValue = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    const range = rule.value.from && rule.value.to
      ? `${formatValue(rule.value.from)} to ${formatValue(rule.value.to)}`
      : rule.value.from
        ? `After ${formatValue(rule.value.from)}`
        : rule.value.to
          ? `Before ${formatValue(rule.value.to)}`
          : "Custom range"

    return `${label} ${operatorLabel} ${range}`
  }

  function isWithinPastDays(value: string | null, days: number) {
    if (!value) return false
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    return date.getTime() >= Date.now() - Number(days) * 24 * 60 * 60 * 1000
  }

  function isWithinDateRange(value: string | null, range: RangeDateFilterValue) {
    if (!value) return false
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    if (range.from && date < new Date(range.from)) return false
    if (range.to) {
      const end = new Date(range.to)
      end.setUTCHours(23, 59, 59, 999)
      if (date > end) return false
    }
    return true
  }

  function matchesDateRule(value: string | null, rule: Extract<FilterRule, { type: "dateAdded" | "lastActive" }>) {
    const matches = rule.value.mode === "relative"
      ? isWithinPastDays(value, rule.value.days)
      : isWithinDateRange(value, rule.value)

    return rule.operator === "is" ? matches : !matches
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const roleOptions = Array.from(new Set(users.map((user) => user.role)))
  const filteredUsers = users.filter((user) => {
    const searchMatch = !normalizedSearchQuery || `${user.display_name ?? ""} ${user.email} ${getRoleLabel(user.role)} ${getStatusLabel(user.status)}`
      .toLowerCase()
      .includes(normalizedSearchQuery)

    if (!searchMatch) return false
    if (filters.rules.length === 0) return true

    const matches = filters.rules.map((rule) => {
      if (rule.type === "status") return rule.value.includes(user.status)
      if (rule.type === "role") return rule.value.includes(user.role)
      if (rule.type === "dateAdded") return matchesDateRule(user.created_at, rule)
      if (rule.type === "lastActive") return matchesDateRule(user.last_sign_in_at, rule)
      return false
    })

    return filters.match === "all" ? matches.every(Boolean) : matches.some(Boolean)
  })
  const deletableUserIds = filteredUsers
    .filter((user) => user.id !== currentUserId)
    .map((user) => user.id)
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (!userSort.sortColumn) return 0

    const dir = userSort.sortDirection === "asc" ? 1 : -1

    if (userSort.sortColumn === "user") {
      const aLabel = a.display_name || a.email
      const bLabel = b.display_name || b.email
      return aLabel.localeCompare(bLabel) * dir
    }

    if (userSort.sortColumn === "role") return getRoleLabel(a.role).localeCompare(getRoleLabel(b.role)) * dir
    if (userSort.sortColumn === "status") return getStatusLabel(a.status).localeCompare(getStatusLabel(b.status)) * dir
    if (userSort.sortColumn === "added") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir

    const aActive = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
    const bActive = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
    return (aActive - bActive) * dir
  })

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Users" }]}
          />

          <AdminTableShell
            title="Users"
            icon={<User className="text-muted-foreground" />}
            count={filteredUsers.length}
            selectedCount={userSelection.selectedCount}
            onClearSelection={userSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => { setError(null); setMassDeleteConfirmOpen(true) }}
                selectedCount={userSelection.selectedCount}
              />
            }
            titleMeta={
              filters.rules.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-medium">
                    Matching {filters.match === "all" ? "all" : "any"}
                  </Badge>
                  {filters.rules.map((rule) => (
                    <Badge key={rule.id} variant="secondary" className="gap-1 pr-1">
                      {formatFilterRule(rule)}
                      <span className="text-xs font-medium">- Clear all ({filters.rules.length})</span>
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    userSelection.clearSelection()
                  }}
                  placeholder="Search users"
                />
                <TableRightActionsButton variant="outline" className="relative" onClick={openFilterModal}>
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {filters.rules.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                      {filters.rules.length}
                    </span>
                  )}
                </TableRightActionsButton>
                <TableRightActionsButton asChild>
                  <Link href="/admin/users/new">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add User</span>
                  </Link>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={!loading ? <AdminTableSummaryFooter count={filteredUsers.length} label="users" /> : null}
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={userSelection.isPageSelected(deletableUserIds)}
                        onCheckedChange={() => userSelection.togglePage(deletableUserIds)}
                        aria-label="Select all users"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={userSort.sortColumn === "user"}
                        direction={userSort.sortDirection}
                        onClick={() => userSort.toggleSort("user")}
                      >
                        User
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={userSort.sortColumn === "role"}
                        direction={userSort.sortDirection}
                        onClick={() => userSort.toggleSort("role")}
                      >
                        Role
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={userSort.sortColumn === "status"}
                        direction={userSort.sortDirection}
                        onClick={() => userSort.toggleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={userSort.sortColumn === "added"}
                        direction={userSort.sortDirection}
                        onClick={() => userSort.toggleSort("added")}
                      >
                        Date Added
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={userSort.sortColumn === "active"}
                        direction={userSort.sortDirection}
                        onClick={() => userSort.toggleSort("active")}
                      >
                        Last Active
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={7} showCheckbox actionCount={1} />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <p className="text-red-500">Error loading users: {error}</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <User className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">No users found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedUsers.map((user) => (
                      <TableRow
                        key={user.id}
                        data-state={userSelection.selectedIds.has(user.id) ? "selected" : undefined}
                        className="group"
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={userSelection.selectedIds.has(user.id)}
                            onCheckedChange={() => userSelection.toggleOne(user.id)}
                            disabled={user.id === currentUserId}
                            aria-label={`Select ${user.display_name || user.email}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <div className="flex min-w-0 items-center space-x-4">
                            <Avatar className="h-10 w-10">
                              {user.image && <AvatarImage src={user.image} alt={user.display_name || user.email} />}
                              <AvatarFallback className="text-sm font-medium text-muted-foreground">
                                {getInitials(user.email, user.display_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-medium sm:text-base">
                                {user.display_name || user.email.split("@")[0]}
                              </h4>
                              <p className="truncate text-xs text-muted-foreground sm:text-sm">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell column="meta">{getRoleBadge(user.role)}</TableCell>
                        <TableCell column="meta">{getStatusBadge(user.status)}</TableCell>
                        <TableCell column="mutedMeta">{formatDate(user.created_at)}</TableCell>
                        <TableCell column="mutedMeta">{formatLastActive(user.last_sign_in_at)}</TableCell>
                        <TableCell column="meta">
                          {user.id !== currentUserId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              disabled={deletingUserId === user.id}
                              onClick={() => { setError(null); setPendingDeleteUser(user) }}
                              aria-label={`Delete ${user.display_name || user.email}`}
                              title={`Delete ${user.display_name || user.email}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>

          <Dialog open={filterModalOpen} onOpenChange={setFilterModalOpen}>
            <DialogContent size="admin" className="flex flex-col overflow-hidden p-6">
              <DialogHeader>
                <DialogTitle>Filter Platform Users</DialogTitle>
                <DialogDescription className="sr-only">Choose filters to narrow platform users.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 space-y-4 overflow-y-auto">
                <div className="flex items-center gap-3 text-sm font-medium">
                  <span>Matching</span>
                  <Tabs
                    value={pendingFilters.match}
                    onValueChange={(match) => {
                      if (match === "all" || match === "any") {
                        setPendingFilters((prev) => ({ ...prev, match }))
                      }
                    }}
                  >
                    <TabsList className="h-11 rounded-lg bg-muted/70 p-1">
                      <TabsTrigger value="all" className="rounded-md px-4 py-2">
                        all
                      </TabsTrigger>
                      <TabsTrigger value="any" className="rounded-md px-4 py-2">
                        any
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <span>of these:</span>
                </div>

                {pendingFilters.rules.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No filters added yet.
                  </div>
                ) : (
                  pendingFilters.rules.map((rule) => (
                    <div key={rule.id} className="space-y-4 rounded-2xl bg-muted/65 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-medium">
                          {rule.type === "status"
                            ? "Status"
                            : rule.type === "dateAdded"
                              ? "Date Added"
                              : rule.type === "lastActive"
                                ? "Last Active"
                                : "Role"}
                        </h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => removePendingRule(rule.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      {isValueRule(rule) && (
                        <div className="flex flex-wrap gap-3">
                          {(rule.type === "status" ? STATUS_OPTIONS : roleOptions.map((role) => ({ value: role, label: getRoleLabel(role) }))).map((option) => {
                            const isActive = rule.value.includes(option.value)
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => togglePendingValue(rule.id, option.value)}
                                className={cn(
                                  "rounded-full border px-5 py-3 text-sm transition-colors",
                                  isActive
                                    ? "border-foreground text-foreground shadow-sm"
                                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                                )}
                              >
                                {option.label}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {isDateRule(rule) && (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-[140px,1fr]">
                            <Select
                              value={rule.operator}
                              onValueChange={(value: DateOperator) => updatePendingDateOperator(rule.id, value)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="is">Is</SelectItem>
                                <SelectItem value="isnt">Isn&apos;t</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select
                              value={rule.value.mode === "relative" ? String(rule.value.days) : "custom"}
                              onValueChange={(value) => updatePendingDateValue(rule.id, value)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DATE_FILTER_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={String(option.value)}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                                <SelectItem value="custom">Custom range</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {rule.value.mode === "range" && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`${rule.id}-from`} className="text-xs text-muted-foreground">
                                  Start date
                                </Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      id={`${rule.id}-from`}
                                      type="button"
                                      variant="outline"
                                      className={cn(
                                        "w-full justify-between font-normal",
                                        !rule.value.from && "text-muted-foreground"
                                      )}
                                    >
                                      {formatDatePickerLabel(rule.value.from, "Pick a start date")}
                                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarPicker
                                      mode="single"
                                      selected={toCalendarDate(rule.value.from)}
                                      onSelect={(date) => updatePendingDateRange(rule.id, "from", date)}
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`${rule.id}-to`} className="text-xs text-muted-foreground">
                                  End date
                                </Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      id={`${rule.id}-to`}
                                      type="button"
                                      variant="outline"
                                      className={cn(
                                        "w-full justify-between font-normal",
                                        !rule.value.to && "text-muted-foreground"
                                      )}
                                    >
                                      {formatDatePickerLabel(rule.value.to, "Pick an end date")}
                                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarPicker
                                      mode="single"
                                      selected={toCalendarDate(rule.value.to)}
                                      onSelect={(date) => updatePendingDateRange(rule.id, "to", date)}
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}

                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline">
                        Add filter
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {FILTER_TYPE_OPTIONS.map((option) => (
                        <DropdownMenuItem key={option.value} onSelect={() => addPendingFilter(option.value)}>
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setPendingFilters(emptyFilterGroup())}
                  className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setFilterModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={applyFilters}>
                    Apply Filters
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <ConfirmDestructive
            action="delete-user"
            open={Boolean(pendingDeleteUser)}
            confirmationName={pendingDeleteUser?.display_name || pendingDeleteUser?.email}
            error={error}
            impactRequest={pendingDeleteUser ? { ids: [pendingDeleteUser.id], target: "user" } : undefined}
            onCancel={() => { setPendingDeleteUser(null); setError(null) }}
            onConfirm={handleDeleteUser}
            disabled={Boolean(pendingDeleteUser && deletingUserId === pendingDeleteUser.id)}
            title="Delete user?"
            description={
              pendingDeleteUser
                ? `Delete ${pendingDeleteUser.display_name || pendingDeleteUser.email}. This also removes their auth records and any sites or media they own through cascading deletes. This cannot be undone.`
                : ""
            }
            confirmLabel={pendingDeleteUser && deletingUserId === pendingDeleteUser.id ? "Deleting..." : "Delete"}
          />

          <ConfirmDestructive
            action="delete-user"
            open={massDeleteConfirmOpen}
            confirmationName={`DELETE ${userSelection.selectedCount} USERS`}
            error={error}
            impactRequest={{ ids: Array.from(userSelection.selectedIds), target: "user" }}
            onCancel={() => { setMassDeleteConfirmOpen(false); setError(null) }}
            onConfirm={handleMassDelete}
            disabled={massDeleting}
            title="Delete selected users?"
            description={`Delete ${userSelection.selectedCount} selected user${userSelection.selectedCount === 1 ? "" : "s"}. This also removes their auth records and any sites or media they own through cascading deletes. This cannot be undone.`}
            confirmLabel={massDeleting ? "Deleting..." : "Delete selected"}
          />
        </div>
      </AdminLayout>
    </>
  )
}
