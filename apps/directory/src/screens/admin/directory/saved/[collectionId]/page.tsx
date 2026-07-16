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
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import {
  ConfirmDestructive,
  AdminErrorDialog,
  AdminListFooter,
  AdminTableShell, AdminListPending,
  formatShortDate as formatDate,
  useAdminBulkSelection
} from "@/components/admin/layout/list"
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
  const [errorMessage, setErrorMessage] = useState("")
  const selection = useAdminBulkSelection()

  const loadItems = useCallback(async () => {
    if (!currentSite?.id) {
      setCollection(null)
      setItems([])
      setTotal(0)
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    const result = await getDirectorySaveFolderItemsDashboardAction({
      siteId: currentSite.id,
      collectionId,
      page: currentPage,
      pageSize,
      query
    })
    setLoading(false)

    if (result.error) {
      setCollection(result.collection)
      setItems([])
      setTotal(0)
      setErrorMessage(result.error)
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

    setSavingRename(true)
    const result = await renameDirectorySaveCollectionDashboardAction({
      siteId: currentSite.id,
      collectionId: collection.id,
      name: renameValue
    })
    setSavingRename(false)

    if (result.error) {
      setErrorMessage(result.error)
      return
    }

    setRenameOpen(false)
    await loadItems()
  }

  const confirmRemove = async () => {
    if (!currentSite?.id || removeIds.length === 0) return

    setRemoving(true)
    const result = await removeDirectorySaveItemsDashboardAction({
      siteId: currentSite.id,
      itemIds: removeIds
    })
    setRemoving(false)

    if (result.error) {
      setErrorMessage(result.error)
      return
    }

    selection.clearSelection()
    setRemoveIds([])
    await loadItems()
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
            icon={<Bookmark className="size-4 text-muted-foreground sm:size-[18px]" />}
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
                    selection.clearSelection()
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
                        <p className="text-muted-foreground">No saved listings found.</p>
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
                              <span className="block truncate font-medium hover:underline">{item.directory_title}</span>
                              <span className="block truncate text-sm text-muted-foreground">/directory/{item.directory_slug}</span>
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

      <AdminErrorDialog
        open={Boolean(errorMessage)}
        message={errorMessage}
        onOpenChange={(open) => !open && setErrorMessage("")}
      />
    </>
  )
}
