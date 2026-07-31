"use client"

import { useState, useEffect, useCallback } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  AdminListFooter,
  AdminListPending,
  AdminSortableHead,
  AdminSortButton,
  AdminTableShell,
  ConfirmDestructive,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import dynamic from "@/lib/dynamic"
import { showErrorToast } from "@/lib/error-toast"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"

const CreateNewsletterModal = dynamic(
  () =>
    import("@/components/admin/newsletter-builder/layout/CreateNewsletterModal").then((m) => ({
      default: m.CreateNewsletterModal
    })),
  { ssr: false }
)
const NewsletterSettingsModal = dynamic(
  () =>
    import("@/components/admin/newsletter-builder/layout/NewsletterSettingsModal").then((m) => ({
      default: m.NewsletterSettingsModal
    })),
  { ssr: false }
)
import type { Newsletter } from "@/components/admin/newsletter-builder/layout/CreateNewsletterModal"
import {
  getNewslettersBySite,
  deleteNewsletters,
  pauseNewsletter,
  resumeNewsletter
} from "@/lib/actions/newsletters/newsletter-actions"
import { formatNewsletterSendWindows, isWithinNewsletterSendWindow } from "@/lib/actions/newsletters/send-windows"
import { Checkbox } from "@/components/ui/checkbox"
import Mail from "lucide-react/dist/esm/icons/mail.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Pause from "lucide-react/dist/esm/icons/pause.js"
import Play from "lucide-react/dist/esm/icons/play.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { useRouter } from "@/lib/navigation-client"
import Link from "@/components/app-link"
import { NewsletterStatusEventsModal } from "@/components/admin/newsletter-builder/layout/NewsletterStatusEventsModal"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"

type NewsletterSortColumn = "name" | "opens" | "clicks" | "modified"

function getDripStatusLabel(newsletter: Newsletter) {
  const dripConfig = newsletter.metadata?.drip_config

  if (newsletter.status === "paused") return "Paused"
  if (newsletter.status !== "sending" || dripConfig?.enabled !== true) return "Sending"
  if (!isWithinNewsletterSendWindow(dripConfig)) return `Waiting for ${formatNewsletterSendWindows(dripConfig)}`
  if (typeof dripConfig?.next_batch_at === "string" && new Date(dripConfig.next_batch_at) <= new Date()) {
    return "Waiting for cron"
  }

  return "Sending"
}

function getNextBatchLabel(newsletter: Newsletter) {
  const dripConfig = newsletter.metadata?.drip_config

  if (
    newsletter.status !== "sending" ||
    dripConfig?.enabled !== true ||
    typeof dripConfig?.next_batch_at !== "string"
  ) {
    return null
  }

  const nextBatchAt = new Date(dripConfig.next_batch_at)
  if (nextBatchAt <= new Date()) return null

  return `Next batch: ${nextBatchAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
}

function getDeliveryChips(newsletter: Newsletter) {
  const chips = []

  if (newsletter.total_send_events > 0) {
    chips.push({
      key: "delivery-summary",
      label: `${newsletter.total_send_events.toLocaleString()} of ${newsletter.total_recipients.toLocaleString()} sent`,
      className: "bg-muted/40 text-muted-foreground"
    })
  }

  return chips
}

function getSentStatsChips(newsletter: Newsletter) {
  return [
    {
      key: "sent",
      label: `${newsletter.total_sent.toLocaleString()} sent`,
      className: "bg-muted/40 text-muted-foreground"
    },
    {
      key: "opened",
      label: `${newsletter.total_opened.toLocaleString()} opened`,
      className: "bg-muted/40 text-muted-foreground"
    },
    {
      key: "clicked",
      label: `${newsletter.total_clicked.toLocaleString()} clicked`,
      className: "bg-muted/40 text-muted-foreground"
    },
    {
      key: "unsubscribed",
      label: `${newsletter.total_unsubscribed.toLocaleString()} unsubscribed`,
      className: "bg-muted/40 text-muted-foreground"
    },
    {
      key: "bounced",
      label: `${newsletter.total_bounced.toLocaleString()} bounced`,
      className: "bg-muted/40 text-muted-foreground"
    },
    {
      key: "duplicates",
      label: `${newsletter.duplicate_send_events.toLocaleString()} duplicates`,
      className: "bg-muted/40 text-muted-foreground"
    }
  ]
}

export default function NewslettersPage() {
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const router = useRouter()
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [settingsNewsletterId, setSettingsNewsletterId] = useState<string | null>(null)
  const [statusNewsletterId, setStatusNewsletterId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "sent">("all")
  const [searchQuery, setSearchQuery] = useState("")

  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const newsletterSelection = useAdminBulkSelection()
  const newsletterSort = useAdminSort<NewsletterSortColumn>()

  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSite?.id}|${filterStatus}|${searchQuery}|${newsletterSort.sortColumn}|${newsletterSort.sortDirection}`
  // Searching, filtering or re-sorting from a later page would otherwise
  // land you past the end of the shorter result.
  useResetPageOnListChange(setCurrentPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page
  // and rows-per-page included, so a bulk action only ever means rows on
  // screen.
  useClearSelectionOnListChange(newsletterSelection, `${listQueryKey}|${currentPage}|${pageSize}`)

  const hasSendingNewsletter = newsletters.some((newsletter) => newsletter.status === "sending")

  const loadNewsletters = useCallback(
    async (showSkeleton = true) => {
      if (!currentSite?.id) {
        setLoading(true)
        setNewsletters([])
        return
      }

      try {
        if (showSkeleton) setLoading(true)
        const {
          data,
          total: t,
          error
        } = await getNewslettersBySite({ data: { siteId: currentSite.id, options: {
          page: currentPage,
          pageSize
        } } })
        if (error) {
          showErrorToast(error)
          setLoading(false)
          return
        }
        setNewsletters(data ?? [])
        setTotal(t)
        setLoading(false)
      } catch {
        setLoading(false)
      }
    },
    [currentSite?.id, currentPage, pageSize]
  )

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

  const handleDelete = (id: string) => {
    setErrorMessage("")
    setPendingDeleteId(id)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const newsletterId = pendingDeleteId

    const { success, error } = await deleteNewsletters({ data: { ids: [newsletterId] } })
    if (error) {
      setErrorMessage(error)
    }
    if (success) {
      setPendingDeleteId(null)
      loadNewsletters()
      showActionSuccess("Newsletter deleted.")
    }
  }

  const cancelDelete = () => {
    setPendingDeleteId(null)
    setErrorMessage("")
  }

  const confirmMassDelete = async () => {
    setMassDeleting(true)
    const deletedCount = newsletterSelection.selectedCount
    try {
      const { success, error } = await deleteNewsletters({ data: { ids: Array.from(newsletterSelection.selectedIds) } })
      if (error) {
        setErrorMessage(error)
        return
      }
      if (success) {
        newsletterSelection.clearSelection()
        setMassDeleteConfirmOpen(false)
        loadNewsletters()
        showActionSuccess(deletedCount === 1 ? "Newsletter deleted." : "Newsletters deleted.")
      }
    } catch {
      setErrorMessage("Failed to delete newsletters")
    } finally {
      setMassDeleting(false)
    }
  }

  const getStatusBadge = (newsletter: Newsletter) => {
    switch (newsletter.status) {
      case "sent":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">
            Sent
          </Badge>
        )
      case "sending":
        return (
          <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
            {getDripStatusLabel(newsletter)}
          </Badge>
        )
      case "paused":
        return (
          <Badge variant="default" className="bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300">
            Paused
          </Badge>
        )
      case "scheduled":
        return (
          <Badge variant="default" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300">
            Scheduled
          </Badge>
        )
      default:
        return <Badge variant="secondary">Draft</Badge>
    }
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredNewsletters = newsletters.filter((n) => {
    let statusMatch = true
    if (filterStatus === "sent") statusMatch = n.status === "sent" || n.status === "sending" || n.status === "paused"
    if (filterStatus === "draft") statusMatch = n.status === "draft" || n.status === "scheduled"

    const searchText = `${n.subject} ${n.from_name ?? ""} ${n.status}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && searchMatch
  })

  const sortedNewsletters = [...filteredNewsletters].sort((a, b) => {
    if (!newsletterSort.sortColumn) return 0
    const dir = newsletterSort.sortDirection === "asc" ? 1 : -1
    if (newsletterSort.sortColumn === "name") return a.subject.localeCompare(b.subject) * dir
    if (newsletterSort.sortColumn === "opens") {
      const aRate = a.total_sent > 0 ? a.total_opened / a.total_sent : -1
      const bRate = b.total_sent > 0 ? b.total_opened / b.total_sent : -1
      return (aRate - bRate) * dir
    }
    if (newsletterSort.sortColumn === "clicks") {
      const aRate = a.total_sent > 0 ? a.total_clicked / a.total_sent : -1
      const bRate = b.total_sent > 0 ? b.total_clicked / b.total_sent : -1
      return (aRate - bRate) * dir
    }
    if (newsletterSort.sortColumn === "modified")
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })
  const visibleNewsletterIds = sortedNewsletters.map((newsletter) => newsletter.id)

  const statusCounts = {
    all: newsletters.length,
    sent: newsletters.filter((n) => n.status === "sent" || n.status === "sending" || n.status === "paused").length,
    draft: newsletters.filter((n) => n.status === "draft" || n.status === "scheduled").length
  }

  const handleFilterChange = (value: string) => {
    setFilterStatus(value as "all" | "draft" | "sent")
  }

  const openStatusEvents = (newsletterId: string) => {
    setStatusNewsletterId(newsletterId)
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Newsletters" }]}
          />

          <AdminTableShell
            title="Newsletters"
            icon={<Mail className="text-muted-foreground" />}
            count={filteredNewsletters.length}
            loading={loading}
            selectedCount={newsletterSelection.selectedCount}
            onClearSelection={newsletterSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={newsletterSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search newsletters"
                />
                <Select value={filterStatus} onValueChange={handleFilterChange}>
                  <TableRightActionsSelectTrigger aria-label="Newsletter status filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({statusCounts.all})</SelectItem>
                    <SelectItem value="draft">Drafts ({statusCounts.draft})</SelectItem>
                    <SelectItem value="sent">Sent ({statusCounts.sent})</SelectItem>
                  </SelectContent>
                </Select>
                <TableRightActionsButton onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Newsletter</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={
              !loading ? (
                <AdminListFooter
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setCurrentPage}
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
                        checked={newsletterSelection.isPageSelected(visibleNewsletterIds)}
                        onCheckedChange={() => newsletterSelection.togglePage(visibleNewsletterIds)}
                        aria-label="Select all newsletters"
                      />
                    </TableHead>
                    <AdminSortableHead column="main" sort={newsletterSort} sortKey="name">Newsletter</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={newsletterSort} sortKey="opens">Opens</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={newsletterSort} sortKey="clicks">Clicks</AdminSortableHead>
                    <TableHead column="meta">Unsubscribes</TableHead>
                    <AdminSortableHead column="meta" sort={newsletterSort} sortKey="modified">Modified</AdminSortableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && sortedNewsletters.length === 0 ? (
                    <AdminListPending />
                  ) : filteredNewsletters.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Mail className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        {searchQuery.trim() || filterStatus !== "all" ? (
                          <p className="text-muted-foreground">No newsletters found matching your search.</p>
                        ) : (
                          <>
                            <p className="mb-4 text-muted-foreground">No newsletters found</p>
                            <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                              Create Your First Newsletter
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedNewsletters.map((newsletter) => (
                      <TableRow
                        key={newsletter.id}
                        data-state={newsletterSelection.selectedIds.has(newsletter.id) ? "selected" : undefined}
                        className="group"
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={newsletterSelection.selectedIds.has(newsletter.id)}
                            onCheckedChange={() => newsletterSelection.toggleOne(newsletter.id)}
                            aria-label={`Select ${newsletter.subject}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <div className="flex min-w-0 items-center space-x-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                              <Mail className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/newsletters/${newsletter.id}`}
                                className="transition-opacity hover:opacity-80"
                              >
                                <h4 className="truncate text-sm font-medium hover:underline sm:text-base" title={newsletter.subject}>{newsletter.subject}</h4>
                              </Link>
                              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                                {(newsletter.status === "sending" || newsletter.status === "paused") &&
                                  newsletter.metadata?.drip_config?.enabled && (
                                    <>
                                      <button
                                        type="button"
                                        className={`inline-flex h-6 shrink-0 items-center gap-1 rounded border px-2 text-xs font-medium transition-colors ${newsletter.status === "sending" ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400 dark:hover:bg-orange-900/40" : "border-green-200 bg-green-50 text-green-700 dark:text-green-300 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/40"}`}
                                        title={newsletter.status === "sending" ? "Pause" : "Resume"}
                                        onClick={async (e) => {
                                          e.stopPropagation()
                                          const pausing = newsletter.status === "sending"
                                          const { error: pauseError } = pausing
                                            ? await pauseNewsletter({ data: { newsletterId: newsletter.id } })
                                            : await resumeNewsletter({ data: { newsletterId: newsletter.id } })
                                          if (pauseError) {
                                            showErrorToast(pauseError)
                                            return
                                          }
                                          await loadNewsletters(false)
                                          showActionSuccess(pausing ? "Newsletter paused." : "Newsletter resumed.")
                                        }}
                                      >
                                        {newsletter.status === "sending" ? (
                                          <Pause className="h-3 w-3" />
                                        ) : (
                                          <Play className="h-3 w-3" />
                                        )}
                                        {newsletter.status === "sending" ? "Pause" : "Resume"}
                                      </button>
                                      <Badge
                                        variant="outline"
                                        className="h-6 shrink-0 bg-background px-2 text-xs font-medium"
                                      >
                                        {getDripStatusLabel(newsletter)}
                                      </Badge>
                                      {getNextBatchLabel(newsletter) ? (
                                        <Badge
                                          variant="outline"
                                          className="h-6 shrink-0 bg-background px-2 text-xs font-normal"
                                        >
                                          {getNextBatchLabel(newsletter)}
                                        </Badge>
                                      ) : null}
                                      {getDeliveryChips(newsletter).map((chip) => (
                                        <Badge
                                          key={chip.key}
                                          variant="outline"
                                          className={`h-6 shrink-0 px-2 text-xs font-normal ${chip.className}`}
                                        >
                                          {chip.label}
                                        </Badge>
                                      ))}
                                    </>
                                  )}
                                {!(newsletter.status === "sending" || newsletter.status === "paused") ||
                                !newsletter.metadata?.drip_config?.enabled ? (
                                  <>
                                    {getStatusBadge(newsletter)}
                                    {(newsletter.status === "sent"
                                      ? getSentStatsChips(newsletter)
                                      : getDeliveryChips(newsletter)
                                    ).map((chip) => (
                                      <Badge
                                        key={chip.key}
                                        variant="outline"
                                        className={`h-6 shrink-0 px-2 text-xs font-normal ${chip.className}`}
                                      >
                                        {chip.label}
                                      </Badge>
                                    ))}
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell column="mutedMeta">
                          {newsletter.total_sent > 0
                            ? `${Math.round((newsletter.total_opened / newsletter.total_sent) * 100)}%`
                            : "—"}
                        </TableCell>
                        <TableCell column="mutedMeta">
                          {newsletter.total_sent > 0
                            ? `${Math.round((newsletter.total_clicked / newsletter.total_sent) * 100)}%`
                            : "—"}
                        </TableCell>
                        <TableCell column="mutedMeta">
                          {newsletter.total_sent <= 0
                            ? "—"
                            : (newsletter.total_unsubscribed / newsletter.total_sent) * 100 === 0
                              ? "0%"
                              : (newsletter.total_unsubscribed / newsletter.total_sent) * 100 < 10
                                ? `${((newsletter.total_unsubscribed / newsletter.total_sent) * 100).toFixed(1)}%`
                                : `${Math.round((newsletter.total_unsubscribed / newsletter.total_sent) * 100)}%`}
                        </TableCell>
                        <TableCell column="mutedMeta">{formatRelativeDate(newsletter.updated_at)}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => openStatusEvents(newsletter.id)}
                            >
                              Events
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
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              onClick={() => handleDelete(newsletter.id)}
                              title="Delete Newsletter"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete Newsletter</span>
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

          {/* Create Newsletter Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <CreateNewsletterModal
              onSuccess={(newsletter) => {
                setShowCreateDialog(false)
                router.push(`/admin/newsletters/${newsletter.id}`)
              }}
              onCancel={() => setShowCreateDialog(false)}
            />
          </Dialog>

          {/* Newsletter Settings Modal */}
          <NewsletterSettingsModal
            open={settingsNewsletterId !== null}
            onOpenChange={(open) => setSettingsNewsletterId(open ? settingsNewsletterId : null)}
            newsletter={newsletters.find((n) => n.id === settingsNewsletterId) || null}
            siteId={currentSite?.id || ""}
            onSuccess={(updated) => {
              setNewsletters((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
            }}
          />

          <NewsletterStatusEventsModal
            open={statusNewsletterId !== null}
            newsletterId={statusNewsletterId}
            onError={showErrorToast}
            onOpenChange={(open) => {
              if (!open) setStatusNewsletterId(null)
            }}
          />

          <ConfirmDestructive
            action="delete-newsletter"
            open={pendingDeleteId !== null}
            title="Delete Newsletter"
            description="Are you sure you want to delete this newsletter? This action cannot be undone."
            error={errorMessage || null}
            onCancel={cancelDelete}
            onConfirm={confirmDelete}
          />

          <ConfirmDestructive
            action="delete-newsletter"
            open={massDeleteConfirmOpen}
            title={`Delete ${newsletterSelection.selectedCount} Newsletter${newsletterSelection.selectedCount !== 1 ? "s" : ""}`}
            description={`Are you sure you want to delete ${newsletterSelection.selectedCount} newsletter${newsletterSelection.selectedCount !== 1 ? "s" : ""}? This action cannot be undone.`}
            confirmLabel={`Delete ${newsletterSelection.selectedCount} Newsletter${newsletterSelection.selectedCount !== 1 ? "s" : ""}`}
            disabled={massDeleting}
            error={errorMessage || null}
            onCancel={() => { setMassDeleteConfirmOpen(false); setErrorMessage("") }}
            onConfirm={confirmMassDelete}
          />
        </div>
      </AdminLayout>
    </>
  )
}
