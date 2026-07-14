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
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Settings, Tag, Trash2 } from "lucide-react"
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
  const [renaming, setRenaming] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const pageSize = contextPageSize
  const tagSelection = useAdminBulkSelection()
  const clearTagSelection = tagSelection.clearSelection
  const tagSort = useAdminSort<TagSortColumn>("tag", "asc")

  useEffect(() => {
    clearTagSelection()
  }, [clearTagSelection, currentSite?.id, siteLoading])

  const showError = (message: string) => {
    setErrorMessage(message)
    setErrorDialogOpen(true)
  }

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
      const result = await getNewsletterContactTags(currentSite.id, {
        filter: tagFilter,
        searchQuery: deferredSearchQuery,
        page: currentPage,
        pageSize
      })

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
    setRenaming(true)

    try {
      const { error: renameError } = await renameNewsletterContactTag(currentSite.id, renamingTag.id, renameValue)
      if (renameError) {
        showError(renameError)
        return
      }
      setRenamingTag(null)
      tagSelection.clearSelection()
      loadTags()
    } catch {
      showError("Failed to rename tag")
    } finally {
      setRenaming(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (!currentSite?.id || !tagSelection.selectedCount) return
    setDeleting(true)

    try {
      const { error: deleteError } = await deleteNewsletterContactTags(
        currentSite.id,
        Array.from(tagSelection.selectedIds)
      )
      if (deleteError) {
        setErrorMessage(deleteError)
        return
      }
      tagSelection.clearSelection()
      loadTags()
      setDeleteConfirmOpen(false)
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
            title="Tags"
            icon={<Tag className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={tags.length}
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
                    tagSelection.clearSelection()
                  }}
                  placeholder="Search tags"
                />
                <Select
                  value={tagFilter}
                  onValueChange={(value) => {
                    setTagFilter(value as NewsletterContactTagFilter)
                    setCurrentPage(1)
                    tagSelection.clearSelection()
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
                  onPageChange={(page) => {
                    setCurrentPage(page)
                    tagSelection.clearSelection()
                  }}
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
                  {loading ? (
                    <AdminListSkeleton columns={5} rowCount={5} showThumbnail={false} actionCount={2} />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={() => loadTags()} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : tags.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <Tag className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">
                          {tagFilter === "empty"
                            ? hasSearchQuery ? "No empty tags match this search" : "No empty tags"
                            : hasSearchQuery ? "No tags match this search" : "No contact tags yet"}
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
                          <h4 className="truncate text-sm font-medium sm:text-base">{tag.tag}</h4>
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
        <form id="rename-tag-form" onSubmit={handleRename} className="contents">
          <DashboardModalContent
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
                <Button type="submit" form="rename-tag-form" disabled={renaming || !renameValue.trim()}>
                  {renaming ? "Renaming..." : "Rename Tag"}
                </Button>
              </>
            }
          >
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
                      onChange={(event) => setRenameValue(event.target.value)}
                      autoFocus
                    />
                    <FieldDescription>Renaming into an existing tag merges the two tags.</FieldDescription>
                  </Field>
                </CardContent>
              </Card>
            </CardGroup>
          </DashboardModalContent>
        </form>
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

      <AdminErrorDialog open={errorDialogOpen} message={errorMessage} onOpenChange={setErrorDialogOpen} />
    </>
  )
}
