import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
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
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  createAdminChangelogEntry,
  deleteAdminChangelogEntries,
  getChangelogErrorMessage,
  loadAdminChangelog,
  updateAdminChangelogEntry,
  type ChangelogEntry,
} from "@/lib/api/content/changelog"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import { formatDate } from "@/lib/format/format-time"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"

type ChangelogSortColumn = "title" | "status" | "published"

const CHANGELOG_COLUMNS: SortableColumn<ChangelogSortColumn>[] = [
  { key: "title", label: "Update", column: "main" },
  { key: "status", label: "Status", column: "meta" },
  { key: "published", label: "Published", column: "meta" },
]

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
  const navigate = useNavigate()
  const [entries, setEntries] = React.useState(initialEntries)
  const [searchQuery, setSearchQuery] = React.useState("")
  const { sort, direction, toggleSort } = useTableSort<ChangelogSortColumn>(
    "published",
    "desc"
  )
  const [previewing, setPreviewing] = React.useState<ChangelogEntry | null>(
    null
  )
  const [creating, setCreating] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<ChangelogEntry | null>(
    null
  )
  const [deleting, setDeleting] = React.useState(false)
  const selection = useSelection()
  const selectedIds = selection.selected
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const setOpenEntry = React.useCallback(
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
  const openEntry = React.useCallback(
    (entry: ChangelogEntry) => {
      setOpenEntry(entry.id)
    },
    [setOpenEntry]
  )
  const editing = React.useMemo(
    () => entries.find((entry) => entry.id === openId) ?? null,
    [entries, openId]
  )

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

  const {
    page: currentPage,
    pageSize,
    visible: paginatedEntries,
    footer,
  } = useClientPage(
    sortedEntries,
    config.dashboardRowsPerPage,
    `${searchQuery}|${sort}|${direction}`
  )

  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  const visibleIds = React.useMemo(
    () => paginatedEntries.map((entry) => entry.id),
    [paginatedEntries]
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
        onClearSelection={selection.clear}
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
              placeholder="Search updates…"
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
          <SortableTableHeader
            columns={CHANGELOG_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select updates on this page"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sortedEntries.length === 0}
        emptyText={
          entries.length === 0
            ? "No updates yet. Write the first one."
            : "No updates found matching your search."
        }
        emptyColSpan={5}
        footer={footer}
      >
        {paginatedEntries.map((entry) => (
          <TableRow
            key={entry.id}
            className="group"
            rowAction={() => openEntry(entry)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(entry.id)}
                onCheckedChange={() => selection.toggle(entry.id)}
                aria-label={`Select ${entry.title}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block text-left text-sm font-medium group-hover:underline"
                onClick={() => openEntry(entry)}
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
            {/* A draft has no date; `formatDate` writes the em dash for it. */}
            <TableCell column="meta">{formatDate(entry.publishedAt)}</TableCell>
            <TableCell column="actions">
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
                  onClick={() => openEntry(entry)}
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
          setOpenEntry(undefined)
        }}
        onSaved={async () => {
          setCreating(false)
          setOpenEntry(undefined)
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
        title={`Delete ${selectedIds.size} ${plural(selectedIds.size, "update", "updates")}?`}
        description="They disappear from everyone's What's new panel. This cannot be undone."
        confirmLabel="Delete updates"
        loading={massDeleting}
        onConfirm={async () => {
          setMassDeleting(true)
          try {
            await deleteAdminChangelogEntries([...selectedIds])
            toast.success("Updates deleted.")
            selection.clear()
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
  const titleInputRef = React.useRef<HTMLInputElement>(null)
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

  // What the window opened holding. Anything different is unsaved work, so the
  // backdrop, Escape, the X and Cancel all ask before throwing it away — and
  // `busy` refuses to close at all while the save is in flight, which the old
  // unguarded `onOpenChange` did not.
  const dirty =
    title !== (entry?.title ?? "") ||
    body !== (entry?.body ?? "") ||
    published !== Boolean(entry?.publishedAt)

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
      <DialogContent
        variant="admin"
        className="sm:max-w-lg"
        // A new update opens with the cursor in Title so you can just type.
        // Editing an existing one keeps the window's normal focus, since
        // landing in a filled field invites a stray edit.
        onOpenAutoFocus={(event) => {
          if (entry) return
          event.preventDefault()
          titleInputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{entry ? "Edit update" : "New update"}</DialogTitle>
          <DialogDescription>
            Published updates appear in everyone&apos;s What&apos;s new panel and
            put a dot on the header button until they read them.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
        >
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
                  ref={titleInputRef}
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
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            {entry ? "Save changes" : "Create update"}
          </Button>
        </DialogFooter>
        </form>
      </DialogContent>
      )}
    </FormDialog>
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
              ? `Published ${formatDate(entry.publishedAt)}`
              : "Draft — not published yet"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {/* The white card is what puts this on the same surface the What's
              new page uses, so the words are set the same way there and here.
              The text classes match `changelog-page.tsx` exactly — change one
              and change the other. */}
          <Card size="sm">
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {entry?.body ?? ""}
              </p>
            </CardContent>
          </Card>
        </DialogBody>
        {/* Read-only: nothing to save, so a single Done rather than
            Cancel-and-primary. */}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
