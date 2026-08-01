import * as React from "react"
import {
  EyeIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  createAdminChangelogEntry,
  deleteAdminChangelogEntries,
  getChangelogErrorMessage,
  loadAdminChangelog,
  updateAdminChangelogEntry,
  type ChangelogEntry,
} from "@/lib/api/changelog"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useOpenFromLink } from "@/lib/use-open-from-link"

type ChangelogSortColumn = "title" | "status" | "published"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function compareEntries(
  a: ChangelogEntry,
  b: ChangelogEntry,
  column: ChangelogSortColumn
) {
  switch (column) {
    case "status":
      return Number(Boolean(a.publishedAt)) - Number(Boolean(b.publishedAt))
    case "published":
      // Drafts have no date; keep them together at one end rather than
      // scattered through the published entries.
      return (
        Date.parse(a.publishedAt ?? a.createdAt) -
        Date.parse(b.publishedAt ?? b.createdAt)
      )
    default:
      return a.title.localeCompare(b.title)
  }
}

/**
 * Where updates are written. Reading them is a different page — see
 * `changelog-page.tsx`, which is what a notification opens and what everyone,
 * this admin included, actually sees.
 */
export function ChangelogAdminDashboard({
  initialEntries,
  openId,
}: {
  initialEntries: ChangelogEntry[]
  /** One update named by the link that brought us here. */
  openId?: string
}) {
  const { config } = useShellRuntime()
  const [entries, setEntries] = React.useState(initialEntries)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [sort, setSort] = React.useState<ChangelogSortColumn>("published")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const [editing, setEditing] = React.useState<ChangelogEntry | null>(null)
  const [previewing, setPreviewing] = React.useState<ChangelogEntry | null>(
    null
  )
  const [creating, setCreating] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<ChangelogEntry | null>(
    null
  )
  const [deleting, setDeleting] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  useOpenFromLink({ openId, records: entries, onOpen: setEditing })

  const sortedEntries = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const query = searchQuery.trim().toLowerCase()
    return entries
      .filter(
        (entry) =>
          !query ||
          entry.title.toLowerCase().includes(query) ||
          entry.body.toLowerCase().includes(query)
      )
      .sort((a, b) => factor * compareEntries(a, b, sort))
  }, [direction, entries, searchQuery, sort])

  const totalPages = Math.ceil(sortedEntries.length / pageSize)
  const paginatedEntries = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedEntries.slice(startIndex, startIndex + pageSize)
  }, [currentPage, pageSize, sortedEntries])

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sort, direction, pageSize])

  useClearSelectionOnListChange(
    setSelectedIds,
    `${searchQuery}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  const visibleIds = React.useMemo(
    () => paginatedEntries.map((entry) => entry.id),
    [paginatedEntries]
  )
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someSelected = visibleIds.some((id) => selectedIds.has(id))

  const toggleSelection = React.useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleVisibleSelection = React.useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }, [visibleIds])

  const toggleSort = React.useCallback(
    (column: ChangelogSortColumn) => {
      if (sort === column) {
        setDirection(direction === "asc" ? "desc" : "asc")
        return
      }
      setSort(column)
      setDirection("asc")
    },
    [direction, sort]
  )

  const refresh = React.useCallback(async () => {
    try {
      const data = await loadAdminChangelog()
      // Null means the role changed underneath us. Keep what is on screen and
      // say so, rather than blanking the table as if there were no updates.
      if (!data.entries) {
        setError(getChangelogErrorMessage(new Error("FORBIDDEN")))
        return
      }
      setEntries(data.entries)
      setError(null)
    } catch (loadError) {
      setError(getChangelogErrorMessage(loadError))
    }
  }, [])

  return (
    <>
      <DashboardTable
        title="Changelog"
        icon={<SparklesIcon />}
        count={sortedEntries.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setMassDeleteOpen(true)}
                disabled={massDeleting}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="changelog-search"
              aria-label="Search updates"
              placeholder="Search updates..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              New update
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={toggleVisibleSelection}
                  aria-label="Select updates on this page"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "title"}
                  direction={direction}
                  onClick={() => toggleSort("title")}
                >
                  Update
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "status"}
                  direction={direction}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "published"}
                  direction={direction}
                  onClick={() => toggleSort("published")}
                >
                  Published
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sortedEntries.length === 0}
        emptyText={
          entries.length === 0
            ? "No updates yet. Write the first one."
            : "No updates found matching your search."
        }
        emptyColSpan={5}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sortedEntries.length,
          totalPages,
          onPageChange: (page) =>
            setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))),
          onPageSizeChange: (nextSize) => {
            setCurrentPage(1)
            setPageSize(nextSize)
          },
          pageSizeOptions,
        }}
      >
        {paginatedEntries.map((entry) => (
          <TableRow key={entry.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(entry.id)}
                onCheckedChange={() => toggleSelection(entry.id)}
                aria-label={`Select ${entry.title}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block text-left text-sm font-medium group-hover:underline"
                onClick={() => setEditing(entry)}
              >
                {entry.title}
              </button>
              <span
                className="line-clamp-2 whitespace-normal text-xs text-muted-foreground"
                title={entry.body}
              >
                {entry.body}
              </span>
            </TableCell>
            <TableCell column="meta">
              {entry.publishedAt ? (
                <Badge variant="secondary">Published</Badge>
              ) : (
                <Badge variant="outline">Draft</Badge>
              )}
            </TableCell>
            <TableCell column="meta">
              {entry.publishedAt
                ? dateFormatter.format(new Date(entry.publishedAt))
                : "—"}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setPreviewing(entry)}
                  title="Preview update"
                  aria-label={`Preview ${entry.title}`}
                >
                  <EyeIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(entry)}
                  title="Update settings"
                  aria-label={`Edit ${entry.title}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget(entry)}
                  title="Delete update"
                  aria-label={`Delete ${entry.title}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ChangelogDialog
        key={editing?.id ?? (creating ? "new-entry" : "closed")}
        open={creating || Boolean(editing)}
        entry={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={async () => {
          setCreating(false)
          setEditing(null)
          await refresh()
        }}
      />

      <PreviewDialog
        entry={previewing}
        onClose={() => setPreviewing(null)}
      />

      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? "update" : "updates"}?`}
        description="They disappear from everyone's What's new panel. This cannot be undone."
        confirmLabel="Delete updates"
        loading={massDeleting}
        onConfirm={async () => {
          setMassDeleting(true)
          try {
            await deleteAdminChangelogEntries([...selectedIds])
            toast.success("Updates deleted.")
            setSelectedIds(new Set())
            setMassDeleteOpen(false)
            await refresh()
          } catch (deleteError) {
            showErrorToast(getChangelogErrorMessage(deleteError))
          } finally {
            setMassDeleting(false)
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete this update?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" disappears from everyone's What's new panel. This cannot be undone.`
            : null
        }
        confirmLabel="Delete update"
        loading={deleting}
        onConfirm={async () => {
          const target = deleteTarget
          if (!target) return
          setDeleting(true)
          try {
            await deleteAdminChangelogEntries([target.id])
            toast.success("Update deleted.")
            setDeleteTarget(null)
            await refresh()
          } catch (deleteError) {
            showErrorToast(getChangelogErrorMessage(deleteError))
          } finally {
            setDeleting(false)
          }
        }}
      />
    </>
  )
}

function ChangelogDialog({
  open,
  entry,
  onClose,
  onSaved,
}: {
  open: boolean
  entry: ChangelogEntry | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  // Mounted fresh per entry by its key in the parent, so the draft starts from
  // the right entry without an effect resetting it after the first render.
  const [title, setTitle] = React.useState(entry?.title ?? "")
  const [body, setBody] = React.useState(entry?.body ?? "")
  const [published, setPublished] = React.useState(Boolean(entry?.publishedAt))
  const [saving, setSaving] = React.useState(false)
  // Flagged per field and only when Create/Save is pressed. A new entry opens
  // empty, so complaining as focus passes through a field would tell the writer
  // off before they have had a chance to type in it.
  const [titleInvalid, setTitleInvalid] = React.useState(false)
  const [bodyInvalid, setBodyInvalid] = React.useState(false)

  const handleSave = React.useCallback(async () => {
    dismissErrorToast()

    // The server rejects these too; catching them here keeps the message
    // instant and the entered text untouched.
    const titleMissing = !title.trim()
    const bodyMissing = !body.trim()
    setTitleInvalid(titleMissing)
    setBodyInvalid(bodyMissing)

    if (titleMissing || bodyMissing) {
      showErrorToast(
        getChangelogErrorMessage(
          new Error(
            titleMissing ? "CHANGELOG_TITLE_REQUIRED" : "CHANGELOG_BODY_REQUIRED"
          )
        )
      )
      return
    }

    setSaving(true)
    try {
      if (entry) {
        await updateAdminChangelogEntry(entry.id, { title, body, published })
        toast.success("Update saved.")
      } else {
        await createAdminChangelogEntry({ title, body, published })
        toast.success("Update created.")
      }
      await onSaved()
    } catch (saveError) {
      showErrorToast(getChangelogErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }, [body, entry, onSaved, published, title])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit update" : "New update"}</DialogTitle>
          <DialogDescription>
            Published updates appear in everyone&apos;s What&apos;s new panel and
            put a dot on the header button until they read them.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>What shipped</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="changelog-title"
                  hint="One line, the way you would say it out loud — for example, You can now export a workspace."
                >
                  Title
                </FieldLabel>
                <Input
                  id="changelog-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    // Clear the mark as soon as it is answered, rather than
                    // leaving a red ring on a field that now has a title.
                    if (event.target.value.trim()) setTitleInvalid(false)
                  }}
                  aria-invalid={titleInvalid || undefined}
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="changelog-body"
                  hint="Line breaks are kept, so a short list of changes reads fine here."
                >
                  Details
                </FieldLabel>
                <Textarea
                  id="changelog-body"
                  rows={1}
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value)
                    if (event.target.value.trim()) setBodyInvalid(false)
                  }}
                  aria-invalid={bodyInvalid || undefined}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="changelog-published"
                  checked={published}
                  onCheckedChange={(value) => setPublished(value === true)}
                />
                <Label htmlFor="changelog-published" className="font-normal">
                  Published
                </Label>
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            {entry ? "Save changes" : "Create update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The update exactly as the What's new panel shows it, so what an admin checks
 * before publishing is what everybody gets. This replaced the separate What's
 * new link in the admin sidebar.
 */
function PreviewDialog({
  entry,
  onClose,
}: {
  entry: ChangelogEntry | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{entry?.title ?? "Preview"}</DialogTitle>
          <DialogDescription>
            {entry?.publishedAt
              ? `Published ${dateFormatter.format(new Date(entry.publishedAt))}`
              : "Draft — not published yet"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
            {entry?.body ?? ""}
          </p>
        </DialogBody>
        {/* Read-only: nothing to save, so a single Done rather than
            Cancel-and-primary. */}
        <DialogFooter variant="plain">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
