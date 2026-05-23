"use client"

import { useState, useEffect, useRef, useDeferredValue, useCallback } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { Trash2, Settings, Users, Upload, X, Plus, SlidersHorizontal, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { getContactsWithStats, deleteContacts } from "@/lib/actions/newsletters/contact-actions"
import type { CrmContact } from "@/lib/actions/newsletters/contact-actions"
import { getSegmentsBySite, addContactsToSegment } from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  emptyContactFilterGroup,
  formatContactFilterRule,
  type ContactFilterGroup
} from "@/lib/actions/newsletters/contact-filters"
import { ContactFilterModal } from "@/components/admin/newsletter-builder/contacts/ContactFilterModal"
import { ContactFormModal } from "@/components/admin/newsletter-builder/contacts/ContactFormModal"
import { ContactImportModal } from "@/components/admin/newsletter-builder/contacts/ContactImportModal"

type ContactSortColumn = "contact" | "source" | "status" | "tags" | "added" | "engaged"

export default function ContactsPage() {
  const { currentSite, loading: siteLoading, pageSize: contextPageSize } = useSiteSwitcher()
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = contextPageSize
  const contactSelection = useAdminBulkSelection()
  const clearContactSelection = contactSelection.clearSelection
  const contactSort = useAdminSort<ContactSortColumn>()
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [total, setTotal] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editContact, setEditContact] = useState<CrmContact | null>(null)

  // Segment state
  const [segments, setSegments] = useState<Segment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>("")
  const [addingToSegment, setAddingToSegment] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [importModalOpen, setImportModalOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contactLoadRequestIdRef = useRef(0)

  // Filter state
  const [filters, setFilters] = useState<ContactFilterGroup>(emptyContactFilterGroup)
  const [filterModalOpen, setFilterModalOpen] = useState(false)

  useEffect(() => {
    if (currentSite?.id) {
      getSegmentsBySite(currentSite.id).then(({ data }) => setSegments(data || []))
    }
  }, [currentSite?.id])

  useEffect(() => {
    clearContactSelection()
  }, [clearContactSelection, currentSite?.id, siteLoading])

  const loadContacts = useCallback(async () => {
    const requestId = ++contactLoadRequestIdRef.current

    if (siteLoading || !currentSite?.id) {
      setLoading(siteLoading)
      setError(null)
      setContacts([])
      setTotal(0)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const result = await getContactsWithStats(currentSite.id, {
        filterGroup: filters.rules.length ? filters : undefined,
        searchQuery: deferredSearchQuery,
        page: currentPage,
        pageSize
      })

      if (requestId !== contactLoadRequestIdRef.current) {
        return
      }

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      setContacts(result.data ?? [])
      setTotal(result.total)

      setLoading(false)
    } catch (err) {
      if (requestId !== contactLoadRequestIdRef.current) {
        return
      }
      setError(err instanceof Error ? err.message : "Failed to load contacts")
      setLoading(false)
    }
  }, [currentSite?.id, currentPage, deferredSearchQuery, filters, pageSize, siteLoading])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  const sortedContacts = [...contacts].sort((a, b) => {
    if (!contactSort.sortColumn) return 0
    const dir = contactSort.sortDirection === "asc" ? 1 : -1
    if (contactSort.sortColumn === "contact") return a.email.localeCompare(b.email) * dir
    if (contactSort.sortColumn === "status") return a.status.localeCompare(b.status) * dir
    if (contactSort.sortColumn === "source") {
      const aSource = a.metadata?.source || "manual"
      const bSource = b.metadata?.source || "manual"
      return aSource.localeCompare(bSource) * dir
    }
    if (contactSort.sortColumn === "tags") {
      const aTag = a.metadata?.tags?.[0] || "\uffff"
      const bTag = b.metadata?.tags?.[0] || "\uffff"
      return aTag.localeCompare(bTag) * dir
    }
    if (contactSort.sortColumn === "added")
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    if (contactSort.sortColumn === "engaged") {
      const aTime = a.last_engaged_at ? new Date(a.last_engaged_at).getTime() : 0
      const bTime = b.last_engaged_at ? new Date(b.last_engaged_at).getTime() : 0
      return (aTime - bTime) * dir
    }
    return 0
  })
  const contactIds = sortedContacts.map((contact) => contact.id)

  const handleDelete = (id: string) => {
    setPendingDeleteId(id)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const contactId = pendingDeleteId
    setPendingDeleteId(null)
    try {
      const { success, error } = await deleteContacts([contactId])
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        loadContacts()
      }
    } catch {
      setErrorMessage("Failed to delete contact")
      setErrorDialogOpen(true)
    } finally {
      setPendingDeleteId(null)
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(contactSelection.selectedIds)
      const { success, error } = await deleteContacts(ids)
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        contactSelection.clearSelection()
        loadContacts()
      }
    } catch {
      setErrorMessage("Failed to delete contacts")
      setErrorDialogOpen(true)
    } finally {
      setMassDeleting(false)
    }
  }

  const handleAddToSegment = async () => {
    if (!selectedSegmentId || !contactSelection.selectedCount) return
    setAddingToSegment(true)
    try {
      const segName = segments.find((s) => s.id === selectedSegmentId)?.name || "segment"
      const { added, error } = await addContactsToSegment(Array.from(contactSelection.selectedIds), selectedSegmentId)
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
      } else {
        setSuccessMessage(`${added} contact${added !== 1 ? "s" : ""} added to ${segName}`)
        setTimeout(() => setSuccessMessage(null), 5000)
        contactSelection.clearSelection()
        setSelectedSegmentId("")
        loadContacts()
      }
    } catch {
      setErrorMessage("Failed to add contacts to segment")
      setErrorDialogOpen(true)
    } finally {
      setAddingToSegment(false)
    }
  }

  const showError = (message: string) => {
    setErrorMessage(message)
    setErrorDialogOpen(true)
  }

  const handleContactCreated = (contact: CrmContact) => {
    setContacts((prev) => [contact, ...prev])
    setTotal((prev) => prev + 1)
  }

  const handleContactUpdated = (contact: CrmContact) => {
    setContacts((prev) => prev.map((item) => (item.id === contact.id ? contact : item)))
  }

  const openEditModal = (contact: CrmContact) => {
    setEditContact(contact)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case "cold":
        return <Badge className="bg-yellow-100 text-yellow-800">Cold</Badge>
      case "unsubscribed":
        return <Badge variant="secondary">Unsubscribed</Badge>
      case "bounced":
        return <Badge variant="destructive">Bounced</Badge>
      case "complained":
        return <Badge variant="destructive">Complained</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "site_registration":
        return (
          <Badge variant="outline" className="border-amber-200 text-amber-700">
            Site Registration
          </Badge>
        )
      case "Email Form":
        return (
          <Badge variant="outline" className="border-sky-200 text-sky-700">
            Email Form
          </Badge>
        )
      case "lead_magnet":
        return <Badge variant="outline">Lead Magnet</Badge>
      case "paid_purchase":
        return (
          <Badge variant="outline" className="border-green-200 text-green-700">
            Purchase
          </Badge>
        )
      case "Notion Marketplace":
        return (
          <Badge variant="outline" className="border-neutral-300 bg-neutral-50 text-neutral-900">
            Notion Marketplace
          </Badge>
        )
      case "import":
        return (
          <Badge variant="outline" className="border-blue-200 text-blue-700">
            Import
          </Badge>
        )
      case "manual":
        return <Badge variant="outline">Manual</Badge>
      case "ad":
        return (
          <Badge variant="outline" className="border-purple-200 text-purple-700">
            Ad
          </Badge>
        )
      default:
        return <Badge variant="outline">{source}</Badge>
    }
  }

  /* Format a date as relative time (e.g. "3d ago", "2h ago") */
  const formatRelativeTime = (dateString: string | null) => {
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

  const activeFilterCount = filters.rules.length
  const hasSearchQuery = deferredSearchQuery.trim().length > 0
  function resetSelectionForFilteredView() {
    setCurrentPage(1)
    contactSelection.clearSelection()
  }

  function openFilterModal() {
    setFilterModalOpen(true)
  }

  function handleApplyFilters(nextFilters: ContactFilterGroup) {
    setFilters(nextFilters)
    resetSelectionForFilteredView()
  }

  function removeAppliedRule(ruleId: string) {
    setFilters((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== ruleId)
    }))
    resetSelectionForFilteredView()
  }

  function clearAllFilters() {
    setFilters(emptyContactFilterGroup())
    resetSelectionForFilteredView()
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[{ label: "Newsletters", href: "/admin/newsletters" }, { label: "Contacts" }]}
          />

          <AdminTableShell
            title="Contacts"
            icon={<Users className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={total}
            selectedCount={contactSelection.selectedCount}
            onClearSelection={contactSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={contactSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                {contactSelection.selectedCount > 0 && segments.length > 0 ? (
                  <>
                    <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
                      <TableRightActionsSelectTrigger className="w-[180px]" aria-label="Segment">
                        <SelectValue placeholder="Select segment..." />
                      </TableRightActionsSelectTrigger>
                      <SelectContent>
                        {segments.map((seg) => (
                          <SelectItem key={seg.id} value={seg.id}>
                            {seg.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <TableRightActionsButton
                      variant={selectedSegmentId ? "default" : "outline"}
                      className={selectedSegmentId ? "bg-green-600 hover:bg-green-700" : ""}
                      onClick={handleAddToSegment}
                      disabled={!selectedSegmentId || addingToSegment}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">{addingToSegment ? "Adding..." : "Add to Segment"}</span>
                    </TableRightActionsButton>
                  </>
                ) : null}
                {successMessage ? (
                  <span className="rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-800">
                    {successMessage}
                  </span>
                ) : null}
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setCurrentPage(1)
                    contactSelection.clearSelection()
                  }}
                  placeholder="Search contacts"
                />
                <TableRightActionsButton variant="outline" className="relative" onClick={openFilterModal}>
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {activeFilterCount > 0 ? (
                    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </TableRightActionsButton>
                <TableRightActionsButton onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline">Import CSV</span>
                </TableRightActionsButton>
                <TableRightActionsButton onClick={() => setAddModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Contact</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={
              !loading ? (
                <AdminListFooter
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={(page) => {
                    setCurrentPage(page)
                    contactSelection.clearSelection()
                  }}
                />
              ) : null
            }
          >

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
                <Badge variant="outline" className="font-medium">
                  Matching {filters.match === "all" ? "all" : "any"}
                </Badge>
                {filters.rules.map((rule) => (
                  <Badge key={rule.id} variant="secondary" className="gap-1 pr-1">
                    {formatContactFilterRule(rule)}
                    <button
                      type="button"
                      onClick={() => removeAppliedRule(rule.id)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
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
                        checked={contactSelection.isPageSelected(contactIds)}
                        onCheckedChange={() => contactSelection.togglePage(contactIds)}
                        aria-label="Select all contacts"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={contactSort.sortColumn === "contact"}
                        direction={contactSort.sortDirection}
                        onClick={() => contactSort.toggleSort("contact")}
                      >
                        Contact
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="content">
                      <AdminSortButton
                        active={contactSort.sortColumn === "source"}
                        direction={contactSort.sortDirection}
                        onClick={() => contactSort.toggleSort("source")}
                      >
                        Source
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={contactSort.sortColumn === "status"}
                        direction={contactSort.sortDirection}
                        onClick={() => contactSort.toggleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="content">
                      <AdminSortButton
                        active={contactSort.sortColumn === "tags"}
                        direction={contactSort.sortDirection}
                        onClick={() => contactSort.toggleSort("tags")}
                      >
                        Tags
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={contactSort.sortColumn === "added"}
                        direction={contactSort.sortDirection}
                        onClick={() => contactSort.toggleSort("added")}
                      >
                        Added
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={contactSort.sortColumn === "engaged"}
                        direction={contactSort.sortDirection}
                        onClick={() => contactSort.toggleSort("engaged")}
                      >
                        Last Engaged
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={8} rowCount={5} showThumbnail={false} actionCount={2} />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={() => loadContacts()} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : contacts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
                        <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">
                          {hasSearchQuery && activeFilterCount > 0
                            ? "No contacts match this search and filter"
                            : hasSearchQuery
                              ? "No contacts match this search"
                              : activeFilterCount > 0
                                ? "No contacts match this filter"
                                : "No contacts yet"}
                        </p>
                        <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                          <Upload className="mr-2 h-4 w-4" />
                          Import CSV
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedContacts.map((contact) => (
                      <TableRow
                        key={contact.id}
                        data-state={contactSelection.selectedIds.has(contact.id) ? "selected" : undefined}
                        className="group"
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={contactSelection.selectedIds.has(contact.id)}
                            onCheckedChange={() => contactSelection.toggleOne(contact.id)}
                            aria-label={`Select ${contact.email}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <Link
                            href={`/admin/newsletters/contacts/${contact.id}`}
                            className="block min-w-0 transition-opacity hover:opacity-80"
                          >
                            <h4 className="truncate text-sm font-medium hover:underline sm:text-base">
                              {contact.metadata?.first_name || contact.metadata?.last_name
                                ? `${contact.metadata.first_name || ""} ${contact.metadata.last_name || ""}`.trim()
                                : contact.email}
                            </h4>
                            {(contact.metadata?.first_name || contact.metadata?.last_name) && (
                              <p className="truncate text-xs text-muted-foreground sm:text-sm">{contact.email}</p>
                            )}
                          </Link>
                        </TableCell>
                        <TableCell column="content">{getSourceBadge(contact.metadata?.source || "manual")}</TableCell>
                        <TableCell column="meta">{getStatusBadge(contact.status)}</TableCell>
                        <TableCell column="content">
                          <div className="flex flex-wrap gap-1">
                            {contact.metadata?.tags?.length ? (
                              contact.metadata.tags.slice(0, 3).map((tag: string) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                            {(contact.metadata?.tags?.length ?? 0) > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{contact.metadata!.tags!.length - 3}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell column="mutedMeta">{formatDate(contact.created_at)}</TableCell>
                        <TableCell column="mutedMeta">{formatRelativeTime(contact.last_engaged_at)}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openEditModal(contact)}
                              title="Edit Contact"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="sr-only">Edit Contact</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(contact.id)}
                              title="Delete Contact"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete Contact</span>
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

          <ContactFilterModal
            open={filterModalOpen}
            filters={filters}
            onApply={handleApplyFilters}
            onOpenChange={setFilterModalOpen}
            pageSize={pageSize}
            searchQuery={deferredSearchQuery}
            siteId={currentSite?.id}
            total={total}
          />

          <ContactImportModal
            open={importModalOpen}
            fileInputRef={fileInputRef}
            onError={showError}
            onImported={loadContacts}
            onOpenChange={setImportModalOpen}
            siteId={currentSite?.id}
          />

          <ContactFormModal
            addOpen={addModalOpen}
            editContact={editContact}
            onAddOpenChange={setAddModalOpen}
            onCreated={handleContactCreated}
            onEditClose={() => setEditContact(null)}
            onError={showError}
            onUpdated={handleContactUpdated}
            siteId={currentSite?.id}
          />

          <AdminConfirmDialog
            open={pendingDeleteId !== null}
            title="Delete Contact"
            description="Are you sure? This action cannot be undone."
            onCancel={() => setPendingDeleteId(null)}
            onConfirm={confirmDelete}
          />

          <AdminConfirmDialog
            open={massDeleteConfirmOpen}
            title={`Delete ${contactSelection.selectedCount} Contact${contactSelection.selectedCount !== 1 ? "s" : ""}`}
            description={`Are you sure you want to delete ${contactSelection.selectedCount} contact${contactSelection.selectedCount !== 1 ? "s" : ""}? This action cannot be undone.`}
            confirmLabel={`Delete ${contactSelection.selectedCount} Contact${contactSelection.selectedCount !== 1 ? "s" : ""}`}
            disabled={massDeleting}
            onCancel={() => setMassDeleteConfirmOpen(false)}
            onConfirm={confirmMassDelete}
          />

          <AdminErrorDialog open={errorDialogOpen} message={errorMessage} onOpenChange={setErrorDialogOpen} />
        </div>
      </AdminLayout>
    </>
  )
}
