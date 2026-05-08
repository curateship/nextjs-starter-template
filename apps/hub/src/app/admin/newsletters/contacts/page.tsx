"use client"

import { useState, useEffect, useRef, useDeferredValue, useCallback } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Trash2, Settings, Users, Upload, X, Plus, SlidersHorizontal, ArrowLeft } from "lucide-react"
import Link from "next/link"
import {
  getContactsWithStats,
  deleteContacts,
  getContactIdsAction,
} from "@/lib/actions/newsletters/contact-actions"
import type { CrmContact } from "@/lib/actions/newsletters/contact-actions"
import { getSegmentsBySite, addContactsToSegment } from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  emptyContactFilterGroup,
  formatContactFilterRule,
  type ContactFilterGroup,
} from "@/lib/actions/newsletters/contact-filters"
import { ContactFilterModal } from "@/components/admin/newsletter-builder/contacts/ContactFilterModal"
import { ContactFormModal } from "@/components/admin/newsletter-builder/contacts/ContactFormModal"
import { ContactImportModal } from "@/components/admin/newsletter-builder/contacts/ContactImportModal"

type ContactSortColumn = 'contact' | 'source' | 'status' | 'tags' | 'added' | 'engaged'

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
        pageSize,
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
    const dir = contactSort.sortDirection === 'asc' ? 1 : -1
    if (contactSort.sortColumn === 'contact') return a.email.localeCompare(b.email) * dir
    if (contactSort.sortColumn === 'status') return a.status.localeCompare(b.status) * dir
    if (contactSort.sortColumn === 'source') {
      const aSource = a.metadata?.source || 'manual'
      const bSource = b.metadata?.source || 'manual'
      return aSource.localeCompare(bSource) * dir
    }
    if (contactSort.sortColumn === 'tags') {
      const aTag = a.metadata?.tags?.[0] || '\uffff'
      const bTag = b.metadata?.tags?.[0] || '\uffff'
      return aTag.localeCompare(bTag) * dir
    }
    if (contactSort.sortColumn === 'added') return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    if (contactSort.sortColumn === 'engaged') {
      const aTime = a.last_engaged_at ? new Date(a.last_engaged_at).getTime() : 0
      const bTime = b.last_engaged_at ? new Date(b.last_engaged_at).getTime() : 0
      return (aTime - bTime) * dir
    }
    return 0
  })
  const contactIds = contacts.map((contact) => contact.id)

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getContactIdsAction(currentSite.id, {
      filterGroup: filters.rules.length ? filters : undefined,
      searchQuery: deferredSearchQuery,
    })
    if (ids) {
      contactSelection.selectAll(ids)
    }
  }

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
      const segName = segments.find(s => s.id === selectedSegmentId)?.name || "segment"
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
      case "active": return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case "unsubscribed": return <Badge variant="secondary">Unsubscribed</Badge>
      case "bounced": return <Badge variant="destructive">Bounced</Badge>
      case "complained": return <Badge variant="destructive">Complained</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "site_registration": return <Badge variant="outline" className="border-amber-200 text-amber-700">Site Registration</Badge>
      case "Email Form": return <Badge variant="outline" className="border-sky-200 text-sky-700">Email Form</Badge>
      case "lead_magnet": return <Badge variant="outline">Lead Magnet</Badge>
      case "paid_purchase": return <Badge variant="outline" className="border-green-200 text-green-700">Purchase</Badge>
      case "Notion Marketplace": return <Badge variant="outline" className="border-neutral-300 bg-neutral-50 text-neutral-900">Notion Marketplace</Badge>
      case "import": return <Badge variant="outline" className="border-blue-200 text-blue-700">Import</Badge>
      case "manual": return <Badge variant="outline">Manual</Badge>
      case "ad": return <Badge variant="outline" className="border-purple-200 text-purple-700">Ad</Badge>
      default: return <Badge variant="outline">{source}</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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
      rules: prev.rules.filter((rule) => rule.id !== ruleId),
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
            items={[
              { label: "Newsletters", href: "/admin/newsletters" },
              { label: "Contacts" },
            ]}
            search={{
              value: searchQuery,
              onValueChange: (value) => {
                setSearchQuery(value)
                setCurrentPage(1)
                contactSelection.clearSelection()
              },
              placeholder: "Search contacts",
            }}
            preActions={contactSelection.selectedCount > 0 ? (
              <div className="flex items-center gap-1.5 sm:gap-3">
                {segments.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
                      <SelectTrigger size="button" className="w-[180px] text-sm">
                        <SelectValue placeholder="Select segment..." />
                      </SelectTrigger>
                      <SelectContent>
                        {segments.map(seg => (
                          <SelectItem key={seg.id} value={seg.id}>{seg.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant={selectedSegmentId ? "default" : "outline"}
                      className={selectedSegmentId ? "bg-green-600 hover:bg-green-700" : ""}
                      onClick={handleAddToSegment}
                      disabled={!selectedSegmentId || addingToSegment}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {addingToSegment ? "Adding..." : "Add to Segment"}
                    </Button>
                  </div>
                )}
                <AdminBulkDeleteButton
                  deleting={massDeleting}
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  selectedCount={contactSelection.selectedCount}
                />
              </div>
            ) : null}
            actions={
              <div className="flex items-center gap-1.5 sm:gap-3">
                {successMessage && (
                  <div className="p-2 px-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 text-sm">{successMessage}</p>
                  </div>
                )}
                <Button
                  variant="outline"
                  className="relative"
                  onClick={openFilterModal}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {activeFilterCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
                <Button onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" /><span className="hidden sm:inline">Import CSV</span></Button>
                <Button onClick={() => setAddModalOpen(true)}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Add Contact</span></Button>
              </div>
            }
          />

          <Card className="shadow-sm">
            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-b">
                <Badge variant="outline" className="font-medium">
                  Matching {filters.match === "all" ? "all" : "any"}
                </Badge>
                {filters.rules.map((rule) => (
                  <Badge key={rule.id} variant="secondary" className="gap-1 pr-1">
                    {formatContactFilterRule(rule)}
                    <button type="button" onClick={() => removeAppliedRule(rule.id)} className="ml-1 hover:bg-muted rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button type="button" onClick={clearAllFilters} className="text-sm text-muted-foreground hover:text-foreground underline">
                  Clear all ({total})
                </button>
              </div>
            )}
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-8 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={contactSelection.isPageSelected(contactIds)}
                    onCheckedChange={() => contactSelection.togglePage(contactIds)}
                    aria-label="Select all contacts"
                  />
                  <AdminSortButton active={contactSort.sortColumn === 'contact'} direction={contactSort.sortDirection} onClick={() => contactSort.toggleSort('contact')}>
                    Contact
                  </AdminSortButton>
                </div>
                <AdminSortButton active={contactSort.sortColumn === 'source'} direction={contactSort.sortDirection} onClick={() => contactSort.toggleSort('source')}>
                  Source
                </AdminSortButton>
                <AdminSortButton active={contactSort.sortColumn === 'status'} direction={contactSort.sortDirection} onClick={() => contactSort.toggleSort('status')}>
                  Status
                </AdminSortButton>
                <AdminSortButton active={contactSort.sortColumn === 'tags'} direction={contactSort.sortDirection} onClick={() => contactSort.toggleSort('tags')}>
                  Tags
                </AdminSortButton>
                <AdminSortButton active={contactSort.sortColumn === 'added'} direction={contactSort.sortDirection} onClick={() => contactSort.toggleSort('added')}>
                  Added
                </AdminSortButton>
                <AdminSortButton active={contactSort.sortColumn === 'engaged'} direction={contactSort.sortDirection} onClick={() => contactSort.toggleSort('engaged')}>
                  Last Engaged
                </AdminSortButton>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            <AdminSelectionBanner
              allSelected={contactSelection.allSelected}
              onClearSelection={contactSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={contactSelection.selectedCount}
              total={total}
              visibleCount={contacts.length}
            />

            <div className="divide-y divide-muted/80">
              {loading ? (
                <AdminListSkeleton columns={8} showThumbnail={false} />
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => loadContacts()} variant="outline" size="sm">Try Again</Button>
                </div>
              ) : contacts.length === 0 ? (
                <div className="p-8 text-center">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {hasSearchQuery && activeFilterCount > 0
                      ? "No contacts match this search and filter"
                      : hasSearchQuery
                        ? "No contacts match this search"
                        : activeFilterCount > 0
                          ? "No contacts match this filter"
                          : "No contacts yet"}
                  </p>
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </Button>
                </div>
              ) : (
                sortedContacts.map((contact) => (
                  <div key={contact.id} className={`p-6 transition-colors ${contactSelection.selectedIds.has(contact.id) ? "bg-accent/50" : ""}`}>
                    <div className="grid grid-cols-8 gap-4 items-center">
                      <div className="col-span-2 flex items-center space-x-4">
                        <Checkbox
                          checked={contactSelection.selectedIds.has(contact.id)}
                          onCheckedChange={() => contactSelection.toggleOne(contact.id)}
                          aria-label={`Select ${contact.email}`}
                        />
                        <Link
                          href={`/admin/newsletters/contacts/${contact.id}`}
                          className="hover:opacity-80 transition-opacity"
                        >
                          <h4 className="font-medium text-sm hover:underline">
                            {contact.metadata?.first_name || contact.metadata?.last_name
                              ? `${contact.metadata.first_name || ""} ${contact.metadata.last_name || ""}`.trim()
                              : contact.email}
                          </h4>
                          {(contact.metadata?.first_name || contact.metadata?.last_name) && (
                            <p className="text-xs text-muted-foreground">{contact.email}</p>
                          )}
                        </Link>
                      </div>
                      <div>{getSourceBadge(contact.metadata?.source || "manual")}</div>
                      <div>{getStatusBadge(contact.status)}</div>
                      <div className="flex flex-wrap gap-1">
                        {contact.metadata?.tags?.length ? (
                          contact.metadata.tags.slice(0, 3).map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                        {(contact.metadata?.tags?.length ?? 0) > 3 && (
                          <span className="text-xs text-muted-foreground">+{contact.metadata!.tags!.length - 3}</span>
                        )}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">{formatDate(contact.created_at)}</span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">{formatRelativeTime(contact.last_engaged_at)}</span>
                      </div>
                      <div>
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
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => handleDelete(contact.id)}
                          title="Delete Contact"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete Contact</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && (
              <AdminListFooter
                currentPage={currentPage}
                pageSize={pageSize}
                total={total}
                onPageChange={(page) => {
                  setCurrentPage(page)
                  contactSelection.clearSelection()
                }}
              />
            )}
          </Card>

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

          <AdminErrorDialog
            open={errorDialogOpen}
            message={errorMessage}
            onOpenChange={setErrorDialogOpen}
          />
        </div>
      </AdminLayout>
    </>
  )
}
