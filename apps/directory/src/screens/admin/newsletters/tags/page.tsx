"use client"

import { useCallback, useDeferredValue, useEffect, useState, type FormEvent } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  TableRightActions,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminListFooter,
  AdminSortButton,
  AdminTableShell, AdminListPending,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Tag from "lucide-react/dist/esm/icons/tag.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  deleteNewsletterContactTags,
  getNewsletterContactTags,
  renameNewsletterContactTag,
  type NewsletterContactTag,
  type NewsletterContactTagFilter
} from "@/lib/actions/newsletters/contact-tag-actions"
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

type TagSortColumn = "tag" | "contacts" | "lastUsed"

export default function NewsletterContactTagsPage() {
  const { currentSite, loading: siteLoading, pageSize: contextPageSize } = useSiteSwitcher()
  const [tags, setTags] = useState<NewsletterContactTag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [tagFilter, setTagFilter] = useState<NewsletterContactTagFilter>("all")
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [renamingTag, setRenamingTag] = useState<NewsletterContactTag | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameInvalid, setRenameInvalid] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const pageSize = contextPageSize
  const tagSelection = useAdminBulkSelection()
  const clearTagSelection = tagSelection.clearSelection
  const tagSort = useAdminSort<TagSortColumn>("tag", "asc")
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSite?.id}|${deferredSearchQuery}|${tagFilter}|${tagSort.sortColumn}|${tagSort.sortDirection}`
  // Searching, filtering or re-sorting from a later page would otherwise
  // land you past the end of the shorter result.
  useResetPageOnListChange(setCurrentPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page
  // and rows-per-page included, so a bulk action only ever means rows on
  // screen.
  useClearSelectionOnListChange(tagSelection, `${listQueryKey}|${currentPage}|${pageSize}`)


  useEffect(() => {
    clearTagSelection()
  }, [clearTagSelection, currentSite?.id, siteLoading])

  const loadTags = useCallback(async () => {
    if (siteLoading || !currentSite?.id) {
      setLoading(siteLoading)
      setError(null)
      setTags([])
      setTotal(0)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const result = await getNewsletterContactTags({ data: { siteId: currentSite.id, options: {
        filter: tagFilter,
        searchQuery: deferredSearchQuery,
        page: currentPage,
        pageSize
      } } })

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      setTags(result.data ?? [])
      setTotal(result.total)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tags")
      setLoading(false)
    }
  }, [currentSite?.id, currentPage, deferredSearchQuery, pageSize, siteLoading, tagFilter])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  const sortedTags = [...tags].sort((a, b) => {
    if (!tagSort.sortColumn) return 0
    const dir = tagSort.sortDirection === "asc" ? 1 : -1
    if (tagSort.sortColumn === "tag") return a.tag.localeCompare(b.tag) * dir
    if (tagSort.sortColumn === "contacts") return (a.contact_count - b.contact_count) * dir
    if (tagSort.sortColumn === "lastUsed") {
      const aTime = a.last_used_at ? new Date(a.last_used_at).getTime() : 0
      const bTime = b.last_used_at ? new Date(b.last_used_at).getTime() : 0
      return (aTime - bTime) * dir
    }
    return 0
  })
  const tagIds = sortedTags.map((tag) => tag.id)
  const hasSearchQuery = deferredSearchQuery.trim().length > 0

  const openRenameModal = (tag: NewsletterContactTag) => {
    setRenamingTag(tag)
    setRenameValue(tag.tag)
  }

  const handleRename = async (event: FormEvent) => {
    event.preventDefault()
    if (!currentSite?.id || !renamingTag) return
    if (!renameValue.trim()) {
      setRenameInvalid(true)
      showErrorToast("Tag name is required")
      return
    }

    setRenameInvalid(false)
    dismissErrorToast()
    setRenaming(true)

    try {
      const { error: renameError } = await renameNewsletterContactTag({ data: { siteId: currentSite.id, fromTag: renamingTag.id, toTag: renameValue } })
      if (renameError) {
        showErrorToast(renameError)
        return
      }
      setRenamingTag(null)
      tagSelection.clearSelection()
      loadTags()
      showActionSuccess("Tag renamed.")
    } catch {
      showErrorToast("Failed to rename tag")
    } finally {
      setRenaming(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (!currentSite?.id || !tagSelection.selectedCount) return
    const deletedCount = tagSelection.selectedCount
    setDeleting(true)

    try {
      const { error: deleteError } = await deleteNewsletterContactTags({ data: { siteId: currentSite.id, tags: Array.from(tagSelection.selectedIds) } })
      if (deleteError) {
        setErrorMessage(deleteError)
        return
      }
      tagSelection.clearSelection()
      loadTags()
      setDeleteConfirmOpen(false)
      showActionSuccess(deletedCount === 1 ? "Tag deleted." : "Tags deleted.")
    } catch {
      setErrorMessage("Failed to delete tags")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Newsletters", href: "/admin/newsletters" }, { label: "Tags" }]}
          />

          <AdminTableShell
            error={error ? { message: error, onRetry: () => loadTags() } : null}
            title="Tags"
            icon={<Tag className="text-muted-foreground" />}
            count={tags.length}
            loading={loading}
            selectedCount={tagSelection.selectedCount}
            onClearSelection={tagSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={deleting}
                onClick={() => setDeleteConfirmOpen(true)}
                selectedCount={tagSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Search tags"
                />
                <Select
                  value={tagFilter}
                  onValueChange={(value) => {
                    setTagFilter(value as NewsletterContactTagFilter)
                    setCurrentPage(1)
                  }}
                >
                  <TableRightActionsSelectTrigger aria-label="Tag filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="empty">Empty Tags</SelectItem>
                  </SelectContent>
                </Select>
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
                        checked={tagSelection.isPageSelected(tagIds)}
                        onCheckedChange={() => tagSelection.togglePage(tagIds)}
                        aria-label="Select all tags"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={tagSort.sortColumn === "tag"}
                        direction={tagSort.sortDirection}
                        onClick={() => tagSort.toggleSort("tag")}
                      >
                        Tag
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={tagSort.sortColumn === "contacts"}
                        direction={tagSort.sortDirection}
                        onClick={() => tagSort.toggleSort("contacts")}
                      >
                        Contacts
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={tagSort.sortColumn === "lastUsed"}
                        direction={tagSort.sortDirection}
                        onClick={() => tagSort.toggleSort("lastUsed")}
                      >
                        Last Used
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && sortedTags.length === 0 ? (
                    <AdminListPending />
                  ) : tags.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <Tag className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">
                          {hasSearchQuery
                            ? "No tags found matching your search."
                            : tagFilter === "empty" ? "No empty tags" : "No contact tags yet"}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTags.map((tag) => (
                      <TableRow
                        key={tag.id}
                        data-state={tagSelection.selectedIds.has(tag.id) ? "selected" : undefined}
                        className="group"
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={tagSelection.selectedIds.has(tag.id)}
                            onCheckedChange={() => tagSelection.toggleOne(tag.id)}
                            aria-label={`Select ${tag.tag}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <h4 className="truncate text-sm font-medium sm:text-base" title={tag.tag}>{tag.tag}</h4>
                        </TableCell>
                        <TableCell column="mutedMeta">{tag.contact_count.toLocaleString()}</TableCell>
                        <TableCell column="mutedMeta">{formatDate(tag.last_used_at)}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openRenameModal(tag)}
                              title="Rename Tag"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="sr-only">Rename Tag</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              onClick={() => {
                                tagSelection.selectOnly([tag.id])
                                setDeleteConfirmOpen(true)
                              }}
                              title="Delete Tag"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete Tag</span>
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
      </AdminLayout>

      <Dialog open={renamingTag !== null} onOpenChange={(open) => { if (!open) setRenamingTag(null) }}>
                  <DashboardModalContent
            busy={renaming}
            title="Rename Tag"
            description={
              renamingTag ? (
                <>Rename <span className="text-muted-foreground">{renamingTag.tag}</span> across matching contacts.</>
              ) : "Rename this tag across matching contacts."
            }
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => setRenamingTag(null)} disabled={renaming}>
                  Cancel
                </Button>
                <Button type="submit" form="rename-tag-form" disabled={renaming}>
                  {renaming ? <Loader2 className="size-4 animate-spin" /> : null}
                  Rename Tag
                </Button>
              </>
            }
          >
            <form
              noValidate id="rename-tag-form" onSubmit={handleRename} className="contents">
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Tag details</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="tag-name">Tag name</FieldLabel>
                    <Input
                      id="tag-name"
                      value={renameValue}
                      aria-invalid={renameInvalid}
                      onChange={(event) => {
                        setRenameValue(event.target.value)
                        if (renameInvalid && event.target.value.trim()) setRenameInvalid(false)
                      }}
                      autoFocus
                    />
                    <FieldDescription>Renaming into an existing tag merges the two tags.</FieldDescription>
                  </Field>
                </CardContent>
              </Card>
            </CardGroup>
            </form>
          </DashboardModalContent>

      </Dialog>

      <ConfirmDestructive
        action="delete-tag"
        open={deleteConfirmOpen}
        title={`Delete ${tagSelection.selectedCount} Tag${tagSelection.selectedCount !== 1 ? "s" : ""}`}
        description={`Delete ${tagSelection.selectedCount} tag${tagSelection.selectedCount !== 1 ? "s" : ""} and remove them from matching contacts. Contacts will not be deleted.`}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        disabled={deleting}
        error={errorMessage || null}
        onCancel={() => { setDeleteConfirmOpen(false); setErrorMessage("") }}
        onConfirm={handleDeleteSelected}
      />
    </>
  )
}
