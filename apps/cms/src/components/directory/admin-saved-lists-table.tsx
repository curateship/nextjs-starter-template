import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  BookmarkIcon,
  ExternalLinkIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  adminDeleteSavedLists,
  adminRemoveSavedItem,
  adminRenameSavedList,
  adminSetSavedListPublic,
  getSaveErrorMessage,
  loadAdminSavedList,
  type AdminSavedCollection,
  type AdminSavedCollectionSummary,
  type SavedListsSearch,
} from "@/lib/api/directory/saves"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"
type SavedListsPage = {
  collections: AdminSavedCollectionSummary[]
  total: number
  page: number
  pageSize: number
}

export function AdminSavedListsTable({
  data,
  search,
}: {
  data: SavedListsPage
  search: SavedListsSearch
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const sort = search.sort ?? "name"
  const direction = search.direction ?? "asc"
  const toggleSort = useListSort({ sort, direction })
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getSaveErrorMessage)
  const [loadedEditor, setLoadedEditor] = React.useState<{
    id: string
    collection: AdminSavedCollection
  } | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<
    AdminSavedCollectionSummary[]
  >([])

  const setOpen = React.useCallback(
    (id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )

  React.useEffect(() => {
    let current = true
    if (!search.open || loadedEditor?.id === search.open) return
    void run(async () => {
      const collection = await loadAdminSavedList(search.open!)
      if (current) setLoadedEditor({ id: search.open!, collection })
    }).then((loaded) => {
      if (!loaded && current) setOpen(undefined)
    })
    return () => {
      current = false
    }
  }, [loadedEditor?.id, run, search.open, setOpen])

  const editing =
    search.open && loadedEditor?.id === search.open
      ? loadedEditor.collection
      : null

  const listKey = `${search.q ?? ""}|${sort}|${direction}|${data.page}|${data.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)

  const visibleIds = React.useMemo(
    () => data.collections.map((row) => row.id),
    [data.collections]
  )
  const selectedRows = data.collections.filter((row) =>
    selection.selected.has(row.id)
  )
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <DashboardTable
        title="Saved lists"
        icon={<BookmarkIcon className="text-muted-foreground" />}
        count={data.total}
        busy={busy}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedRows.length ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setDeleteTargets(selectedRows)}
              >
                <Trash2Icon /> Delete ({selectedRows.length})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="saved-list-search"
              aria-label="Search saved lists"
              placeholder="Search lists or owners…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  disabled={visibleIds.length === 0}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select visible saved lists"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                >
                  List
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "owner"}
                  direction={direction}
                  onClick={() => toggleSort("owner")}
                >
                  Owner
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "visibility"}
                  direction={direction}
                  onClick={() => toggleSort("visibility")}
                >
                  Visibility
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "listings"}
                  direction={direction}
                  onClick={() => toggleSort("listings")}
                >
                  Listings
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.collections.length === 0}
        emptyText={
          search.q
            ? "No saved lists match that search."
            : "Nobody has made a saved list on this site yet."
        }
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages,
          onPageChange: (page) =>
            setListSearch({ page: page > 1 ? page : undefined }),
          onPageSizeChange: (pageSize) =>
            setListSearch({ size: pageSize, page: undefined }),
        }}
      >
        {data.collections.map((collection) => (
          <TableRow
            key={collection.id}
            className="group"
            rowAction={() => setOpen(collection.id)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(collection.id)}
                onCheckedChange={() => selection.toggle(collection.id)}
                aria-label={`Select ${collection.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left font-medium group-hover:underline"
                onClick={() => setOpen(collection.id)}
              >
                {collection.name}
              </button>
            </TableCell>
            <TableCell column="meta" className="max-w-64">
              <span className="block truncate font-medium">
                {collection.ownerName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {collection.ownerEmail}
              </span>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-2">
                <Switch
                  checked={collection.isPublic}
                  disabled={busy}
                  aria-label={`Public visibility for ${collection.name}`}
                  onCheckedChange={(isPublic) =>
                    void run(
                      async () => {
                        await adminSetSavedListPublic(collection.id, isPublic)
                        await router.invalidate()
                      },
                      isPublic
                        ? "Saved list is public."
                        : "Saved list is private."
                    )
                  }
                />
                <Badge variant={collection.isPublic ? "secondary" : "outline"}>
                  {collection.isPublic ? "Public" : "Private"}
                </Badge>
              </div>
            </TableCell>
            <TableCell column="meta">{collection.itemCount}</TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`Edit ${collection.name}`}
                  onClick={() => setOpen(collection.id)}
                >
                  <SettingsIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`Delete ${collection.name}`}
                  onClick={() => setDeleteTargets([collection])}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <AdminSavedListDialog
        key={editing?.id ?? "closed"}
        collection={editing}
        busy={busy}
        onClose={() => setOpen(undefined)}
        onRename={async (name) => {
          if (!editing) return false
          const saved = await run(async () => {
            await adminRenameSavedList(editing.id, name)
            await router.invalidate()
          }, "Saved list renamed.")
          if (saved) setOpen(undefined)
          return saved
        }}
        onRemove={async (listingId) => {
          if (!editing) return
          await run(async () => {
            await adminRemoveSavedItem(editing.id, listingId)
            setLoadedEditor((current) =>
              current?.id === editing.id
                ? {
                    ...current,
                    collection: {
                      ...current.collection,
                      items: current.collection.items.filter(
                        (item) => item.id !== listingId
                      ),
                    },
                  }
                : current
            )
            await router.invalidate()
          }, "Listing removed.")
        }}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets([])
        }}
        title={
          deleteTargets.length === 1
            ? "Delete this saved list?"
            : `Delete ${deleteTargets.length} saved lists?`
        }
        description="The selected lists and everything saved in them will be removed. The listings themselves are not changed."
        confirmLabel={
          deleteTargets.length === 1
            ? "Delete saved list"
            : "Delete saved lists"
        }
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            const ids = deleteTargets.map((row) => row.id)
            const result = await adminDeleteSavedLists(ids)
            const deleted = new Set(result.deleted)
            const skipped = ids.filter((id) => !deleted.has(id))
            selection.setSelected(new Set(skipped))
            setDeleteTargets([])
            const remainingTotal = Math.max(
              0,
              data.total - result.deleted.length
            )
            const lastPage = Math.max(
              1,
              Math.ceil(remainingTotal / data.pageSize)
            )
            if (data.page > lastPage) {
              setListSearch({ page: lastPage > 1 ? lastPage : undefined })
            } else {
              await router.invalidate()
            }
            toast.success(
              skipped.length
                ? `${result.deleted.length} deleted, ${skipped.length} skipped.`
                : `${result.deleted.length} ${result.deleted.length === 1 ? "list" : "lists"} deleted.`
            )
          })
        }
      />
    </>
  )
}

function AdminSavedListDialog({
  collection,
  busy,
  onClose,
  onRename,
  onRemove,
}: {
  collection: AdminSavedCollection | null
  busy: boolean
  onClose: () => void
  onRename: (name: string) => Promise<boolean>
  onRemove: (listingId: string) => Promise<void>
}) {
  const [name, setName] = React.useState(collection?.name ?? "")
  const [attempted, setAttempted] = React.useState(false)
  const valid = Boolean(name.trim())

  return (
    <FormDialog
      open={Boolean(collection)}
      dirty={name !== (collection?.name ?? "")}
      busy={busy}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit saved list</DialogTitle>
            <DialogDescription>
              {collection?.ownerName} · {collection?.ownerEmail}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>List details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="admin-saved-list-name">Name</FieldLabel>
                  <Input
                    id="admin-saved-list-name"
                    value={name}
                    maxLength={80}
                    disabled={busy}
                    aria-invalid={attempted && !valid}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                {collection?.isPublic ? (
                  <Button asChild variant="outline" className="w-fit">
                    <a
                      href={collection.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLinkIcon /> View public profile
                    </a>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Listings</CardTitle>
              </CardHeader>
              <CardContent>
                {collection?.items.length ? (
                  <ul className="divide-y">
                    {collection.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex min-h-12 items-center gap-3 py-2"
                      >
                        <BookmarkIcon className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {item.title}
                          </p>
                          {item.address ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {item.address}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          aria-label={`Remove ${item.title}`}
                          onClick={() => void onRemove(item.id)}
                        >
                          <Trash2Icon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-sm text-muted-foreground">
                    This saved list is empty.
                  </p>
                )}
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setAttempted(true)
                if (!valid) {
                  showErrorToast("Give the saved list a name.")
                  return
                }
                void onRename(name.trim())
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
