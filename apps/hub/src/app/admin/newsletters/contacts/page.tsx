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
  Dialog,
} from "@/components/ui/dialog"
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
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Trash2, Settings, Users, Upload, X, Plus, SlidersHorizontal, ArrowLeft, CalendarIcon } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { cn } from "@/lib/utils/tailwind"
import {
  getContactsWithStats,
  deleteContacts,
  bulkImportContacts,
  createOrUpsertContact,
  updateContact,
  getContactIdsAction,
} from "@/lib/actions/newsletters/contact-actions"
import type { CrmContact } from "@/lib/actions/newsletters/contact-actions"
import { getSegmentsBySite, addContactsToSegment } from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  cloneContactFilterGroup,
  type ContactDataField,
  type ContactDataFieldOperator,
  CONTACT_DATA_FIELD_OPERATOR_OPTIONS,
  CONTACT_DATA_FIELD_OPTIONS,
  CONTACT_EMAIL_OPEN_OPERATOR_OPTIONS,
  CONTACT_FILTER_TYPE_OPTIONS,
  CONTACT_RELATIVE_DAY_OPTIONS,
  CONTACT_SOURCE_OPTIONS,
  CONTACT_STATUS_OPTIONS,
  createContactFilterRule,
  emptyContactFilterGroup,
  formatContactFilterRule,
  getContactFilterTypeLabel,
  pruneContactFilterGroup,
  type ContactEmailOpenOperator,
  type ContactFilterGroup,
  type ContactFilterRule,
  type ContactFilterType,
} from "@/lib/actions/newsletters/contact-filters"

function makeFilterRuleId() {
  return `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

function normalizeDataFieldInputValue(value: string) {
  return value.trim()
}

function buildPendingDataFieldInputs(group: ContactFilterGroup) {
  return group.rules.reduce<Record<string, string>>((acc, rule) => {
    if (rule.type === "dataField") {
      acc[rule.id] = rule.value
    }
    return acc
  }, {})
}

function isDateRule(rule: ContactFilterRule): rule is Extract<ContactFilterRule, { type: 'lastEngaged' | 'dateAdded' }> {
  return rule.type === "lastEngaged" || rule.type === "dateAdded"
}

function isValueRule(rule: ContactFilterRule): rule is Extract<ContactFilterRule, { type: 'status' | 'source' }> {
  return rule.type === "status" || rule.type === "source"
}

function isEmailOpenRule(rule: ContactFilterRule): rule is Extract<ContactFilterRule, { type: 'emailOpens' }> {
  return rule.type === "emailOpens"
}

function shouldShowDataFieldValueInput(
  operator: ContactDataFieldOperator
) {
  return operator !== "isEmpty" && operator !== "isNotEmpty"
}

function buildNormalizedFilterGroup(
  group: ContactFilterGroup,
  dataFieldInputs: Record<string, string>
) {
  return pruneContactFilterGroup({
    ...cloneContactFilterGroup(group),
    rules: group.rules.map((rule) => {
      if (rule.type !== "dataField") return rule
      return {
        ...rule,
        value: normalizeDataFieldInputValue(dataFieldInputs[rule.id] ?? rule.value),
      }
    }),
  })
}

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

  // Add Contact state
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState({ email: "", first_name: "", last_name: "", tags: "" })
  const [adding, setAdding] = useState(false)

  // Edit Contact state
  const [editContact, setEditContact] = useState<CrmContact | null>(null)
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", tags: "", status: "active" as string })
  const [saving, setSaving] = useState(false)

  // Segment state
  const [segments, setSegments] = useState<Segment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>("")
  const [addingToSegment, setAddingToSegment] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // CSV Import state — columnMap maps CSV header name → our field (or "skip")
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contactLoadRequestIdRef = useRef(0)

  // Filter state
  const [filters, setFilters] = useState<ContactFilterGroup>(emptyContactFilterGroup)
  const [pendingFilters, setPendingFilters] = useState<ContactFilterGroup>(emptyContactFilterGroup)
  const [pendingDataFieldInputs, setPendingDataFieldInputs] = useState<Record<string, string>>({})
  const [pendingFilteredTotal, setPendingFilteredTotal] = useState(0)
  const [filterModalOpen, setFilterModalOpen] = useState(false)

  useEffect(() => {
    if (currentSite?.id) {
      getSegmentsBySite(currentSite.id).then(({ data }) => setSegments(data || []))
    }
  }, [currentSite?.id])

  useEffect(() => {
    clearContactSelection()
  }, [clearContactSelection, currentSite?.id, siteLoading])

  useEffect(() => {
    if (!filterModalOpen || !currentSite?.id) {
      setPendingFilteredTotal(0)
      return
    }

    const previewFilters = buildNormalizedFilterGroup(pendingFilters, pendingDataFieldInputs)
    if (!previewFilters.rules.length) {
      setPendingFilteredTotal(0)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      const result = await getContactsWithStats(currentSite.id, {
        filterGroup: previewFilters,
        searchQuery: deferredSearchQuery,
        page: 1,
        pageSize,
      })

      if (cancelled) return
      setPendingFilteredTotal(result.error ? 0 : result.total)
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [currentSite?.id, filterModalOpen, pageSize, pendingFilters, pendingDataFieldInputs, deferredSearchQuery])

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

  // CSV Import
  const OUR_FIELDS = [
    { value: "email", label: "Email" },
    { value: "first_name", label: "First Name" },
    { value: "last_name", label: "Last Name" },
    { value: "tags", label: "Tags" },
    { value: "created_at", label: "Created At" },
    { value: "last_engaged_at", label: "Last Engaged" },
  ]

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const { headers, rows } = parseCSVRaw(text)
      setCsvHeaders(headers)
      setCsvRows(rows)
      // Auto-detect: for each CSV header, guess our field
      const autoMap: Record<string, string> = {}
      const used = new Set<string>()
      for (const h of headers) {
        const lower = h.toLowerCase().trim()
        let match = ""
        if (!used.has("email") && (lower === "email" || lower === "email address" || lower === "email_address" || lower === "customer email")) { match = "email" }
        else if (!used.has("first_name") && (lower === "first_name" || lower === "first name" || lower === "firstname" || lower === "first")) { match = "first_name" }
        else if (!used.has("last_name") && (lower === "last_name" || lower === "last name" || lower === "lastname" || lower === "last")) { match = "last_name" }
        else if (!used.has("tags") && (lower === "tags" || lower === "tag")) { match = "tags" }
        else if (!used.has("created_at") && (lower === "created_at" || lower === "created at" || lower === "date added" || lower === "created" || lower === "date")) { match = "created_at" }
        else if (!used.has("last_engaged_at") && (lower === "last_engaged_at" || lower === "last engaged" || lower === "last engaged at" || lower === "last active" || lower === "last_active" || lower === "last open" || lower === "last_open")) { match = "last_engaged_at" }
        autoMap[h] = match
        if (match) used.add(match)
      }
      setColumnMap(autoMap)
      setImportResult(null)
      setImportModalOpen(true)
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  function parseCSVRaw(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return { headers: [], rows: [] }

    const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ""))
    const rows: string[][] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]).map(c => c.trim().replace(/^"|"$/g, ""))
      if (cols.some(c => c)) rows.push(cols)
    }
    return { headers, rows }
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === "," && !inQuotes) {
        result.push(current)
        current = ""
      } else {
        current += char
      }
    }
    result.push(current)
    return result
  }

  function getMappedContacts(): { email: string; first_name?: string; last_name?: string; tags?: string[]; created_at?: string; last_engaged_at?: string }[] {
    // Build reverse map: our field → CSV column index
    const fieldToIdx: Record<string, number> = {}
    for (const [csvHeader, ourField] of Object.entries(columnMap)) {
      if (ourField) {
        const idx = csvHeaders.indexOf(csvHeader)
        if (idx >= 0) fieldToIdx[ourField] = idx
      }
    }

    if (fieldToIdx.email === undefined) return []

    const results: { email: string; first_name?: string; last_name?: string; tags?: string[]; created_at?: string; last_engaged_at?: string }[] = []
    for (const cols of csvRows) {
      const email = cols[fieldToIdx.email]
      if (!email) continue
      results.push({
        email,
        first_name: fieldToIdx.first_name !== undefined ? cols[fieldToIdx.first_name] || undefined : undefined,
        last_name: fieldToIdx.last_name !== undefined ? cols[fieldToIdx.last_name] || undefined : undefined,
        tags: fieldToIdx.tags !== undefined && cols[fieldToIdx.tags] ? cols[fieldToIdx.tags].split(";").map(t => t.trim()).filter(Boolean) : undefined,
        created_at: fieldToIdx.created_at !== undefined ? cols[fieldToIdx.created_at] || undefined : undefined,
        last_engaged_at: fieldToIdx.last_engaged_at !== undefined ? cols[fieldToIdx.last_engaged_at] || undefined : undefined,
      })
    }
    return results
  }

  const hasEmailMapped = Object.values(columnMap).includes("email")

  const handleImport = async () => {
    if (!currentSite?.id) return
    const contacts = getMappedContacts()
    if (!contacts.length) return
    setImporting(true)
    try {
      // Send in chunks of 2000 to avoid server action body size limits
      const chunkSize = 2000
      let totalImported = 0
      let totalSkipped = 0

      for (let i = 0; i < contacts.length; i += chunkSize) {
        const chunk = contacts.slice(i, i + chunkSize)
        const result = await bulkImportContacts({
          siteId: currentSite.id,
          contacts: chunk,
        })
        if (result.error) {
          setErrorMessage(result.error)
          setErrorDialogOpen(true)
          setImporting(false)
          return
        }
        totalImported += result.imported
        totalSkipped += result.skipped
      }

      setImportResult({ imported: totalImported, skipped: totalSkipped })
      setImporting(false)
      loadContacts()
    } catch {
      setErrorMessage("Import failed")
      setErrorDialogOpen(true)
      setImporting(false)
    }
  }

  const closeImportModal = () => {
    setImportModalOpen(false)
    setCsvHeaders([])
    setCsvRows([])
    setColumnMap({})
    setImportResult(null)
  }

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentSite?.id || !addForm.email) return
    setAdding(true)
    try {
      const tags = addForm.tags ? addForm.tags.split(",").map(t => t.trim()).filter(Boolean) : []
      const { data, error } = await createOrUpsertContact({
        siteId: currentSite.id,
        email: addForm.email,
        firstName: addForm.first_name || undefined,
        lastName: addForm.last_name || undefined,
        source: "manual",
        tags,
      })
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        setAdding(false)
        return
      }
      if (data) {
        setContacts(prev => [data, ...prev])
        setTotal(prev => prev + 1)
      }
      setAddModalOpen(false)
      setAddForm({ email: "", first_name: "", last_name: "", tags: "" })
    } catch {
      setErrorMessage("Failed to add contact")
      setErrorDialogOpen(true)
    } finally {
      setAdding(false)
    }
  }

  const openEditModal = (contact: CrmContact) => {
    setEditContact(contact)
    setEditForm({
      first_name: contact.metadata?.first_name || "",
      last_name: contact.metadata?.last_name || "",
      tags: contact.metadata?.tags?.join(", ") || "",
      status: contact.status,
    })
  }

  const handleEditContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editContact) return
    setSaving(true)
    try {
      const tags = editForm.tags ? editForm.tags.split(",").map(t => t.trim()).filter(Boolean) : []
      const { data, error } = await updateContact(editContact.id, {
        metadata: {
          first_name: editForm.first_name || undefined,
          last_name: editForm.last_name || undefined,
          tags,
        },
        status: editForm.status as CrmContact["status"],
      })
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        setSaving(false)
        return
      }
      if (data) {
        setContacts(prev => prev.map(c => c.id === data.id ? data : c))
      }
      setEditContact(null)
    } catch {
      setErrorMessage("Failed to update contact")
      setErrorDialogOpen(true)
    } finally {
      setSaving(false)
    }
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
    const clonedFilters = cloneContactFilterGroup(filters)
    setPendingFilters(clonedFilters)
    setPendingDataFieldInputs(buildPendingDataFieldInputs(clonedFilters))
    setPendingFilteredTotal(clonedFilters.rules.length ? total : 0)
    setFilterModalOpen(true)
  }

  function addPendingFilter(type: ContactFilterType) {
    const rule = createContactFilterRule(makeFilterRuleId(), type)
    setPendingFilters((prev) => ({
      ...prev,
      rules: [...prev.rules, rule],
    }))
    if (type === "dataField") {
      setPendingDataFieldInputs((prev) => ({ ...prev, [rule.id]: "" }))
    }
  }

  function updatePendingRule(ruleId: string, updater: (rule: ContactFilterRule) => ContactFilterRule) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => (rule.id === ruleId ? updater(rule) : rule)),
    }))
  }

  function removePendingRule(ruleId: string) {
    setPendingFilters((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== ruleId),
    }))
    setPendingDataFieldInputs((prev) => {
      if (!(ruleId in prev)) return prev
      const next = { ...prev }
      delete next[ruleId]
      return next
    })
  }

  function removeAppliedRule(ruleId: string) {
    setFilters((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== ruleId),
    }))
    resetSelectionForFilteredView()
  }

  function togglePendingValue(ruleId: string, value: string) {
    updatePendingRule(ruleId, (rule) => {
      if (!isValueRule(rule)) return rule
      return {
        ...rule,
        value: rule.value.includes(value)
          ? rule.value.filter((item) => item !== value)
          : [...rule.value, value],
      }
    })
  }

  function updatePendingDataFieldOperator(
    ruleId: string,
    operator: ContactDataFieldOperator
  ) {
    updatePendingRule(ruleId, (rule) => {
      if (rule.type !== "dataField") return rule
      return { ...rule, operator }
    })
  }

  function updatePendingDataFieldField(ruleId: string, field: ContactDataField) {
    updatePendingRule(ruleId, (rule) => {
      if (rule.type !== "dataField") return rule
      return { ...rule, field }
    })
  }

  function updatePendingDataFieldValues(ruleId: string, inputValue: string) {
    setPendingDataFieldInputs((prev) => ({ ...prev, [ruleId]: inputValue }))
  }

  function updatePendingDateOperator(ruleId: string, operator: "is" | "isnt") {
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
          value: { mode: "range", from: null, to: null },
        }
      }

      const days = Number(nextValue) as 7 | 30 | 60 | 90
      return {
        ...rule,
        value: { mode: "relative", days },
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
          [boundary]: fromCalendarDate(selectedDate),
        },
      }
    })
  }

  function updatePendingEmailOpenOperator(ruleId: string, operator: ContactEmailOpenOperator) {
    updatePendingRule(ruleId, (rule) => {
      if (!isEmailOpenRule(rule)) return rule
      return { ...rule, operator }
    })
  }

  function updatePendingEmailOpenTimes(ruleId: string, times: string) {
    updatePendingRule(ruleId, (rule) => {
      if (!isEmailOpenRule(rule)) return rule
      return { ...rule, times }
    })
  }

  function clearAllFilters() {
    setFilters(emptyContactFilterGroup())
    resetSelectionForFilteredView()
  }

  function applyFilters() {
    const nextFilters = buildNormalizedFilterGroup(pendingFilters, pendingDataFieldInputs)
    setFilters(nextFilters)
    setFilterModalOpen(false)
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

          {/* Hidden file input for CSV */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
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

          {/* Filter Modal */}
          <Dialog open={filterModalOpen} onOpenChange={setFilterModalOpen}>
            <AdminModalContent>
              <AdminModalHeader>
                <AdminModalTitle>Filter Contacts</AdminModalTitle>
                <AdminModalDescription>
                  Build rules to narrow the contacts shown in this dashboard.
                </AdminModalDescription>
              </AdminModalHeader>
              <AdminModalBody className="space-y-6 [&_label+button]:mt-2 [&_label+input]:mt-2">
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
                    <div key={rule.id} className="rounded-2xl bg-muted/65 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium">{getContactFilterTypeLabel(rule.type)}</h3>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removePendingRule(rule.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      {rule.type === "status" && (
                        <div className="flex flex-wrap gap-3">
                          {CONTACT_STATUS_OPTIONS.map((option) => {
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

                      {rule.type === "source" && (
                        <div className="flex flex-wrap gap-3">
                          {CONTACT_SOURCE_OPTIONS.map((option) => {
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

                      {rule.type === "dataField" && (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Select value={rule.field} onValueChange={(value: ContactDataField) => updatePendingDataFieldField(rule.id, value)}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CONTACT_DATA_FIELD_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={rule.operator}
                              onValueChange={(value: ContactDataFieldOperator) =>
                                updatePendingDataFieldOperator(rule.id, value)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CONTACT_DATA_FIELD_OPERATOR_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {shouldShowDataFieldValueInput(rule.operator) && (
                            <Input
                              value={pendingDataFieldInputs[rule.id] ?? rule.value}
                              onChange={(event) => updatePendingDataFieldValues(rule.id, event.target.value)}
                              placeholder="Type any value"
                            />
                          )}
                        </div>
                      )}

                      {rule.type === "emailOpens" && (
                        <div className="space-y-2">
                          <div className="grid gap-3 sm:grid-cols-[170px,1fr]">
                            <Select
                              value={rule.operator}
                              onValueChange={(value: ContactEmailOpenOperator) => updatePendingEmailOpenOperator(rule.id, value)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CONTACT_EMAIL_OPEN_OPERATOR_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={rule.times}
                              onChange={(event) => updatePendingEmailOpenTimes(rule.id, event.target.value)}
                              placeholder="Emails"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Checks every contact against the latest emails sent from this site.
                          </p>
                        </div>
                      )}

                      {isDateRule(rule) && (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-[140px,1fr]">
                            <Select value={rule.operator} onValueChange={(value: "is" | "isnt") => updatePendingDateOperator(rule.id, value)}>
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
                                {CONTACT_RELATIVE_DAY_OPTIONS.map((option) => (
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
                                <Label htmlFor={`${rule.id}-from`} className="text-xs text-muted-foreground">Start date</Label>
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
                                <Label htmlFor={`${rule.id}-to`} className="text-xs text-muted-foreground">End date</Label>
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
                      {CONTACT_FILTER_TYPE_OPTIONS.map((option) => (
                        <DropdownMenuItem key={option.value} onSelect={() => addPendingFilter(option.value)}>
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
              </AdminModalBody>

              <AdminModalFooter>
                <button
                  type="button"
                  onClick={() => {
                    setPendingFilters(emptyContactFilterGroup())
                    setPendingDataFieldInputs({})
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
              </AdminModalFooter>
            </AdminModalContent>
          </Dialog>

          {/* Import Modal */}
          <Dialog open={importModalOpen} onOpenChange={(open) => { if (!open) closeImportModal() }}>
            <AdminModalContent>
              <AdminModalHeader>
                <AdminModalTitle>{importResult ? "Import Complete" : "Import Contacts"}</AdminModalTitle>
                <AdminModalDescription>
                  Map CSV columns to contact fields before importing.
                </AdminModalDescription>
              </AdminModalHeader>
              <AdminModalBody className="pb-6">
                {importResult ? (
                  <div className="text-center space-y-4">
                    <div className="p-4 bg-green-50 text-green-800 rounded-lg">
                      <p className="font-medium">Import complete</p>
                      <p className="text-sm">{importResult.imported} contacts imported, {importResult.skipped} skipped</p>
                    </div>
                    <Button onClick={closeImportModal}>Done</Button>
                  </div>
                ) : csvHeaders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center">No valid rows found in CSV.</p>
                ) : (
                  <>
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-semibold">
                        We found {csvRows.length.toLocaleString()} rows of contacts!
                      </h2>
                      <p className="text-muted-foreground text-sm mt-1">Map your CSV columns to contact fields</p>
                    </div>

                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_32px_1fr] gap-2 mb-3 px-1">
                      <p className="text-sm font-medium text-muted-foreground">CSV data sample</p>
                      <div />
                      <p className="text-sm font-medium text-muted-foreground">Contact field</p>
                    </div>

                    {/* Column mapping rows */}
                    <div className="space-y-3">
                      {csvHeaders.map((header) => {
                        // Get first non-empty sample value for this column
                        const colIdx = csvHeaders.indexOf(header)
                        const sample = csvRows.find(r => r[colIdx]?.trim())?.[colIdx] || ""

                        return (
                          <div key={header}>
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">{header}</p>
                            <div className="grid grid-cols-[1fr_32px_1fr] gap-2 items-center">
                              <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center">
                                <span className="text-sm truncate">{sample || "—"}</span>
                              </div>
                              <div className="flex justify-center">
                                <span className="text-muted-foreground">→</span>
                              </div>
                              <select
                                value={columnMap[header] || ""}
                                onChange={(e) => {
                                  const newVal = e.target.value
                                  setColumnMap(prev => {
                                    const next = { ...prev }
                                    // If another header had this field, clear it
                                    if (newVal) {
                                      for (const key of Object.keys(next)) {
                                        if (next[key] === newVal && key !== header) next[key] = ""
                                      }
                                    }
                                    next[header] = newVal
                                    return next
                                  })
                                }}
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full"
                              >
                                <option value="">Skip</option>
                                {OUR_FIELDS.map(f => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Helper text */}
                    <div className="grid grid-cols-[1fr_32px_1fr] gap-2 mt-3 px-1">
                      <p className="text-xs text-muted-foreground">Check that your CSV data on the left</p>
                      <div />
                      <p className="text-xs text-muted-foreground">Matches the contact field on the right</p>
                    </div>

                    {!hasEmailMapped && (
                      <p className="text-sm text-red-600 mt-4 text-center">Please map at least one column to Email</p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-6 pt-4">
                      <Button variant="ghost" onClick={closeImportModal}>
                        ← Back
                      </Button>
                      <Button
                        onClick={handleImport}
                        disabled={importing || !hasEmailMapped}
                      >
                        {importing ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Importing...
                          </>
                        ) : (
                          "Continue"
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </AdminModalBody>
            </AdminModalContent>
          </Dialog>

          {/* Add Contact Modal */}
          <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
            <AdminModalContent>
              <AdminModalHeader>
                <AdminModalTitle>Add Contact</AdminModalTitle>
                <AdminModalDescription>
                  Add a single contact to this site and optionally tag them.
                </AdminModalDescription>
              </AdminModalHeader>

              <form onSubmit={handleAddContact} className="flex min-h-0 flex-1 flex-col">
                <AdminModalBody className="space-y-6 [&_label+input]:mt-2">
                  <div>
                    <Label htmlFor="add-email">Email *</Label>
                    <Input
                      id="add-email"
                      type="email"
                      required
                      placeholder="email@example.com"
                      value={addForm.email}
                      onChange={(e) => setAddForm(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="add-first">First Name</Label>
                      <Input
                        id="add-first"
                        placeholder="Jane"
                        value={addForm.first_name}
                        onChange={(e) => setAddForm(prev => ({ ...prev, first_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="add-last">Last Name</Label>
                      <Input
                        id="add-last"
                        placeholder="Doe"
                        value={addForm.last_name}
                        onChange={(e) => setAddForm(prev => ({ ...prev, last_name: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="add-tags">Tags</Label>
                    <Input
                      id="add-tags"
                      placeholder="austin, fitness (comma-separated)"
                      value={addForm.tags}
                      onChange={(e) => setAddForm(prev => ({ ...prev, tags: e.target.value }))}
                    />
                  </div>
                </AdminModalBody>
                <AdminModalFooter className="sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={adding || !addForm.email}>
                    {adding ? "Adding..." : "Add Contact"}
                  </Button>
                </AdminModalFooter>
              </form>
            </AdminModalContent>
          </Dialog>

          {/* Edit Contact Modal */}
          <Dialog open={editContact !== null} onOpenChange={(open) => { if (!open) setEditContact(null) }}>
            <AdminModalContent>
              <AdminModalHeader>
                <AdminModalTitle>Edit Contact</AdminModalTitle>
                <AdminModalDescription>
                  Update this contact&apos;s details, tags, and subscription status.
                </AdminModalDescription>
                {editContact && (
                  <p className="text-sm text-muted-foreground">{editContact.email}</p>
                )}
              </AdminModalHeader>

              <form onSubmit={handleEditContact} className="flex min-h-0 flex-1 flex-col">
                <AdminModalBody className="space-y-6 [&_label+button]:mt-2 [&_label+input]:mt-2">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="edit-first">First Name</Label>
                      <Input
                        id="edit-first"
                        value={editForm.first_name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-last">Last Name</Label>
                      <Input
                        id="edit-last"
                        value={editForm.last_name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="edit-tags">Tags</Label>
                    <Input
                      id="edit-tags"
                      placeholder="austin, fitness (comma-separated)"
                      value={editForm.tags}
                      onChange={(e) => setEditForm(prev => ({ ...prev, tags: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={editForm.status}
                      onValueChange={(value) => setEditForm(prev => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                        <SelectItem value="bounced">Bounced</SelectItem>
                        <SelectItem value="complained">Complained</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </AdminModalBody>
                <AdminModalFooter className="sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setEditContact(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </AdminModalFooter>
              </form>
            </AdminModalContent>
          </Dialog>

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
