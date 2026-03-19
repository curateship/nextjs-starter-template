"use client"

import { useState, useEffect, useRef } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Settings, Users, Upload, X, ArrowUp, ArrowDown, ChevronsUpDown, List, Magnet, ShoppingCart, FileDown, Plus, Mail, Filter, Zap, FileText, Shield, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getContactsWithStats,
  deleteContacts,
  bulkImportContacts,
  createOrUpsertContact,
  updateContact,
} from "@/lib/actions/newsletters/contact-actions"
import type { CrmContact } from "@/lib/actions/newsletters/contact-actions"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { getSegmentsBySite, addContactsToSegment } from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { useSiteContext } from "@/contexts/site-context"

export default function ContactsPage() {
  const { currentSite, pageSize: contextPageSize } = useSiteContext()
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterSource, setFilterSource] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = contextPageSize
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [sortColumn, setSortColumn] = useState<'contact' | 'source' | 'status' | 'tags' | 'added' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{ total: number; active: number; unsubscribed: number; bounced: number; bySource: Record<string, number> } | null>(null)

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

  useEffect(() => {
    loadContacts()
  }, [currentSite?.id, filterSource, currentPage])

  useEffect(() => {
    if (currentSite?.id) {
      getSegmentsBySite(currentSite.id).then(({ data }) => setSegments(data || []))
    }
  }, [currentSite?.id])

  async function loadContacts() {
    if (!currentSite?.id) {
      setLoading(true)
      setContacts([])
      return
    }

    try {
      setLoading(true)
      setError(null)

      const result = await getContactsWithStats(currentSite.id, { source: filterSource, page: currentPage, pageSize })

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      setContacts(result.data ?? [])
      setTotal(result.total)
      if (result.stats) setStats(result.stats)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts")
      setLoading(false)
    }
  }

  const filteredContacts = contacts

  const toggleSort = (column: 'contact' | 'source' | 'status' | 'tags' | 'added') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection('asc')
      } else {
        setSortDirection('desc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: 'contact' | 'source' | 'status' | 'tags' | 'added') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'contact') return a.email.localeCompare(b.email) * dir
    if (sortColumn === 'status') return a.status.localeCompare(b.status) * dir
    if (sortColumn === 'source') {
      const aSource = a.metadata?.source || 'manual'
      const bSource = b.metadata?.source || 'manual'
      return aSource.localeCompare(bSource) * dir
    }
    if (sortColumn === 'tags') {
      const aTag = a.metadata?.tags?.[0] || '\uffff'
      const bTag = b.metadata?.tags?.[0] || '\uffff'
      return aTag.localeCompare(bTag) * dir
    }
    if (sortColumn === 'added') return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    return 0
  })

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)))
    }
  }

  const handleDelete = (id: string) => {
    setPendingDeleteId(id)
    setConfirmDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    setConfirmDialogOpen(false)
    try {
      const { success, error } = await deleteContacts([pendingDeleteId])
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
      const ids = Array.from(selectedIds)
      const { success, error } = await deleteContacts(ids)
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        setSelectedIds(new Set())
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
    if (!selectedSegmentId || !selectedIds.size) return
    setAddingToSegment(true)
    try {
      const segName = segments.find(s => s.id === selectedSegmentId)?.name || "segment"
      const { updated, error } = await addContactsToSegment(Array.from(selectedIds), selectedSegmentId)
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
      } else {
        setSuccessMessage(`${updated} contact${updated !== 1 ? "s" : ""} added to ${segName}`)
        setTimeout(() => setSuccessMessage(null), 5000)
        setSelectedIds(new Set())
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

  function getMappedContacts(): { email: string; first_name?: string; last_name?: string; tags?: string[] }[] {
    // Build reverse map: our field → CSV column index
    const fieldToIdx: Record<string, number> = {}
    for (const [csvHeader, ourField] of Object.entries(columnMap)) {
      if (ourField) {
        const idx = csvHeaders.indexOf(csvHeader)
        if (idx >= 0) fieldToIdx[ourField] = idx
      }
    }

    if (fieldToIdx.email === undefined) return []

    const results: { email: string; first_name?: string; last_name?: string; tags?: string[] }[] = []
    for (const cols of csvRows) {
      const email = cols[fieldToIdx.email]
      if (!email) continue
      results.push({
        email,
        first_name: fieldToIdx.first_name !== undefined ? cols[fieldToIdx.first_name] || undefined : undefined,
        last_name: fieldToIdx.last_name !== undefined ? cols[fieldToIdx.last_name] || undefined : undefined,
        tags: fieldToIdx.tags !== undefined && cols[fieldToIdx.tags] ? cols[fieldToIdx.tags].split(";").map(t => t.trim()).filter(Boolean) : undefined,
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
      const result = await bulkImportContacts({
        siteId: currentSite.id,
        contacts,
      })
      if (result.error) {
        setErrorMessage(result.error)
        setErrorDialogOpen(true)
        setImporting(false)
        return
      }
      setImportResult({ imported: result.imported, skipped: result.skipped })
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
      case "lead_magnet": return <Badge variant="outline">Lead Magnet</Badge>
      case "paid_purchase": return <Badge variant="outline" className="border-green-200 text-green-700">Purchase</Badge>
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

  const sourceCounts = {
    all: stats?.total ?? 0,
    lead_magnet: stats?.bySource?.lead_magnet ?? 0,
    paid_purchase: stats?.bySource?.paid_purchase ?? 0,
    import: stats?.bySource?.import ?? 0,
    manual: stats?.bySource?.manual ?? 0,
  }

  return (
    <>
      <StickyHeader
        navLinks={[
          { label: "Newsletters", href: "/admin/newsletters", icon: Mail },
          { label: "Contacts", href: "/admin/newsletters/contacts", icon: Users, active: true },
          { label: "Segments", href: "/admin/newsletters/segments", icon: Filter },
          { label: "Automations", href: "/admin/newsletters/automations", icon: Zap },
          { label: "Templates", href: "/admin/newsletters/templates", icon: FileText },
          { label: "Email Health", href: "/admin/newsletters/email-health", icon: Shield },
          { label: "Cron Jobs", href: "/admin/newsletters/cron", icon: Clock },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Contacts"
            extraContent={
              <div className="flex items-center gap-1.5 sm:gap-3">
                {selectedIds.size > 0 && (
                  <>
                    {segments.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
                          <SelectTrigger className="h-8 w-[180px] text-sm">
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
                          size="sm"
                          className={selectedSegmentId ? "bg-green-600 hover:bg-green-700" : ""}
                          onClick={handleAddToSegment}
                          disabled={!selectedSegmentId || addingToSegment}
                        >
                          {addingToSegment ? "Adding..." : "Add to Segment"}
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setMassDeleteConfirmOpen(true)}
                      disabled={massDeleting}
                    >
                      {massDeleting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white sm:mr-2" />
                          <span className="hidden sm:inline">Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Delete ({selectedIds.size})</span>
                        </>
                      )}
                    </Button>
                  </>
                )}
                {successMessage && (
                  <div className="p-2 px-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 text-sm">{successMessage}</p>
                  </div>
                )}
                <Tabs value={filterSource} onValueChange={(v) => { setFilterSource(v); setSelectedIds(new Set()); setCurrentPage(1) }}>
                  <TabsList className="h-auto p-1 gap-1">
                    <TabsTrigger value="all" className="px-2 sm:px-3"><List className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">All ({sourceCounts.all})</span></TabsTrigger>
                    <TabsTrigger value="lead_magnet" className="px-2 sm:px-3"><Magnet className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Lead Magnets ({sourceCounts.lead_magnet})</span></TabsTrigger>
                    <TabsTrigger value="paid_purchase" className="px-2 sm:px-3"><ShoppingCart className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Purchases ({sourceCounts.paid_purchase})</span></TabsTrigger>
                    <TabsTrigger value="import" className="px-2 sm:px-3"><FileDown className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Imported ({sourceCounts.import})</span></TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="w-1 sm:w-0" />
                <Button className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 sm:py-2" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Import CSV</span></Button>
                <Button className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 sm:py-2" onClick={() => setAddModalOpen(true)}><Plus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Add Contact</span></Button>
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
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={filteredContacts.length > 0 && selectedIds.size === filteredContacts.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all contacts"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('contact')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Contact</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('contact')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('source')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Source</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('source')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Status</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('status')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('tags')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Tags</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('tags')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('added')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Added</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('added')}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-7 gap-4 items-center">
                        <div className="col-span-2 flex items-center space-x-4">
                          <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                          <div>
                            <div className="h-4 bg-muted rounded animate-pulse mb-2 w-40" />
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-24" />
                          </div>
                        </div>
                        <div><div className="h-5 bg-muted rounded-full animate-pulse w-20" /></div>
                        <div><div className="h-5 bg-muted rounded-full animate-pulse w-16" /></div>
                        <div><div className="h-5 bg-muted rounded-full animate-pulse w-16" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-20" /></div>
                        <div><div className="h-8 w-8 bg-muted rounded animate-pulse" /></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => loadContacts()} variant="outline" size="sm">Try Again</Button>
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-8 text-center">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {total === 0 ? "No contacts yet" : "No contacts match this filter"}
                  </p>
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </Button>
                </div>
              ) : (
                sortedContacts.map((contact) => (
                  <div key={contact.id} className={`p-6 transition-colors ${selectedIds.has(contact.id) ? "bg-accent/50" : ""}`}>
                    <div className="grid grid-cols-7 gap-4 items-center">
                      <div className="col-span-2 flex items-center space-x-4">
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={() => toggleSelect(contact.id)}
                          aria-label={`Select ${contact.email}`}
                        />
                        <a
                          onClick={(e) => { e.preventDefault(); openEditModal(contact) }}
                          href="#"
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
                        </a>
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
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={total}
                />
                <Pagination
                  currentPage={currentPage}
                  totalPages={Math.ceil(total / pageSize)}
                  onPageChange={(page) => { setCurrentPage(page); setSelectedIds(new Set()) }}
                  showFirstLast={false}
                />
              </div>
            )}
          </Card>

          {/* Import Modal */}
          {importModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={closeImportModal} />
              <div className="relative bg-background rounded-lg border shadow-lg p-8 w-full max-w-2xl z-50 max-h-[80vh] overflow-y-auto">
                <button onClick={closeImportModal} className="absolute top-4 right-4 rounded-sm opacity-70 hover:opacity-100">
                  <X className="h-4 w-4" />
                </button>

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
                    <div className="flex items-center justify-between mt-6 pt-4 border-t">
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
              </div>
            </div>
          )}

          {/* Add Contact Modal */}
          <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
            <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader className="mb-6">
                <DialogTitle>Add Contact</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleAddContact} className="space-y-6">
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
                <div className="grid grid-cols-2 gap-4">
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

                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={adding || !addForm.email}>
                    {adding ? "Adding..." : "Add Contact"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Edit Contact Modal */}
          <Dialog open={editContact !== null} onOpenChange={(open) => { if (!open) setEditContact(null) }}>
            <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader className="mb-6">
                <DialogTitle>Edit Contact</DialogTitle>
                {editContact && (
                  <p className="text-sm text-muted-foreground mt-1">{editContact.email}</p>
                )}
              </DialogHeader>

              <form onSubmit={handleEditContact} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
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

                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={() => setEditContact(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Single Delete Confirmation */}
          {confirmDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => { setConfirmDialogOpen(false); setPendingDeleteId(null) }} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Delete Contact</h2>
                <p className="text-sm text-muted-foreground mb-4">Are you sure? This action cannot be undone.</p>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => { setConfirmDialogOpen(false); setPendingDeleteId(null) }} variant="outline">Cancel</Button>
                  <Button onClick={confirmDelete} variant="destructive">Delete</Button>
                </div>
              </div>
            </div>
          )}

          {/* Mass Delete Confirmation */}
          {massDeleteConfirmOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => setMassDeleteConfirmOpen(false)} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Delete {selectedIds.size} Contact{selectedIds.size !== 1 ? "s" : ""}</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to delete {selectedIds.size} contact{selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setMassDeleteConfirmOpen(false)} variant="outline">Cancel</Button>
                  <Button onClick={confirmMassDelete} variant="destructive">
                    Delete {selectedIds.size} Contact{selectedIds.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error Dialog */}
          {errorDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={() => setErrorDialogOpen(false)} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Error</h2>
                <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
                <div className="flex justify-end">
                  <Button onClick={() => setErrorDialogOpen(false)}>OK</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  )
}
