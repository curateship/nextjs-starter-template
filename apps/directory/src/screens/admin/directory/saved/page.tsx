"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "@/components/app-link"
import Bookmark from "lucide-react/dist/esm/icons/bookmark.js"
import FolderOpen from "lucide-react/dist/esm/icons/folder-open.js"
import Pencil from "lucide-react/dist/esm/icons/pencil.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import {
  AdminListFooter,
  AdminListPending,
  AdminSortableHead,
  AdminSortButton,
  AdminTableShell,
  ConfirmDestructive,
  RelativeDate,
  formatExactDateTime,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"
import {
  getDirectorySaveFoldersDashboardAction,
  removeDirectorySaveCollectionsDashboardAction,
  renameDirectorySaveCollectionDashboardAction,
  updateDirectorySaveDefaultCollectionsAction,
  type DirectorySaveDashboardFolder,
  type DirectorySaveFolderTypeFilter
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
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type FolderSortColumn = "name" | "owner" | "type" | "saved" | "activity"

function folderActivity(folder: DirectorySaveDashboardFolder) {
  return folder.last_saved_at || folder.updated_at || folder.created_at
}

export default function DirectorySavedPage() {
  const { currentSite, loading: siteLoading, pageSize, setCurrentSite } = useSiteSwitcher()
  const [folders, setFolders] = useState<DirectorySaveDashboardFolder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<DirectorySaveFolderTypeFilter>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [savedLabel, setSavedLabel] = useState("Saved")
  const [wantToGoLabel, setWantToGoLabel] = useState("Want to go")
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [folderToRename, setFolderToRename] = useState<DirectorySaveDashboardFolder | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [savingRename, setSavingRename] = useState(false)
  const [removeIds, setRemoveIds] = useState<string[]>([])
  const [removing, setRemoving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const selection = useAdminBulkSelection()
  const folderSort = useAdminSort<FolderSortColumn>("activity", "desc")
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSite?.id}|${query}|${typeFilter}|${folderSort.sortColumn}|${folderSort.sortDirection}`
  // Searching, filtering or re-sorting from a later page would otherwise
  // land you past the end of the shorter result.
  useResetPageOnListChange(setCurrentPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page
  // and rows-per-page included, so a bulk action only ever means rows on
  // screen.
  useClearSelectionOnListChange(selection, `${listQueryKey}|${currentPage}|${pageSize}`)


  const loadFolders = useCallback(async () => {
    if (!currentSite?.id) {
      setFolders([])
      setTotal(0)
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    const result = await getDirectorySaveFoldersDashboardAction({ data: { input: {
      siteId: currentSite.id,
      page: currentPage,
      pageSize,
      query,
      type: typeFilter
    } } })
    setLoading(false)

    if (result.error) {
      setFolders([])
      setTotal(0)
      showErrorToast(result.error)
      return
    }

    setFolders(result.data)
    setTotal(result.total)
    setSavedLabel(result.defaults.find((item) => item.key === "saved")?.label || "Saved")
    setWantToGoLabel(result.defaults.find((item) => item.key === "want_to_go")?.label || "Want to go")
  }, [currentPage, currentSite?.id, pageSize, query, siteLoading, typeFilter])

  useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => {
      const dir = folderSort.sortDirection === "asc" ? 1 : -1
      if (folderSort.sortColumn === "name") return a.name.localeCompare(b.name) * dir
      if (folderSort.sortColumn === "owner") return a.owner_email.localeCompare(b.owner_email) * dir
      if (folderSort.sortColumn === "type") {
        return (Number(Boolean(a.default_key)) - Number(Boolean(b.default_key))) * dir
      }
      if (folderSort.sortColumn === "saved") return (a.item_count - b.item_count) * dir
      return (new Date(folderActivity(a)).getTime() - new Date(folderActivity(b)).getTime()) * dir
    })
  }, [folderSort.sortColumn, folderSort.sortDirection, folders])

  const visibleIds = sortedFolders.map((folder) => folder.id)
  const foldersToRemove = folders.filter((folder) => removeIds.includes(folder.id))
  const removeDescription = foldersToRemove.some((folder) => folder.default_key)
    ? "Custom folders will be deleted. Default folders will stay in place, but their saved listings will be cleared."
    : "Custom folders and their saved listings will be deleted."

  const openRename = (folder: DirectorySaveDashboardFolder) => {
    setFolderToRename(folder)
    setRenameValue(folder.name)
  }

  const saveRename = async () => {
    if (!currentSite?.id || !folderToRename) return

    dismissErrorToast()
    setSavingRename(true)
    const result = await renameDirectorySaveCollectionDashboardAction({ data: { input: {
      siteId: currentSite.id,
      collectionId: folderToRename.id,
      name: renameValue
    } } })
    setSavingRename(false)

    if (result.error) {
      showErrorToast(result.error)
      return
    }

    setFolderToRename(null)
    await loadFolders()
    showActionSuccess("Folder renamed.")
  }

  const saveDefaults = async () => {
    if (!currentSite?.id) return

    dismissErrorToast()
    setSavingDefaults(true)
    const result = await updateDirectorySaveDefaultCollectionsAction({ data: { input: {
      siteId: currentSite.id,
      savedLabel,
      wantToGoLabel
    } } })
    setSavingDefaults(false)

    if (result.error) {
      showErrorToast(result.error)
      return
    }

    setCurrentSite({
      ...currentSite,
      settings: {
        ...currentSite.settings,
        directory_save_default_collections: result.defaults
      }
    })
    setDefaultsOpen(false)
    await loadFolders()
    showActionSuccess("Default folders updated.")
  }

  const confirmRemove = async () => {
    if (!currentSite?.id || removeIds.length === 0) return

    const removedCount = removeIds.length
    setRemoving(true)
    const result = await removeDirectorySaveCollectionsDashboardAction({ data: { input: {
      siteId: currentSite.id,
      collectionIds: removeIds
    } } })
    setRemoving(false)

    if (result.error) {
      setErrorMessage(result.error)
      return
    }

    selection.clearSelection()
    setRemoveIds([])
    await loadFolders()
    showActionSuccess(removedCount === 1 ? "Folder removed." : "Folders removed.")
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Directory", href: "/admin/directory" }, { label: "Saved" }]} />

          <AdminTableShell
            title="Saved Folders"
            icon={<Bookmark className="text-muted-foreground" />}
            count={total}
            loading={loading}
            selectedCount={selection.selectedCount}
            onClearSelection={selection.clearSelection}
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
                  placeholder="Search saved folders"
                />
                <Select
                  value={typeFilter}
                  onValueChange={(value) => {
                    setTypeFilter(value as DirectorySaveFolderTypeFilter)
                    setCurrentPage(1)
                  }}
                >
                  <TableRightActionsSelectTrigger aria-label="Folder type filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All folders</SelectItem>
                    <SelectItem value="default">Default folders</SelectItem>
                    <SelectItem value="custom">Custom folders</SelectItem>
                  </SelectContent>
                </Select>
                <TableRightActionsButton type="button" variant="outline" onClick={() => setDefaultsOpen(true)}>
                  <Settings className="size-4" />
                  Default Folders
                </TableRightActionsButton>
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
                        aria-label="Select saved folders"
                      />
                    </TableHead>
                    <AdminSortableHead column="main" sort={folderSort} sortKey="name">Folder</AdminSortableHead>
                    <AdminSortableHead column="content" sort={folderSort} sortKey="owner">Owner</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={folderSort} sortKey="type">Type</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={folderSort} sortKey="saved">Saved</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={folderSort} sortKey="activity">Activity</AdminSortableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && sortedFolders.length === 0 ? (
                    <AdminListPending />
                  ) : folders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Bookmark className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">{query.trim() || typeFilter !== "all" ? "No saved folders found matching your search." : "No saved folders found."}</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedFolders.map((folder) => (
                      <TableRow key={folder.id} data-state={selection.selectedIds.has(folder.id) ? "selected" : undefined}>
                        <TableCell column="select">
                          <Checkbox
                            checked={selection.selectedIds.has(folder.id)}
                            onCheckedChange={() => selection.toggleOne(folder.id)}
                            aria-label={`Select ${folder.name}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <Link href={`/admin/directory/saved/${folder.id}`} className="flex min-w-0 items-center gap-3 hover:opacity-80">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10">
                              <FolderOpen className="h-5 w-5 text-primary" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium hover:underline" title={folder.name}>{folder.name}</span>
                              <span className="block truncate text-sm text-muted-foreground" title={`Created ${formatExactDateTime(folder.created_at)}`}>
                                Created {formatRelativeDate(folder.created_at)}
                              </span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm" title={folder.owner_name}>{folder.owner_name}</div>
                          <div className="truncate text-sm text-muted-foreground" title={folder.owner_email}>{folder.owner_email}</div>
                        </TableCell>
                        <TableCell column="meta">
                          {folder.default_key ? <Badge variant="secondary">Default</Badge> : <Badge>Custom</Badge>}
                        </TableCell>
                        <TableCell column="mutedMeta">{folder.item_count}</TableCell>
                        <TableCell column="mutedMeta"><RelativeDate date={folderActivity(folder)} /></TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openRename(folder)}
                              disabled={Boolean(folder.default_key)}
                              title={folder.default_key ? "Use Default Folders to rename this label" : "Rename folder"}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Rename</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              onClick={() => setRemoveIds([folder.id])}
                              title={folder.default_key ? "Clear folder" : "Delete folder"}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">{folder.default_key ? "Clear" : "Delete"}</span>
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

      <Dialog open={defaultsOpen} onOpenChange={setDefaultsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Default Folders</DialogTitle>
            <DialogDescription>Rename the default folders shown in directory save menus.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="saved-folder-label">Saved Folder Label</Label>
              <Input
                id="saved-folder-label"
                value={savedLabel}
                maxLength={80}
                onChange={(event) => setSavedLabel(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="want-to-go-folder-label">Want to go Folder Label</Label>
              <Input
                id="want-to-go-folder-label"
                value={wantToGoLabel}
                maxLength={80}
                onChange={(event) => setWantToGoLabel(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefaultsOpen(false)} disabled={savingDefaults}>Cancel</Button>
            <Button onClick={saveDefaults} disabled={savingDefaults}>
              {savingDefaults ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(folderToRename)} onOpenChange={(open) => !open && setFolderToRename(null)}>
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
            <Button variant="outline" onClick={() => setFolderToRename(null)} disabled={savingRename}>Cancel</Button>
            <Button onClick={saveRename} disabled={savingRename}>
              {savingRename ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructive
        action="delete-saved-collection"
        open={removeIds.length > 0}
        title={`Remove ${removeIds.length === 1 ? "Folder" : "Folders"}`}
        description={removeDescription}
        disabled={removing}
        error={errorMessage || null}
        impactRequest={currentSite?.id
          ? { ids: removeIds, siteId: currentSite.id, target: "saved-collection" }
          : undefined}
        confirmLabel={removing ? "Removing..." : "Remove"}
        onCancel={() => { setRemoveIds([]); setErrorMessage("") }}
        onConfirm={confirmRemove}
      />
    </>
  )
}
