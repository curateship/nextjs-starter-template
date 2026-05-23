"use client"

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import {
  CalendarIcon,
  Plus,
  Settings,
  SlidersHorizontal,
  Trash2,
  Users,
  X
} from "lucide-react"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { cn } from "@/lib/utils/tailwind"
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

function toCalendarDate(value: string | null) {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function fromCalendarDate(value: Date | undefined) {
  return value
    ? new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0)).toISOString()
    : null
}

function formatDatePickerLabel(value: string | null, placeholder: string) {
  const date = toCalendarDate(value)
  return date ? format(date, "MMM d, yyyy") : placeholder
}

function isDateRule(
  rule: SiteUserFilterRule
): rule is Extract<SiteUserFilterRule, { type: "lastEngaged" | "dateAdded" }> {
  return rule.type === "lastEngaged" || rule.type === "dateAdded"
}

function isValueRule(rule: SiteUserFilterRule): rule is Extract<SiteUserFilterRule, { type: "status" | "role" }> {
  return rule.type === "status" || rule.type === "role"
}

function formatRelativeTime(dateString: string | null) {
  if (!dateString) return "—"
  const diff = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function getRoleBadge(role: string) {
  switch (role) {
    case "owner":
      return <Badge className="bg-blue-100 text-blue-800">Owner</Badge>
    case "admin":
      return <Badge className="bg-amber-100 text-amber-800">Admin</Badge>
    default:
      return <Badge variant="secondary">Member</Badge>
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800">Active</Badge>
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

      const result = await getSiteUsers(currentSite.id, {
        filterGroup: filters.rules.length ? filters : undefined,
        searchQuery: deferredSearchQuery,
        page: currentPage,
        pageSize
      })

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
      const result = await getSiteUsers(currentSite.id, {
        filterGroup: previewFilters,
        searchQuery: deferredSearchQuery,
        page: 1,
        pageSize
      })

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

  function removeAppliedRule(ruleId: string) {
    setFilters((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== ruleId)
    }))
    resetSelectionForCurrentView()
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
      const aTime = a.last_engaged_at ? new Date(a.last_engaged_at).getTime() : 0
      const bTime = b.last_engaged_at ? new Date(b.last_engaged_at).getTime() : 0
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

    setConfirmDeleteOpen(false)
    setMassDeleting(true)
    setErrorMessage(null)

    try {
      const result = await deleteSiteUsers({
        siteId: currentSite.id,
        membershipIds: [pendingDeleteId]
      })

      if (result.error) {
        setErrorMessage(result.error)
        return
      }

      userSelection.remove(pendingDeleteId)
      await loadUsers()
    } finally {
      setPendingDeleteId(null)
      setMassDeleting(false)
    }
  }

  const confirmMassDelete = async () => {
    if (!currentSite?.id || !userSelection.selectedCount) return

    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    setErrorMessage(null)

    try {
      const result = await deleteSiteUsers({
        siteId: currentSite.id,
        membershipIds: Array.from(userSelection.selectedIds)
      })

      if (result.error) {
        setErrorMessage(result.error)
        return
      }

      clearUserSelection()
      await loadUsers()
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
    setErrorMessage(null)
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!currentSite?.id) return

    setCreating(true)
    setErrorMessage(null)
    const result = await createSiteUser({
      siteId: currentSite.id,
      email: createForm.email,
      displayName: createForm.displayName,
      password: createForm.password,
      role: createForm.role,
      status: createForm.status
    })

    if (result.error) {
      setErrorMessage(result.error)
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
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!currentSite?.id || !editUser) return

    setSaving(true)
    setErrorMessage(null)
    const result = await updateSiteUser({
      membershipId: editUser.id,
      siteId: currentSite.id,
      displayName: editForm.displayName,
      role: editForm.role,
      status: editForm.status
    })

    if (result.error) {
      setErrorMessage(result.error)
      setSaving(false)
      return
    }

    setEditUser(null)
    setSaving(false)
    await loadUsers()
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
            title="Site Users"
            icon={<Users className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={total}
            selectedCount={userSelection.selectedCount}
            onClearSelection={userSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={userSelection.selectedCount}
              />
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

            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b px-6 py-4">
                <Badge variant="outline" className="font-medium">
                  Matching {filters.match === "all" ? "all" : "any"}
                </Badge>
                {filters.rules.map((rule) => (
                  <Badge key={rule.id} variant="secondary" className="gap-1 pr-1">
                    {formatSiteUserFilterRule(rule)}
                    <button
                      type="button"
                      onClick={() => removeAppliedRule(rule.id)}
                      className="ml-1 rounded-full p-0.5 hover:bg-muted"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-sm text-muted-foreground underline hover:text-foreground"
                >
                  Clear all ({total})
                </button>
              </div>
            )}

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
                        active={userSort.sortColumn === "engaged"}
                        direction={userSort.sortDirection}
                        onClick={() => userSort.toggleSort("engaged")}
                      >
                        Last Engaged
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {siteLoading || loading ? (
                    <AdminListSkeleton columns={7} rowCount={5} showThumbnail={false} actionCount={2} />
                  ) : !currentSite?.id ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">Select a site to view scoped users.</p>
                      </TableCell>
                    </TableRow>
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={() => loadUsers()} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {hasSearchQuery && activeFilterCount > 0
                            ? "No users match this search and filter"
                            : hasSearchQuery
                              ? "No users match this search"
                              : activeFilterCount > 0
                                ? "No users match this filter"
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
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-medium sm:text-base">{user.display_name || user.email}</h4>
                            <p className="truncate text-xs text-muted-foreground sm:text-sm">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell column="meta">{getRoleBadge(user.role)}</TableCell>
                        <TableCell column="meta">{getStatusBadge(user.status)}</TableCell>
                        <TableCell column="mutedMeta">{formatDate(user.created_at)}</TableCell>
                        <TableCell column="mutedMeta">{formatRelativeTime(user.last_engaged_at)}</TableCell>
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
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
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
          <DialogContent size="admin" className="flex flex-col overflow-hidden p-6">
            <DialogHeader>
              <DialogTitle>Filter Site Users</DialogTitle>
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
                                    initialFocus
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
                                    initialFocus
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
            </div>

            <div className="flex items-center justify-between pt-4">
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
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent size="admin" className="p-6">
            <DialogHeader>
              <DialogTitle>Add Site User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-6 [&_label+input]:mt-2 [&_label+button]:mt-2">
              {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
              <div>
                <Label htmlFor="site-user-email">Email *</Label>
                <Input
                  id="site-user-email"
                  type="email"
                  required
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
                  required
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      password: e.target.value
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
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
              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create User"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={editUser !== null}
          onOpenChange={(open) => {
            if (!open) setEditUser(null)
          }}
        >
          <DialogContent size="admin" className="p-6">
            <DialogHeader>
              <DialogTitle>Edit Site User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateUser} className="space-y-6 [&_label+input]:mt-2 [&_label+button]:mt-2">
              {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
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
              <div className="grid grid-cols-2 gap-6">
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
              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <AdminConfirmDialog
          open={confirmDeleteOpen}
          title="Delete site user?"
          description="This removes the user from the current site only. Their platform account will stay intact."
          onCancel={() => {
            setConfirmDeleteOpen(false)
            setPendingDeleteId(null)
          }}
          onConfirm={confirmDelete}
        />

        <AdminConfirmDialog
          open={massDeleteConfirmOpen}
          title="Delete selected site users?"
          description={`This removes ${userSelection.selectedCount} user${userSelection.selectedCount === 1 ? "" : "s"} from the current site only. Their platform accounts will stay intact.`}
          confirmLabel="Delete selected"
          disabled={massDeleting}
          onCancel={() => setMassDeleteConfirmOpen(false)}
          onConfirm={confirmMassDelete}
        />
      </AdminLayout>
    </>
  )
}
