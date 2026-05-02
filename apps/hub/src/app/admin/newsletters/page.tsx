"use client"

import { useState, useEffect, useCallback } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getNewsletterAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import dynamic from "next/dynamic"

const CreateNewsletterModal = dynamic(() =>
  import("@/components/admin/newsletter-builder/layout/CreateNewsletterModal").then(m => ({ default: m.CreateNewsletterModal })),
  { ssr: false }
)
const NewsletterSettingsModal = dynamic(() =>
  import("@/components/admin/newsletter-builder/layout/NewsletterSettingsModal").then(m => ({ default: m.NewsletterSettingsModal })),
  { ssr: false }
)
import type { Newsletter } from "@/components/admin/newsletter-builder/layout/CreateNewsletterModal"
import { getNewslettersBySite, deleteNewsletters, pauseNewsletter, resumeNewsletter, getNewsletterIdsAction, getNewsletterStatusEvents } from "@/lib/actions/newsletters/newsletter-actions"
import type { NewsletterStatusEvent } from "@/lib/actions/newsletters/newsletter-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Mail, Trash2, Settings, ArrowUp, ArrowDown, ChevronsUpDown, Pause, Play, Plus, Users, Zap, FileText, List, FileEdit, Send, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

function isWithinSendWindow(dripConfig: Record<string, any> | undefined) {
  if (!dripConfig?.send_window_start || !dripConfig?.send_window_end) return true

  const tz = dripConfig.send_window_timezone || 'America/New_York'
  const localizedNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const currentMinutes = localizedNow.getHours() * 60 + localizedNow.getMinutes()
  const [startH, startM] = dripConfig.send_window_start.split(':').map(Number)
  const [endH, endM] = dripConfig.send_window_end.split(':').map(Number)
  const windowStart = startH * 60 + startM
  const windowEnd = endH * 60 + endM

  return currentMinutes >= windowStart && currentMinutes < windowEnd
}

function formatSendWindow(dripConfig: Record<string, any> | undefined) {
  if (!dripConfig?.send_window_start || !dripConfig?.send_window_end) return 'window'

  const formatTime = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number)
    const period = hours >= 12 ? 'pm' : 'am'
    const displayHour = hours % 12 || 12

    if (minutes === 0) return `${displayHour}${period}`
    return `${displayHour}:${String(minutes).padStart(2, '0')}${period}`
  }

  return `${formatTime(dripConfig.send_window_start)} - ${formatTime(dripConfig.send_window_end)}`
}

function getDripStatusLabel(newsletter: Newsletter) {
  const dripConfig = newsletter.metadata?.drip_config

  if (newsletter.status === 'paused') return 'Paused'
  if (newsletter.status !== 'sending' || dripConfig?.enabled !== true) return 'Sending'
  if (!isWithinSendWindow(dripConfig)) return `Waiting for ${formatSendWindow(dripConfig)}`
  if (typeof dripConfig?.next_batch_at === 'string' && new Date(dripConfig.next_batch_at) <= new Date()) {
    return 'Waiting for cron'
  }

  return 'Sending'
}

function getDripRowChips(newsletter: Newsletter) {
  const dripConfig = newsletter.metadata?.drip_config
  const batchesSent = dripConfig?.batches_sent || 0
  const totalBounced = dripConfig?.total_bounced || 0
  const batchLabel = batchesSent === 1 ? 'batch' : 'batches'

  return [
    {
      key: 'batches',
      label: `${batchesSent} ${batchLabel}`,
      className: 'bg-muted/40 text-muted-foreground',
    },
    {
      key: 'bounced',
      label: `${totalBounced} bounced`,
      className: 'border-red-200 bg-red-50 text-red-700',
    },
  ]
}

function getDeliveryChips(newsletter: Newsletter) {
  const chips = []

  if (newsletter.total_send_events > 0) {
    chips.push({
      key: 'delivery-summary',
      label: `${newsletter.total_send_events.toLocaleString()} send events to ${newsletter.total_recipients.toLocaleString()} original audience`,
      className: 'bg-muted/40 text-muted-foreground',
    })
  }

  if (newsletter.total_sent > 0) {
    chips.push({
      key: 'unique-sent',
      label: `${newsletter.total_sent.toLocaleString()} unique sent`,
      className: 'bg-muted/40 text-muted-foreground',
    })
  }

  if (newsletter.duplicate_send_events > 0) {
    chips.push({
      key: 'duplicate-events',
      label: `${newsletter.duplicate_send_events.toLocaleString()} ${newsletter.duplicate_send_events === 1 ? 'duplicate' : 'duplicates'}`,
      className: 'border-orange-200 bg-orange-50 text-orange-700',
    })
  }

  return chips
}

function getStatusEventBadge(status: NewsletterStatusEvent['status']) {
  if (status === 'Duplicate') return <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">Duplicate</Badge>
  if (status === 'Bounced') return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Bounced</Badge>
  if (status === 'Unsubscribed') return <Badge variant="outline" className="border-yellow-200 bg-yellow-50 text-yellow-800">Unsubscribed</Badge>
  return <Badge variant="secondary">OK</Badge>
}

export default function NewslettersPage() {
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const router = useRouter()
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createActiveTab, setCreateActiveTab] = useState("general")
  const [settingsNewsletterId, setSettingsNewsletterId] = useState<string | null>(null)
  const [statusNewsletterId, setStatusNewsletterId] = useState<string | null>(null)
  const [statusEvents, setStatusEvents] = useState<NewsletterStatusEvent[]>([])
  const [statusEventsLoading, setStatusEventsLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'sent'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Tracks if user selected all items across all pages
  const [allSelected, setAllSelected] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize
  const [sortColumn, setSortColumn] = useState<'name' | 'opens' | 'clicks' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const hasSendingNewsletter = newsletters.some((newsletter) => newsletter.status === 'sending')

  const loadNewsletters = useCallback(async (showSkeleton = true) => {
    if (!currentSite?.id) {
      setLoading(true)
      setNewsletters([])
      return
    }

    try {
      if (showSkeleton) setLoading(true)
      const { data, total: t, error } = await getNewslettersBySite(currentSite.id, { page: currentPage, pageSize })
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        setLoading(false)
        return
      }
      setNewsletters(data ?? [])
      setTotal(t)
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }, [currentSite?.id, currentPage, pageSize])

  useEffect(() => {
    loadNewsletters()
  }, [loadNewsletters])

  useEffect(() => {
    if (!hasSendingNewsletter) return

    const interval = window.setInterval(() => {
      loadNewsletters(false)
    }, 10000)

    return () => window.clearInterval(interval)
  }, [hasSendingNewsletter, loadNewsletters])

  useEffect(() => {
    if (!statusNewsletterId) {
      setStatusEvents([])
      return
    }

    let cancelled = false
    setStatusEventsLoading(true)

    getNewsletterStatusEvents(statusNewsletterId).then((result) => {
      if (cancelled) return
      if (result.error) {
        setErrorMessage(result.error)
        setErrorDialogOpen(true)
        setStatusEvents([])
      } else {
        setStatusEvents(result.data ?? [])
      }
      setStatusEventsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [statusNewsletterId])

  const handleDelete = (id: string) => {
    setPendingDeleteId(id)
    setConfirmDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    setConfirmDialogOpen(false)

    const { success, error } = await deleteNewsletters([pendingDeleteId])
    if (error) {
      setErrorMessage(error)
      setErrorDialogOpen(true)
    }
    if (success) {
      loadNewsletters()
    }
    setPendingDeleteId(null)
  }

  const cancelDelete = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setAllSelected(false)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredNewsletters.length) {
      setSelectedIds(new Set())
      setAllSelected(false)
    } else {
      setSelectedIds(new Set(filteredNewsletters.map(n => n.id)))
    }
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getNewsletterIdsAction(currentSite.id)
    if (ids) {
      setSelectedIds(new Set(ids))
      setAllSelected(true)
    }
  }

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedIds(new Set())
    setAllSelected(false)
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const { success, error } = await deleteNewsletters(Array.from(selectedIds))
      if (error) {
        setErrorMessage(error)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        setSelectedIds(new Set())
        setAllSelected(false)
        loadNewsletters()
      }
    } catch {
      setErrorMessage("Failed to delete newsletters")
      setErrorDialogOpen(true)
    } finally {
      setMassDeleting(false)
    }
  }

  const getStatusBadge = (newsletter: Newsletter) => {
    switch (newsletter.status) {
      case 'sent': return <Badge variant="default" className="bg-green-100 text-green-800">Sent</Badge>
      case 'sending': return <Badge variant="default" className="bg-blue-100 text-blue-800">{getDripStatusLabel(newsletter)}</Badge>
      case 'paused': return <Badge variant="default" className="bg-orange-100 text-orange-800">Paused</Badge>
      case 'scheduled': return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Scheduled</Badge>
      default: return <Badge variant="secondary">Draft</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredNewsletters = newsletters.filter((n) => {
    let statusMatch = true
    if (filterStatus === 'sent') statusMatch = n.status === 'sent' || n.status === 'sending' || n.status === 'paused'
    if (filterStatus === 'draft') statusMatch = n.status === 'draft' || n.status === 'scheduled'

    const searchText = `${n.subject} ${n.from_name ?? ""} ${n.status}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && searchMatch
  })

  const toggleSort = (column: 'name' | 'opens' | 'clicks' | 'modified') => {
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

  const getSortIcon = (column: 'name' | 'opens' | 'clicks' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedNewsletters = [...filteredNewsletters].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.subject.localeCompare(b.subject) * dir
    if (sortColumn === 'opens') {
      const aRate = a.total_sent > 0 ? a.total_opened / a.total_sent : -1
      const bRate = b.total_sent > 0 ? b.total_opened / b.total_sent : -1
      return (aRate - bRate) * dir
    }
    if (sortColumn === 'clicks') {
      const aRate = a.total_sent > 0 ? a.total_clicked / a.total_sent : -1
      const bRate = b.total_sent > 0 ? b.total_clicked / b.total_sent : -1
      return (aRate - bRate) * dir
    }
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  const statusCounts = {
    all: newsletters.length,
    sent: newsletters.filter((n) => n.status === 'sent' || n.status === 'sending' || n.status === 'paused').length,
    draft: newsletters.filter((n) => n.status === 'draft' || n.status === 'scheduled').length,
  }

  const filterOptions = [
    { value: 'all' as const, label: 'All', count: statusCounts.all, icon: List },
    { value: 'draft' as const, label: 'Drafts', count: statusCounts.draft, icon: FileEdit },
    { value: 'sent' as const, label: 'Sent', count: statusCounts.sent, icon: Send },
  ]

  const handleFilterChange = (value: string) => {
    setFilterStatus(value as 'all' | 'draft' | 'sent')
    setSelectedIds(new Set())
    setAllSelected(false)
    setCurrentPage(1)
  }

  const activeFilter = filterOptions.find((option) => option.value === filterStatus) ?? filterOptions[0]

  return (
    <>
      <StickyHeader navLinks={getNewsletterAdminTopNavLinks("newsletters", currentSite?.id ? `/admin/sites/${currentSite.id}/settings/newsletters` : undefined)} />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[{ label: "Newsletters" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search newsletters",
            }}
            preActions={
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" aria-label="Filter newsletters">
                      <activeFilter.icon className="h-4 w-4 text-muted-foreground" />
                      <span>{activeFilter.label}</span>
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40 space-y-1">
                    {filterOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onSelect={() => handleFilterChange(option.value)}
                        className={cn(option.value === filterStatus && "bg-accent text-accent-foreground")}
                      >
                        <option.icon className="h-4 w-4 text-muted-foreground" />
                        <span>{option.label}</span>
                        <span className="ml-auto text-muted-foreground">{option.count}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {selectedIds.size > 0 ? (
                  <Button
                    variant="destructive"
                    onClick={() => setMassDeleteConfirmOpen(true)}
                    disabled={massDeleting}
                  >
                    {massDeleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        <span className="hidden sm:inline">Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Delete ({selectedIds.size})</span>
                      </>
                    )}
                  </Button>
                ) : null}
              </>
            }
            actions={
              <>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Newsletter</span>
                </Button>
              </>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-9 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-4 flex items-center space-x-4">
                  <Checkbox
                    checked={filteredNewsletters.length > 0 && selectedIds.size === filteredNewsletters.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all newsletters"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Newsletter</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('name')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('opens')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Opens</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('opens')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('clicks')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Clicks</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('clicks')}</span>
                </button>
                <div>Unsubscribes</div>
                <button
                  type="button"
                  onClick={() => toggleSort('modified')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Modified</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('modified')}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            {filteredNewsletters.length > 0 && selectedIds.size === filteredNewsletters.length && total > filteredNewsletters.length && (
              <div className="px-6 py-2 bg-accent/50 border-b text-sm text-center">
                {allSelected ? (
                  <span>All {total} items selected. <button type="button" onClick={handleClearSelection} className="underline hover:text-foreground text-muted-foreground">Clear selection</button></span>
                ) : (
                  <span>{filteredNewsletters.length} items on this page are selected. <button type="button" onClick={handleSelectAll} className="underline font-medium">Select all {total}</button></span>
                )}
              </div>
            )}

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-6">
                      <div className="grid grid-cols-9 gap-4 items-center">
                        <div className="col-span-4 flex items-center space-x-4">
                          <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                          <div className="w-12 h-12 bg-muted rounded animate-pulse ml-2" />
                          <div className="h-4 w-56 max-w-full rounded bg-muted animate-pulse" />
                        </div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-10" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-10" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-10" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-16" /></div>
                        <div />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredNewsletters.length === 0 ? (
                <div className="p-8 text-center">
                  <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {newsletters.length === 0
                      ? 'No newsletters found'
                      : `No ${filterStatus === 'all' ? '' : filterStatus} newsletters found`}
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                    Create Your First Newsletter
                  </Button>
                </div>
              ) : (
                sortedNewsletters.map((newsletter) => (
                  <div key={newsletter.id} className={`p-6 transition-colors ${selectedIds.has(newsletter.id) ? "bg-accent/50" : ""}`}>
                    <div className="grid grid-cols-9 gap-4 items-center">
                      <div className="col-span-4">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={selectedIds.has(newsletter.id)}
                            onCheckedChange={() => toggleSelect(newsletter.id)}
                            aria-label={`Select ${newsletter.subject}`}
                          />
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center ml-2">
                            <Mail className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/newsletters/${newsletter.id}`}
                              className="hover:opacity-80 transition-opacity"
                            >
                              <h4 className="font-medium hover:underline">{newsletter.subject}</h4>
                            </Link>
                            <div className="mt-1.5 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
                              {(newsletter.status === 'sending' || newsletter.status === 'paused') && newsletter.metadata?.drip_config?.enabled && (
                                <>
                                  <button
                                    type="button"
                                    className={`inline-flex h-6 shrink-0 items-center gap-1 rounded border px-2 text-xs font-medium transition-colors ${newsletter.status === 'sending' ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100' : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'}`}
                                    title={newsletter.status === 'sending' ? 'Pause' : 'Resume'}
                                    onClick={async (e) => {
                                      e.stopPropagation()
                                      if (newsletter.status === 'sending') {
                                        await pauseNewsletter(newsletter.id)
                                      } else {
                                        await resumeNewsletter(newsletter.id)
                                      }
                                      await loadNewsletters(false)
                                    }}
                                  >
                                    {newsletter.status === 'sending' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                                    {newsletter.status === 'sending' ? 'Pause' : 'Resume'}
                                  </button>
                                  <Badge variant="outline" className="h-6 shrink-0 bg-background px-2 text-xs font-medium">
                                    {getDripStatusLabel(newsletter)}
                                  </Badge>
                                  {getDeliveryChips(newsletter).map((chip) => (
                                    <Badge key={chip.key} variant="outline" className={`h-6 shrink-0 px-2 text-xs font-normal ${chip.className}`}>
                                      {chip.label}
                                    </Badge>
                                  ))}
                                  {getDripRowChips(newsletter).map((chip) => (
                                    <Badge key={chip.key} variant="outline" className={`h-6 shrink-0 px-2 text-xs font-normal ${chip.className}`}>
                                      {chip.label}
                                    </Badge>
                                  ))}
                                </>
                              )}
                              {!(newsletter.status === 'sending' || newsletter.status === 'paused') || !newsletter.metadata?.drip_config?.enabled ? (
                                <>
                                  {getStatusBadge(newsletter)}
                                  {getDeliveryChips(newsletter).map((chip) => (
                                    <Badge key={chip.key} variant="outline" className={`h-6 shrink-0 px-2 text-xs font-normal ${chip.className}`}>
                                      {chip.label}
                                    </Badge>
                                  ))}
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {newsletter.total_sent > 0
                            ? `${Math.round((newsletter.total_opened / newsletter.total_sent) * 100)}%`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {newsletter.total_sent > 0
                            ? `${Math.round((newsletter.total_clicked / newsletter.total_sent) * 100)}%`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {newsletter.total_sent <= 0
                            ? "—"
                            : (newsletter.total_unsubscribed / newsletter.total_sent) * 100 === 0
                              ? "0%"
                              : (newsletter.total_unsubscribed / newsletter.total_sent) * 100 < 10
                                ? `${(((newsletter.total_unsubscribed / newsletter.total_sent) * 100)).toFixed(1)}%`
                                : `${Math.round((newsletter.total_unsubscribed / newsletter.total_sent) * 100)}%`}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(newsletter.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => setStatusNewsletterId(newsletter.id)}
                        >
                          Status
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setSettingsNewsletterId(newsletter.id)}
                          title="Newsletter Settings"
                        >
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Newsletter Settings</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => handleDelete(newsletter.id)}
                          title="Delete Newsletter"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete Newsletter</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
                <Pagination currentPage={currentPage} totalPages={Math.ceil(total / pageSize)} onPageChange={setCurrentPage} showFirstLast={false} />
              </div>
            )}
          </Card>

          {/* Create Newsletter Dialog */}
          <Dialog
            open={showCreateDialog}
            onOpenChange={(open) => {
              setShowCreateDialog(open)
              if (open) {
                setCreateActiveTab("general")
              }
            }}
          >
            <AdminModalContent>
              <Tabs value={createActiveTab} onValueChange={setCreateActiveTab} className="flex min-h-0 flex-1 flex-col">
                <AdminModalHeader>
                  <div className="flex min-w-0 flex-wrap items-center gap-4 pr-10">
                    <AdminModalTitle className="shrink-0">Create New Newsletter</AdminModalTitle>
                    <TabsList className="h-9 shrink-0">
                      <TabsTrigger value="general" className="h-7 py-0">General</TabsTrigger>
                      <TabsTrigger value="drip-options" className="h-7 py-0">Drip Options</TabsTrigger>
                      <TabsTrigger value="audience-filter" className="h-7 py-0">Audience Filter</TabsTrigger>
                    </TabsList>
                  </div>
                </AdminModalHeader>
                <CreateNewsletterModal
                  onSuccess={(newsletter) => {
                    setShowCreateDialog(false)
                    router.push(`/admin/newsletters/${newsletter.id}`)
                  }}
                  onCancel={() => setShowCreateDialog(false)}
                />
              </Tabs>
            </AdminModalContent>
          </Dialog>

          {/* Newsletter Settings Modal */}
          <NewsletterSettingsModal
            open={settingsNewsletterId !== null}
            onOpenChange={(open) => setSettingsNewsletterId(open ? settingsNewsletterId : null)}
            newsletter={newsletters.find((n) => n.id === settingsNewsletterId) || null}
            siteId={currentSite?.id || ''}
            onSuccess={(updated) => {
              setNewsletters((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
            }}
          />

          <Dialog open={statusNewsletterId !== null} onOpenChange={(open) => setStatusNewsletterId(open ? statusNewsletterId : null)}>
            <AdminModalContent size="wide">
              <AdminModalHeader>
                <AdminModalTitle>Status</AdminModalTitle>
              </AdminModalHeader>
              <AdminModalBody className="pb-6">
                <div className="overflow-hidden rounded-md border">
                  <div className="grid grid-cols-3 gap-4 border-b bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground">
                    <div>Email</div>
                    <div>Event</div>
                    <div>Status</div>
                  </div>
                  <div className="max-h-[560px] overflow-y-auto divide-y">
                    {statusEventsLoading ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading status events...</div>
                    ) : statusEvents.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">No events found.</div>
                    ) : statusEvents.map((event) => (
                      <div key={event.id} className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
                        <div className="min-w-0 truncate">{event.email}</div>
                        <div className="capitalize text-muted-foreground">{event.event}</div>
                        <div>{getStatusEventBadge(event.status)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </AdminModalBody>
            </AdminModalContent>
          </Dialog>

          {/* Confirmation Dialog */}
          {confirmDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50" onClick={cancelDelete} />
              <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
                <h2 className="text-lg font-semibold mb-2">Delete Newsletter</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to delete this newsletter? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button onClick={cancelDelete} variant="outline">Cancel</Button>
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
                <h2 className="text-lg font-semibold mb-2">Delete {selectedIds.size} Newsletter{selectedIds.size !== 1 ? "s" : ""}</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to delete {selectedIds.size} newsletter{selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setMassDeleteConfirmOpen(false)} variant="outline">Cancel</Button>
                  <Button onClick={confirmMassDelete} variant="destructive">
                    Delete {selectedIds.size} Newsletter{selectedIds.size !== 1 ? "s" : ""}
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
