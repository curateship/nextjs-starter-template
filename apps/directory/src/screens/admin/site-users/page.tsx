"use client"

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react"
import CalendarIcon from "lucide-react/dist/esm/icons/calendar.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Users from "lucide-react/dist/esm/icons/users.js"
import X from "lucide-react/dist/esm/icons/x.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  AdminBulkDeleteButton,
  AdminListFooter,
  AdminListPending,
  AdminSortableHead,
  AdminSortButton,
  AdminTableShell,
  ConfirmDestructive,
  RelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
import { toCalendarDate, fromCalendarDate, formatDatePickerLabel } from "@/lib/utils/calendar-dates"
import { cn } from "@/lib/utils/tailwind"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"
import {
  createSiteUser,
  deleteSiteUsers,
  getSiteUsers,
  updateSiteUser,
  type SiteUserListItem
} from "@/lib/actions/site-users/site-user-actions"
import {
  cloneSiteUserFilterGroup,
  createSiteUserFilterRule,
  emptySiteUserFilterGroup,
  formatSiteUserFilterRule,
  getSiteUserFilterTypeLabel,
  pruneSiteUserFilterGroup,
  SITE_USER_FILTER_TYPE_OPTIONS,
  SITE_USER_RELATIVE_DAY_OPTIONS,
  SITE_USER_ROLE_OPTIONS,
  SITE_USER_STATUS_OPTIONS,
  type SiteUserDateOperator,
  type SiteUserFilterGroup,
  type SiteUserFilterRule,
  type SiteUserFilterType
} from "@/lib/actions/site-users/site-user-filters"

function makeFilterRuleId() {
  return `site-user-filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isDateRule(
  rule: SiteUserFilterRule
): rule is Extract<SiteUserFilterRule, { type: "lastEngaged" | "dateAdded" }> {
  return rule.type === "lastEngaged" || rule.type === "dateAdded"
}

function isValueRule(rule: SiteUserFilterRule): rule is Extract<SiteUserFilterRule, { type: "status" | "role" }> {
  return rule.type === "status" || rule.type === "role"
}

function getRoleBadge(role: string) {
  switch (role) {
    case "owner":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">Owner</Badge>
    case "admin":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Admin</Badge>
    default:
      return <Badge variant="secondary">Member</Badge>
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Active</Badge>
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

type SortColumn = "user" | "role" | "status" | "added" | "engaged"

function compareNullableStrings(a: string | null | undefined, b: string | null | undefined) {
  return (a || "\uffff").localeCompare(b || "\uffff")
}

function getUserInitials(user: SiteUserListItem) {
  const label = user.display_name || user.email
  return label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export default function SiteUsersPage() {
  const { currentSite, loading: siteLoading, pageSize: contextPageSize } = useSiteSwitcher()
  const pageSize = contextPageSize
  const [users, setUsers] = useState<SiteUserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const userSelection = useAdminBulkSelection()
  const clearUserSelection = userSelection.clearSelection
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const userSort = useAdminSort<SortColumn>()
  const [searchQuery, setSearchQuery] = useState("")
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const requestIdRef = useRef(0)

  const [filters, setFilters] = useState<SiteUserFilterGroup>(emptySiteUserFilterGroup)
  const [pendingFilters, setPendingFilters] = useState<SiteUserFilterGroup>(emptySiteUserFilterGroup)
  const [pendingFilteredTotal, setPendingFilteredTotal] = useState(0)
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSite?.id}|${deferredSearchQuery}|${JSON.stringify(filters)}|${userSort.sortColumn}|${userSort.sortDirection}`
  // Searching, filtering or re-sorting from a later page would otherwise
  // land you past the end of the shorter result.
  useResetPageOnListChange(setCurrentPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page
  // and rows-per-page included, so a bulk action only ever means rows on
  // screen.
  useClearSelectionOnListChange(userSelection, `${listQueryKey}|${currentPage}|${pageSize}`)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    email: "",
    displayName: "",
    password: "",
    role: "member" as "admin" | "member",
    status: "active" as "active" | "suspended"
  })
  const [creating, setCreating] = useState(false)
  const [editUser, setEditUser] = useState<SiteUserListItem | null>(null)
  const [editForm, setEditForm] = useState({
    displayName: "",
    role: "member" as "admin" | "member",
    status: "active" as "active" | "suspended"
  })
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createFieldMissing, setCreateFieldMissing] = useState<"email" | "password" | null>(null)

  const loadUsers = useCallback(async () => {
    const requestId = ++requestIdRef.current

    if (siteLoading || !currentSite?.id) {
      setLoading(siteLoading)
      setError(null)
      setUsers([])
      setTotal(0)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const result = await getSiteUsers({ data: { siteId: currentSite.id, options: {
        filterGroup: filters.rules.length ? filters : undefined,
        searchQuery: deferredSearchQuery,
        page: currentPage,
        pageSize
      } } })

      if (requestId !== requestIdRef.current) return

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      setUsers(result.data ?? [])
      setTotal(result.total)
      setLoading(false)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : "Failed to load site users")
      setLoading(false)
    }
  }, [currentSite?.id, currentPage, deferredSearchQuery, filters, pageSize, siteLoading])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!filterModalOpen || !currentSite?.id) {
      setPendingFilteredTotal(0)
      return
    }

    const previewFilters = pruneSiteUserFilterGroup(cloneSiteUserFilterGroup(pendingFilters))
    if (!previewFilters.rules.length) {
      setPendingFilteredTotal(0)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      const result = await getSiteUsers({ data: { siteId: currentSite.id, options: {
        filterGroup: previewFilters,
        searchQuery: deferredSearchQuery,
        page: 1,
        pageSize
      } } })

      if (cancelled) return
      setPendingFilteredTotal(result.error ? 0 : result.total)
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [currentSite?.id, deferredSearchQuery, filterModalOpen, pageSize, pendingFilters])

  const activeFilterCount = filters.rules.length
  const hasSearchQuery = deferredSearchQuery.trim().length > 0
  const deletableUsersOnPage = users.filter((user) => user.role !== "owner")
  const deletableUserIdsOnPage = deletableUsersOnPage.map((user) => user.id)

  const resetSelectionForCurrentView = useCallback(() => {
    clearUserSelection()
    setCurrentPage(1)
  }, [clearUserSelection])

  function openFilterModal() {
    const clonedFilters = cloneSiteUserFilterGroup(filters)
    setPendingFilters(clonedFilters)
    setPendingFilteredTotal(clonedFilters.rules.length ? total : 0)
    setFilterModalOpen(true)
  }

  function addPendingFilter(type: SiteUserFilterType) {
    const rule = createSiteUserFilterRule(makeFilterRuleId(), type)
    setPendingFilters((prev) => ({
      ...prev,
      rules: [...prev.rules, rule]
    }))
  }

  function updatePendingRule(ruleId: string, updater: (rule: SiteUserFilterRule) => SiteUserFilterRule) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => (rule.id === ruleId ? updater(rule) : rule))
    }))
  }

  function removePendingRule(ruleId: string) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== ruleId)
    }))
  }

  function togglePendingValue(ruleId: string, value: string) {
    updatePendingRule(ruleId, (rule) => {
      if (!isValueRule(rule)) return rule
      return {
        ...rule,
        value: rule.value.includes(value) ? rule.value.filter((item) => item !== value) : [...rule.value, value]
      }
    })
  }

  function updatePendingDateOperator(ruleId: string, operator: SiteUserDateOperator) {
    updatePendingRule(ruleId, (rule) => {
      if (!isDateRule(rule)) return rule
      return { ...rule, operator }
    })
  }

  function updatePendingDateValue(ruleId: string, nextValue: string) {
    updatePendingRule(ruleId, (rule) => {
      if (!isDateRule(rule)) return rule
      if (nextValue === "custom") {
        return {
          ...rule,
          value: { mode: "range", from: null, to: null }
        }
      }

      const days = Number(nextValue) as 7 | 30 | 60 | 90
      return {
        ...rule,
        value: { mode: "relative", days }
      }
    })
  }

  function updatePendingDateRange(ruleId: string, boundary: "from" | "to", selectedDate: Date | undefined) {
    updatePendingRule(ruleId, (rule) => {
      if (!isDateRule(rule)) return rule
      const currentRange = rule.value.mode === "range" ? rule.value : { mode: "range" as const, from: null, to: null }
      return {
        ...rule,
        value: {
          ...currentRange,
          [boundary]: fromCalendarDate(selectedDate)
        }
      }
    })
  }

  function clearAllFilters() {
    setFilters(emptySiteUserFilterGroup())
    resetSelectionForCurrentView()
  }

  function applyFilters() {
    const nextFilters = pruneSiteUserFilterGroup(cloneSiteUserFilterGroup(pendingFilters))
    setFilters(nextFilters)
    setFilterModalOpen(false)
    resetSelectionForCurrentView()
  }

  const sortedUsers = [...users].sort((a, b) => {
    if (!userSort.sortColumn) return 0

    const dir = userSort.sortDirection === "asc" ? 1 : -1

    if (userSort.sortColumn === "user") {
      const aLabel = a.display_name || a.email
      const bLabel = b.display_name || b.email
      return aLabel.localeCompare(bLabel) * dir
    }

    if (userSort.sortColumn === "role") return a.role.localeCompare(b.role) * dir
    if (userSort.sortColumn === "status") return a.status.localeCompare(b.status) * dir
    if (userSort.sortColumn === "added") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    if (userSort.sortColumn === "engaged") {
      const aTime = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
      const bTime = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
      if (aTime === bTime) {
        return compareNullableStrings(a.display_name || a.email, b.display_name || b.email) * dir
      }
      return (aTime - bTime) * dir
    }

    return 0
  })

  const handleDelete = (membershipId: string) => {
    setPendingDeleteId(membershipId)
    setConfirmDeleteOpen(true)
  }

  const confirmDelete = async () => {
    if (!currentSite?.id || !pendingDeleteId) return

    setMassDeleting(true)
    setErrorMessage(null)

    try {
      const result = await deleteSiteUsers({ data: { input: {
        siteId: currentSite.id,
        membershipIds: [pendingDeleteId]
      } } })

      if (result.error) {
        setErrorMessage(result.error)
        return
      }

      userSelection.remove(pendingDeleteId)
      await loadUsers()
      setConfirmDeleteOpen(false)
      setPendingDeleteId(null)
      showActionSuccess("User removed.")
    } finally {
      setMassDeleting(false)
    }
  }

  const confirmMassDelete = async () => {
    if (!currentSite?.id || !userSelection.selectedCount) return

    setMassDeleting(true)
    setErrorMessage(null)
    const removedCount = userSelection.selectedCount

    try {
      const result = await deleteSiteUsers({ data: { input: {
        siteId: currentSite.id,
        membershipIds: Array.from(userSelection.selectedIds)
      } } })

      if (result.error) {
        setErrorMessage(result.error)
        return
      }

      clearUserSelection()
      await loadUsers()
      setMassDeleteConfirmOpen(false)
      showActionSuccess(removedCount === 1 ? "User removed." : "Users removed.")
    } finally {
      setMassDeleting(false)
    }
  }

  function openEditModal(user: SiteUserListItem) {
    setEditUser(user)
    setEditForm({
      displayName: user.display_name || "",
      role: user.role === "admin" ? "admin" : "member",
      status: user.status
    })
    dismissErrorToast()
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!currentSite?.id) return

    // Named here rather than left to the browser's own bubble, which never
    // shows for a field on a tab panel that has been switched away.
    const firstEmpty = !createForm.email.trim() ? "email" : !createForm.password ? "password" : null
    if (firstEmpty) {
      setCreateFieldMissing(firstEmpty)
      showErrorToast(firstEmpty === "email" ? "Email is required" : "Password is required")
      return
    }

    setCreateFieldMissing(null)

    setCreating(true)
    dismissErrorToast()
    const result = await createSiteUser({ data: { input: {
      siteId: currentSite.id,
      email: createForm.email,
      displayName: createForm.displayName,
      password: createForm.password,
      role: createForm.role,
      status: createForm.status
    } } })

    if (result.error) {
      showErrorToast(result.error)
      setCreating(false)
      return
    }

    setCreateModalOpen(false)
    setCreateForm({
      email: "",
      displayName: "",
      password: "",
      role: "member",
      status: "active"
    })
    setCreating(false)
    await loadUsers()
    showActionSuccess("User created.")
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!currentSite?.id || !editUser) return

    setSaving(true)
    dismissErrorToast()
    const result = await updateSiteUser({ data: { input: {
      membershipId: editUser.id,
      siteId: currentSite.id,
      displayName: editForm.displayName,
      role: editForm.role,
      status: editForm.status
    } } })

    if (result.error) {
      showErrorToast(result.error)
      setSaving(false)
      return
    }

    setEditUser(null)
    setSaving(false)
    await loadUsers()
    showActionSuccess("User updated.")
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Site Users" }]}
          />

          <AdminTableShell
            error={error ? { message: error, onRetry: () => loadUsers() } : null}
            title="Site Users"
            icon={<Users className="text-muted-foreground" />}
            count={total}
            loading={siteLoading || loading}
            selectedCount={userSelection.selectedCount}
            onClearSelection={userSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={userSelection.selectedCount}
              />
            }
            titleMeta={
              activeFilterCount > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-medium">
                    Matching {filters.match === "all" ? "all" : "any"}
                  </Badge>
                  {filters.rules.map((rule) => (
                    <Badge key={rule.id} variant="secondary" className="gap-1 pr-1">
                      {formatSiteUserFilterRule(rule)}
                      <span className="text-xs font-medium">- Clear all ({activeFilterCount})</span>
                      <button
                        type="button"
                        onClick={clearAllFilters}
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
                    resetSelectionForCurrentView()
                  }}
                  placeholder="Search users"
                />
                <TableRightActionsButton variant="outline" className="relative" onClick={openFilterModal}>
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {activeFilterCount > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </TableRightActionsButton>
                <TableRightActionsButton
                  onClick={() => {
                    setErrorMessage(null)
                    setCreateModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add User</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={
              !loading ? (
                <AdminListFooter
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  pageSize={pageSize}
                  total={total}
                />
              ) : null
            }
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={userSelection.isPageSelected(deletableUserIdsOnPage)}
                        onCheckedChange={() => userSelection.togglePage(deletableUserIdsOnPage)}
                        aria-label="Select all site users"
                      />
                    </TableHead>
                    <AdminSortableHead column="main" sort={userSort} sortKey="user">User</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={userSort} sortKey="role">Role</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={userSort} sortKey="status">Status</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={userSort} sortKey="added">Date Added</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={userSort} sortKey="engaged">Last Active</AdminSortableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(siteLoading || loading) && sortedUsers.length === 0 ? (
                    <AdminListPending />
                  ) : !currentSite?.id ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">Select a site to view scoped users.</p>
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {hasSearchQuery || activeFilterCount > 0
                            ? "No users found matching your search."
                            : "No users found for this site"}
                        </p>
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
                            disabled={user.role === "owner"}
                            aria-label={`Select ${user.display_name || user.email}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar className="h-10 w-10">
                              {user.image && <AvatarImage src={user.image} alt={user.display_name || user.email} />}
                              <AvatarFallback className="text-sm font-medium text-muted-foreground">
                                {getUserInitials(user)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-medium sm:text-base" title={user.display_name || user.email}>{user.display_name || user.email}</h4>
                              <p className="truncate text-xs text-muted-foreground sm:text-sm" title={user.email}>{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell column="meta">{getRoleBadge(user.role)}</TableCell>
                        <TableCell column="meta">{getStatusBadge(user.status)}</TableCell>
                        <TableCell column="mutedMeta"><RelativeDate date={user.created_at} /></TableCell>
                        <TableCell column="mutedMeta"><RelativeDate date={user.last_sign_in_at} fallback="Never" /></TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openEditModal(user)}
                              title="Edit User"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="sr-only">Edit User</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              onClick={() => handleDelete(user.id)}
                              title="Delete User"
                              disabled={user.role === "owner" || massDeleting}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete User</span>
                            </Button>
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
        </div>

        <Dialog open={filterModalOpen} onOpenChange={setFilterModalOpen}>
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>Filter Site Users</DialogTitle>
            </DialogHeader>
            <DialogBody>
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
                      <div>
                        <h3 className="font-medium">{getSiteUserFilterTypeLabel(rule.type)}</h3>
                      </div>
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
                        {(rule.type === "status" ? SITE_USER_STATUS_OPTIONS : SITE_USER_ROLE_OPTIONS).map((option) => {
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
                            onValueChange={(value: SiteUserDateOperator) => updatePendingDateOperator(rule.id, value)}
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
                              {SITE_USER_RELATIVE_DAY_OPTIONS.map((option) => (
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
                    {SITE_USER_FILTER_TYPE_OPTIONS.map((option) => (
                      <DropdownMenuItem key={option.value} onSelect={() => addPendingFilter(option.value)}>
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </DialogBody>

            <DialogFooter className="justify-between">
              <button
                type="button"
                onClick={() => {
                  setPendingFilters(emptySiteUserFilterGroup())
                  setPendingFilteredTotal(0)
                }}
                className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
              >
                Clear all ({pendingFilteredTotal})
              </button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setFilterModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={applyFilters}>
                  Apply Filters
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent variant="admin" busy={creating}>
            <DialogHeader>
              <DialogTitle>Add Site User</DialogTitle>
            </DialogHeader>
            <form
              noValidate
              onSubmit={handleCreateUser}
              className="flex min-h-0 flex-1 flex-col [&_label+input]:mt-2 [&_label+button]:mt-2"
            >
              <DialogBody>
              <div>
                <Label htmlFor="site-user-email">Email *</Label>
                <Input
                  id="site-user-email"
                  type="email"
                  aria-invalid={(createFieldMissing === "email" && !createForm.email.trim()) || undefined}
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      email: e.target.value
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="site-user-display-name">Display Name</Label>
                <Input
                  id="site-user-display-name"
                  value={createForm.displayName}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      displayName: e.target.value
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="site-user-password">Password *</Label>
                <Input
                  id="site-user-password"
                  type="password"
                  aria-invalid={(createFieldMissing === "password" && !createForm.password) || undefined}
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      password: e.target.value
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <Label htmlFor="site-user-role">Role</Label>
                  <Select
                    value={createForm.role}
                    onValueChange={(value: "admin" | "member") => setCreateForm((prev) => ({ ...prev, role: value }))}
                  >
                    <SelectTrigger id="site-user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_USER_ROLE_OPTIONS.filter((option) => option.value !== "owner").map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="site-user-status">Status</Label>
                  <Select
                    value={createForm.status}
                    onValueChange={(value: "active" | "suspended") =>
                      setCreateForm((prev) => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger id="site-user-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_USER_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              </DialogBody>

              <DialogFooter className="justify-between">
                <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                  Create User
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={editUser !== null}
          onOpenChange={(open) => {
            if (!open) setEditUser(null)
          }}
        >
          <DialogContent variant="admin" busy={saving}>
            <DialogHeader>
              <DialogTitle>Edit Site User</DialogTitle>
            </DialogHeader>
            <form
              noValidate
              onSubmit={handleUpdateUser}
              className="flex min-h-0 flex-1 flex-col [&_label+input]:mt-2 [&_label+button]:mt-2"
            >
              <DialogBody>
              <div>
                <Label>Email</Label>
                <Input value={editUser?.email || ""} disabled />
              </div>
              <div>
                <Label htmlFor="edit-site-user-display-name">Display Name</Label>
                <Input
                  id="edit-site-user-display-name"
                  value={editForm.displayName}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      displayName: e.target.value
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-site-user-role">Role</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={(value: "admin" | "member") => setEditForm((prev) => ({ ...prev, role: value }))}
                    disabled={editUser?.role === "owner"}
                  >
                    <SelectTrigger id="edit-site-user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_USER_ROLE_OPTIONS.filter((option) => option.value !== "owner").map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-site-user-status">Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(value: "active" | "suspended") =>
                      setEditForm((prev) => ({ ...prev, status: value }))
                    }
                    disabled={editUser?.role === "owner"}
                  >
                    <SelectTrigger id="edit-site-user-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_USER_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              </DialogBody>

              <DialogFooter className="justify-between">
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDestructive
          action="delete-site-user"
          open={confirmDeleteOpen}
          title="Delete site user?"
          description="This removes the user from the current site only. Their platform account will stay intact."
          error={errorMessage}
          onCancel={() => {
            setConfirmDeleteOpen(false)
            setPendingDeleteId(null)
            setErrorMessage(null)
          }}
          onConfirm={confirmDelete}
        />

        <ConfirmDestructive
          action="delete-site-user"
          open={massDeleteConfirmOpen}
          title="Delete selected site users?"
          description={`This removes ${userSelection.selectedCount} user${userSelection.selectedCount === 1 ? "" : "s"} from the current site only. Their platform accounts will stay intact.`}
          confirmLabel="Delete selected"
          disabled={massDeleting}
          error={errorMessage}
          onCancel={() => { setMassDeleteConfirmOpen(false); setErrorMessage(null) }}
          onConfirm={confirmMassDelete}
        />
      </AdminLayout>
    </>
  )
}
