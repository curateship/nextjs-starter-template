"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "@/components/app-link"
import Bookmark from "lucide-react/dist/esm/icons/bookmark.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import FolderOpen from "lucide-react/dist/esm/icons/folder-open.js"
import Pencil from "lucide-react/dist/esm/icons/pencil.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import {
  ConfirmDestructive,
  AdminListFooter,
  AdminTableShell, AdminListPending,
  formatShortDate as formatDate,
  useAdminBulkSelection
} from "@/components/admin/layout/list"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"
import {
  getDirectorySaveFolderItemsDashboardAction,
  removeDirectorySaveItemsDashboardAction,
  renameDirectorySaveCollectionDashboardAction,
  type DirectorySaveDashboardCollection,
  type DirectorySaveDashboardItem
} from "@/lib/actions/directories/directory-save-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function DirectorySavedFolderPage({
  params
}: {
  params: Promise<{ collectionId: string }>
}) {
  const { collectionId } = use(params)
  const { currentSite, loading: siteLoading, pageSize } = useSiteSwitcher()
  const [collection, setCollection] = useState<DirectorySaveDashboardCollection | null>(null)
  const [items, setItems] = useState<DirectorySaveDashboardItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [removeIds, setRemoveIds] = useState<string[]>([])
  const [removing, setRemoving] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [savingRename, setSavingRename] = useState(false)
  const selection = useAdminBulkSelection()
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSite?.id}|${collectionId}|${query}`
  // Searching, filtering or re-sorting from a later page would otherwise
  // land you past the end of the shorter result.
  useResetPageOnListChange(setCurrentPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page
  // and rows-per-page included, so a bulk action only ever means rows on
  // screen.
  useClearSelectionOnListChange(selection, `${listQueryKey}|${currentPage}|${pageSize}`)


  const loadItems = useCallback(async () => {
    if (!currentSite?.id) {
      setCollection(null)
      setItems([])
      setTotal(0)
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    const result = await getDirectorySaveFolderItemsDashboardAction({ data: { input: {
      siteId: currentSite.id,
      collectionId,
      page: currentPage,
      pageSize,
      query
    } } })
    setLoading(false)

    if (result.error) {
      setCollection(result.collection)
      setItems([])
      setTotal(0)
      showErrorToast(result.error)
      return
    }

    setCollection(result.collection)
    setItems(result.data)
    setTotal(result.total)
    setRenameValue(result.collection?.name || "")
  }, [collectionId, currentPage, currentSite?.id, pageSize, query, siteLoading])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const visibleIds = items.map((item) => item.id)

  const saveRename = async () => {
    if (!currentSite?.id || !collection) return

    dismissErrorToast()
    setSavingRename(true)
    const result = await renameDirectorySaveCollectionDashboardAction({ data: { input: {
      siteId: currentSite.id,
      collectionId: collection.id,
      name: renameValue
    } } })
    setSavingRename(false)

    if (result.error) {
      showErrorToast(result.error)
      return
    }

    setRenameOpen(false)
    await loadItems()
    showActionSuccess("Folder renamed.")
  }

  const confirmRemove = async () => {
    if (!currentSite?.id || removeIds.length === 0) return

    dismissErrorToast()
    const removedCount = removeIds.length
    setRemoving(true)
    const result = await removeDirectorySaveItemsDashboardAction({ data: { input: {
      siteId: currentSite.id,
      itemIds: removeIds
    } } })
    setRemoving(false)

    if (result.error) {
      showErrorToast(result.error)
      return
    }

    selection.clearSelection()
    setRemoveIds([])
    await loadItems()
    showActionSuccess(removedCount === 1 ? "Saved listing removed." : "Saved listings removed.")
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              { label: "Directory", href: "/admin/directory" },
              { label: "Saved", href: "/admin/directory/saved" },
              { label: collection?.name || "Folder" }
            ]}
          />

          <AdminTableShell
            title={collection?.name || "Saved Folder"}
            icon={<Bookmark className="text-muted-foreground" />}
            count={total}
            loading={loading}
            selectedCount={selection.selectedCount}
            onClearSelection={selection.clearSelection}
            titleMeta={collection ? (
              <Badge variant="secondary">{collection.default_key ? "Default" : "Custom"}</Badge>
            ) : null}
            titleActions={selection.selectedCount ? (
              <TableRightActionsButton
                type="button"
                variant="destructive"
                onClick={() => setRemoveIds(Array.from(selection.selectedIds))}
                disabled={removing}
              >
                <Trash2 className="size-4" />
                Remove ({selection.selectedCount})
              </TableRightActionsButton>
            ) : null}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Search saved listings"
                />
                {collection && !collection.default_key ? (
                  <TableRightActionsButton type="button" variant="outline" onClick={() => setRenameOpen(true)}>
                    <Pencil className="size-4" />
                    Rename
                  </TableRightActionsButton>
                ) : null}
              </TableRightActions>
            }
            footer={!loading ? (
              <AdminListFooter
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                total={total}
              />
            ) : null}
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={selection.isPageSelected(visibleIds)}
                        onCheckedChange={() => selection.togglePage(visibleIds)}
                        aria-label="Select saved listings"
                      />
                    </TableHead>
                    <TableHead column="main">Listing</TableHead>
                    <TableHead column="meta">Status</TableHead>
                    <TableHead column="meta">Saved</TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && items.length === 0 ? (
                    <AdminListPending />
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <FolderOpen className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">{query.trim() ? "No saved listings found matching your search." : "No saved listings found."}</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => (
                      <TableRow key={item.id} data-state={selection.selectedIds.has(item.id) ? "selected" : undefined}>
                        <TableCell column="select">
                          <Checkbox
                            checked={selection.selectedIds.has(item.id)}
                            onCheckedChange={() => selection.toggleOne(item.id)}
                            aria-label={`Select ${item.directory_title}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <Link href={`/directory/${item.directory_slug}`} className="flex min-w-0 items-center gap-3 hover:opacity-80">
                            {item.directory_featured_image ? (
                              <img
                                src={item.directory_featured_image}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded bg-muted object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10">
                                <FolderOpen className="h-5 w-5 text-primary" />
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-medium hover:underline" title={item.directory_title}>{item.directory_title}</span>
                              <span className="block truncate text-sm text-muted-foreground" title={`/directory/${item.directory_slug}`}>/directory/{item.directory_slug}</span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell column="meta">
                          {item.directory_status === "published" ? <Badge>Published</Badge> : <Badge variant="secondary">Draft</Badge>}
                        </TableCell>
                        <TableCell column="mutedMeta">{formatDate(item.saved_at)}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                              <a href={`/directory/${item.directory_slug}`} target="_blank" rel="noopener noreferrer" title="View listing">
                                <ExternalLink className="h-4 w-4" />
                                <span className="sr-only">View Listing</span>
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              onClick={() => setRemoveIds([item.id])}
                              title="Remove saved listing"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Remove</span>
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

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>Change this user-created save folder name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              value={renameValue}
              maxLength={80}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={savingRename}>Cancel</Button>
            <Button onClick={saveRename} disabled={savingRename}>
              {savingRename ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructive
        action="remove-saved-listing"
        open={removeIds.length > 0}
        title={`Remove ${removeIds.length === 1 ? "Saved Listing" : "Saved Listings"}`}
        description="Remove the selected listings from this folder."
        disabled={removing}
        confirmLabel={removing ? "Removing..." : "Remove"}
        onCancel={() => setRemoveIds([])}
        onConfirm={confirmRemove}
      />
    </>
  )
}
