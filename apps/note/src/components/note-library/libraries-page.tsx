import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { LibraryIcon, Loader2Icon, PinIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { LibraryDot } from "@/components/note-library/library-dot"
import { LibrarySettingsDialog } from "@/components/note-library/library-settings-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { SortableTableHeader, type TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { deleteLibraryRow, getLibraryErrorMessage, makeLibrary, pinLibraryRow } from "@/lib/api/note/library"
import { formatShortTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import {
  LIBRARY_COLOUR_LABEL,
  LIBRARY_COLOURS,
  LIBRARY_DESCRIPTION_MAX,
  LIBRARY_NAME_MAX,
  type LibraryColour,
  type LibraryRow,
} from "@/lib/note/library/notes"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Column = "name" | "notes" | "edited"

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "name", label: "Library", column: "main" },
  { key: "notes", label: "Notes", column: "preview", className: "hidden sm:table-cell" },
  { key: "edited", label: "Edited", column: "preview", className: "hidden md:table-cell" },
]

/**
 * The Library screen: every library of this person's as a table like
 * Projects (Tyler, 20 Oct 2026: "Table like Projects"), pinned ones first, with
 * how many notes each holds and when it was last edited. A row opens that
 * library's dashboard. The cog opens its settings, the bin deletes it with
 * every note in it, and New library makes one.
 */
export function LibrariesPage({ libraries }: { libraries: LibraryRow[] }) {
  const navigate = useNavigate()
  const router = useRouter()
  const { config } = useShellRuntime()
  const [query, setQuery] = React.useState("")
  const { sort, direction, toggleSort } = useTableSort<Column>("name", "asc", (column) =>
    column === "name" ? "asc" : "desc"
  )
  const [settingsFor, setSettingsFor] = React.useState<LibraryRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<LibraryRow | null>(null)
  const closingDelete = useLastValue(deleteTarget)
  const [run, busy] = useAsyncAction(getLibraryErrorMessage)

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const sign = direction === "asc" ? 1 : -1
    return libraries
      .filter(
        (row) => !needle || row.name.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle)
      )
      .sort((a, b) => {
        // Pinned libraries come first whatever the sort, as each person's own shortcut.
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (sort === "notes") return (a.noteCount - b.noteCount) * sign || a.name.localeCompare(b.name)
        if (sort === "edited") return a.editedAt.localeCompare(b.editedAt) * sign || a.name.localeCompare(b.name)
        return a.name.localeCompare(b.name) * sign
      })
  }, [direction, libraries, query, sort])
  const { visible, footer } = useClientPage(rows, config.dashboardRowsPerPage, `${query}|${sort}|${direction}`)

  const open = (id: string) => void navigate({ to: "/library/$libraryId", params: { libraryId: id } })

  return (
    <>
      <DashboardTable
        title="Library"
        icon={<LibraryIcon />}
        count={rows.length}
        controls={
          <>
            <DashboardToolbarSearch
              name="library-search"
              aria-label="Search libraries"
              placeholder="Search libraries…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <NewLibraryDropdown onMade={(row) => open(row.id)} />
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={rows.length === 0}
        emptyText={query ? "No library matches that search." : "No libraries yet. New library makes one."}
        emptyColSpan={COLUMNS.length + 1}
        footer={footer}
      >
        {visible.map((row) => (
          <TableRow
            key={row.id}
            className={cn(
              "group",
              row.pinned && "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
            )}
            rowAction={() => open(row.id)}
          >
            <TableCell column="main">
              <span className="flex min-w-0 items-center gap-3">
                <LibraryAvatar row={row} />
                <span className="grid min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <LibraryDot colour={row.colour} />
                    <button type="button" className="truncate text-left font-medium group-hover:underline" onClick={() => open(row.id)}>
                      {row.name}
                    </button>
                  </span>
                  {row.description ? (
                    <span className="max-w-96 truncate text-xs text-muted-foreground">{row.description}</span>
                  ) : null}
                </span>
              </span>
            </TableCell>
            <TableCell column="preview" className="hidden tabular-nums sm:table-cell">
              {row.noteCount.toLocaleString()}
            </TableCell>
            <TableCell column="preview" className="hidden md:table-cell">
              {/* Worked out again when the page wakes up; a minute ticking over between is expected. */}
              <span suppressHydrationWarning>{formatShortTimeAgo(row.editedAt)}</span>
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={row.pinned ? `Unpin ${row.name}` : `Pin ${row.name}`}
                aria-pressed={row.pinned}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await pinLibraryRow(row.id, !row.pinned)
                    await router.invalidate()
                  })
                }
              >
                {/* Yellow while pinned, and filled, so it never relies on colour alone. */}
                <PinIcon className={cn("size-4", row.pinned && "fill-amber-400 text-amber-500")} aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`${row.name} settings`} onClick={() => setSettingsFor(row)}>
                <SettingsIcon className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${row.name}`} onClick={() => setDeleteTarget(row)}>
                <Trash2Icon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {settingsFor ? (
        <LibrarySettingsDialog
          library={settingsFor}
          templates={null}
          open
          onClose={() => setSettingsFor(null)}
          onSaved={async () => {
            await router.invalidate()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null)
        }}
        title={closingDelete ? `Delete ${quoteOneLine(closingDelete.name)}?` : "Delete this library?"}
        description={
          closingDelete
            ? `Its ${closingDelete.noteCount.toLocaleString()} ${plural(closingDelete.noteCount, "note")} and their saved videos go with it, for good. There is no Trash for libraries.`
            : ""
        }
        confirmLabel="Delete library"
        loading={busy}
        onConfirm={() => {
          if (!deleteTarget) return
          const { id, name } = deleteTarget
          void run(async () => {
            const { notes } = await deleteLibraryRow(id)
            setDeleteTarget(null)
            toast.success(`Deleted ${quoteOneLine(name)} and its ${notes.toLocaleString()} ${plural(notes, "note")}.`)
            await router.invalidate()
          })
        }}
      />
    </>
  )
}

/** The library's own picture, or its first letter on a muted circle. */
export function LibraryAvatar({ row, className }: { row: Pick<LibraryRow, "name" | "avatarUrl">; className?: string }) {
  const [broken, setBroken] = React.useState(false)
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground",
        className
      )}
    >
      {row.avatarUrl && !broken ? (
        <img src={row.avatarUrl} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        row.name.trim().charAt(0).toUpperCase()
      )}
    </span>
  )
}

/**
 * New library is a dropdown, not a window (UI standard): the name first, then
 * the description and the colour, and "Create library" at the bottom right.
 * Clicking away keeps what was typed for the next opening.
 */
function NewLibraryDropdown({ onMade }: { onMade: (row: LibraryRow) => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [colour, setColour] = React.useState<LibraryColour>("blue")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the library a name")
      return
    }
    setBusy(true)
    try {
      const made = await makeLibrary({ name, description, colour })
      setOpen(false)
      setName("")
      setDescription("")
      toast.success(`Made ${quoteOneLine(made.name)}.`)
      onMade(made)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <NewRecordDropdown
      label="New library"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create library"
      busy={busy}
      onSubmit={() => void submit()}
      trigger={
        <DashboardToolbarButton type="button">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
          New library
        </DashboardToolbarButton>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="new-library-name">Name</Label>
        <Input
          id="new-library-name"
          autoFocus
          value={name}
          maxLength={LIBRARY_NAME_MAX}
          aria-invalid={invalid || undefined}
          placeholder="Content ideas"
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-library-description">Description</Label>
        <Textarea
          id="new-library-description"
          rows={1}
          value={description}
          maxLength={LIBRARY_DESCRIPTION_MAX}
          placeholder="What goes in here"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-library-colour">Colour</Label>
        <ColourSelect id="new-library-colour" value={colour} onChange={setColour} />
      </div>
    </NewRecordDropdown>
  )
}

export function ColourSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: LibraryColour
  onChange: (colour: LibraryColour) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as LibraryColour)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LIBRARY_COLOURS.map((each) => (
          <SelectItem key={each} value={each}>
            <span className="flex items-center gap-2">
              <LibraryDot colour={each} />
              {LIBRARY_COLOUR_LABEL[each]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
