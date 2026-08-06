import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ExternalLinkIcon,
  PanelsTopLeftIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { WrittenPageDialog } from "@/components/pages/written-page-dialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  getPageVisibilityErrorMessage,
  getWrittenPageErrorMessage,
  loadWrittenPage,
  removeWrittenPage,
  savePageVisibility,
  type PagesOverview,
  type PublicPageRow,
  type WrittenPage,
} from "@/lib/api/content/pages"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import {
  PAGE_VISIBILITIES,
  PAGE_VISIBILITY_LABELS,
  type PageVisibility,
} from "@/lib/pages/page-visibility"
import { useTableSort } from "@/lib/hooks/use-table-sort"

/**
 * The admin's Pages screen: every public page the app has, with its address,
 * whether it is on, a link that opens it, and how many visits it got over
 * the last month. The rows come from the page registry, so a page added by
 * dropping in a `*.page.ts` file appears here with no other edit; the visit
 * numbers are the traffic tracker's counters.
 */

type PageSort = "page" | "address" | "status" | "visits"

/**
 * There is no range picker, so the Visits heading is what tells an admin how
 * far back the numbers go — and it says the window the server actually
 * summed rather than a number written out a second time here.
 */
function pageColumns(visitDays: number): SortableColumn<PageSort>[] {
  return [
    { key: "page", label: "Page", column: "main" },
    {
      key: "address",
      label: "Address",
      column: "meta",
      className: "hidden md:table-cell",
    },
    // Never hidden on a narrow screen, unlike the address: it is the one
    // control on this screen, and a table that scrolls sideways is a better
    // answer than an admin on a phone who cannot switch a page off at all.
    { key: "status", label: "Who can see it", column: "meta" },
    { key: "visits", label: `Visits (${visitDays} days)`, column: "meta" },
  ]
}

/** Only the words read as words; the visit count starts biggest-first. */
const pageSortDirection = (column: PageSort) =>
  column === "visits" ? "desc" : "asc"

export function AdminPagesDashboard({
  data,
  searchText,
}: {
  data: PagesOverview
  searchText: string
}) {
  const router = useRouter()
  const navigate = useListSearchNavigate()
  const [text, setText] = useSearchBoxText(searchText, (value) =>
    navigate({ q: value || undefined })
  )
  const { sort, direction, toggleSort } = useTableSort<PageSort>(
    "visits",
    "desc",
    pageSortDirection
  )

  /**
   * The choice being saved right now, so the dropdown shows what was picked
   * rather than snapping back to the old value for the length of the round
   * trip. Cleared either way: on success the reloaded rows already say it, and
   * on failure dropping it is what puts the control back to the truth.
   */
  const [saving, setSaving] = React.useState<{
    path: string
    visibility: PageVisibility
  } | null>(null)

  /**
   * The written page being edited, or "new" while one is being written. Held
   * as its own record rather than reusing the row, because the row carries a
   * summary while the window needs the words.
   */
  const [editing, setEditing] = React.useState<WrittenPage | "new" | null>(null)
  const [opening, setOpening] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<PublicPageRow | null>(null)
  const [deleteRunning, setDeleteRunning] = React.useState(false)

  /** The row only knows a page exists; the words come from its own read. */
  async function openForEdit(row: PublicPageRow) {
    setOpening(row.path)
    dismissErrorToast()
    try {
      const page = await loadWrittenPage(row.path)
      if (!page) {
        showErrorToast("That page has already been deleted.")
        await router.invalidate()
        return
      }
      setEditing(page)
    } catch (error) {
      showErrorToast(getWrittenPageErrorMessage(error))
    } finally {
      setOpening(null)
    }
  }

  async function confirmDelete() {
    if (!deleting?.writtenPageId) return
    setDeleteRunning(true)
    dismissErrorToast()
    try {
      await removeWrittenPage(deleting.writtenPageId)
      await router.invalidate()
      toast.success(`${deleting.name} was deleted.`)
      setDeleting(null)
    } catch (error) {
      showErrorToast(getWrittenPageErrorMessage(error))
    } finally {
      setDeleteRunning(false)
    }
  }

  async function changeVisibility(row: PublicPageRow, next: PageVisibility) {
    setSaving({ path: row.path, visibility: next })
    dismissErrorToast()
    try {
      await savePageVisibility({ path: row.path, visibility: next })
      await router.invalidate()
      toast.success(`${row.name} is now ${visibilitySentence(next)}`)
    } catch (error) {
      showErrorToast(getPageVisibilityErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const rows = React.useMemo(() => {
    const query = searchText.trim().toLowerCase()
    const matching = data.rows.filter(
      (row) =>
        !query || `${row.name} ${row.path}`.toLowerCase().includes(query)
    )
    const factor = direction === "asc" ? 1 : -1
    return matching.sort((a, b) => factor * comparePages(a, b, sort))
  }, [data.rows, searchText, sort, direction])

  return (
    <>
    <DashboardTable
      title="Pages"
      icon={<PanelsTopLeftIcon className="text-muted-foreground" />}
      count={rows.length}
      controls={
        <>
          <DashboardToolbarSearch
            name="pages-search"
            aria-label="Search pages"
            placeholder="Search name or address…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {/* The one primary action, last, as the toolbar order asks. */}
          <Button type="button" onClick={() => setEditing("new")}>
            <PlusIcon className="size-4" />
            Write a page
          </Button>
        </>
      }
      header={
        <SortableTableHeader
          columns={pageColumns(data.visitDays)}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          withAriaSort
          trailing={<TableHead column="meta">Open</TableHead>}
        />
      }
      isEmpty={rows.length === 0}
      emptyText={
        searchText.trim()
          ? "No page matches that search."
          : "No public pages are declared."
      }
      emptyColSpan={5}
      footer={{
        type: "summary",
        count: rows.length,
        label: "public pages",
        // The tracker counts the busiest 200 addresses per day and pools the
        // rest, so on a very busy day a page's count can read low. Said out
        // loud rather than pretending the numbers are exact.
        action: data.approximate ? (
          <span className="text-xs">
            Some days were too busy to count every address — small numbers may
            read low.
          </span>
        ) : undefined,
      }}
    >
      {rows.map((row) => (
        <TableRow key={row.path}>
          <TableCell column="main">
            <div className="flex min-w-0 items-center gap-2">
              {/* `min-w-0` on the name as well as the row: a flex child
                  refuses to shrink below its own text by default, and without
                  it a long name pushes out of the cell instead of truncating. */}
              <span
                className="min-w-0 truncate text-sm font-medium"
                title={row.name}
              >
                {row.name}
              </span>
              {/* Only the app's own pages say anything. The shell's are the
                  ordinary case and a caption on every row would be noise —
                  and a page that never says where it came from reads as the
                  shell's, which is what every page here is. */}
              {row.source === "app" ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Added by this app
                </span>
              ) : null}
            </div>
            <span
              className="line-clamp-2 whitespace-normal text-xs text-muted-foreground"
              title={row.summary}
            >
              {row.summary}
            </span>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:table-cell">
            <span className="block max-w-48 truncate" title={row.path}>
              {row.path}
            </span>
          </TableCell>
          {/* "actions" rather than "meta" even though it is not the last
              column: the two render identically and the marker is only about
              who owns a click, so a later task that makes these rows open
              something cannot have the dropdown open it by accident. */}
          <TableCell column="actions">
            <VisibilitySelect
              row={row}
              saving={saving?.path === row.path ? saving.visibility : null}
              onChange={(next) => void changeVisibility(row, next)}
            />
          </TableCell>
          <TableCell column="meta">{row.visits.toLocaleString()}</TableCell>
          <TableCell column="actions">
            <div className="flex items-center">
              <Button asChild variant="ghost" size="icon">
                <a
                  href={row.path}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${row.name} in a new tab`}
                >
                  <ExternalLinkIcon className="size-4" />
                </a>
              </Button>
              {/* Only a page an admin wrote can be edited or deleted here. A
                  coded page is changed by changing its code, so it gets no
                  buttons rather than buttons that would refuse. */}
              {row.writtenPageId ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={opening === row.path}
                    aria-label={`Edit ${row.name}`}
                    onClick={() => void openForEdit(row)}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${row.name}`}
                    onClick={() => setDeleting(row)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>

    <WrittenPageDialog
      open={editing !== null}
      page={editing === "new" ? null : editing}
      onClose={() => setEditing(null)}
      onSaved={() => {
        const wasNew = editing === "new"
        setEditing(null)
        void router.invalidate()
        toast.success(wasNew ? "Page created." : "Page saved.")
      }}
    />

    <ConfirmDialog
      open={deleting !== null}
      onOpenChange={(open) => {
        if (!open) setDeleting(null)
      }}
      title="Delete this page?"
      description={
        deleting
          ? `${deleting.name} goes for good, and ${deleting.path} stops existing — anyone following a link to it gets the not-found page.`
          : null
      }
      confirmLabel="Delete page"
      loading={deleteRunning}
      onConfirm={confirmDelete}
    />
    </>
  )
}

/**
 * Who may see this page, and the way to change it.
 *
 * A page the shell will not hide gets the control greyed out with the reason
 * beside it rather than a bare disabled box — and the reason goes through
 * `DisabledReason`, because a `title` on a disabled control never appears.
 */
function VisibilitySelect({
  row,
  saving,
  onChange,
}: {
  row: PublicPageRow
  /** The choice being written right now, or null when nothing is in flight. */
  saving: PageVisibility | null
  onChange: (next: PageVisibility) => void
}) {
  return (
    <DisabledReason
      disabled={!row.canSwitchOff}
      reason={`${row.name} is part of how people reach the app, so it cannot be hidden.`}
    >
      <Select
        value={saving ?? row.visibility}
        disabled={!row.canSwitchOff || saving !== null}
        onValueChange={(value) => onChange(value as PageVisibility)}
      >
        {/* Named per row rather than leaning on the column heading, so the
            control says which page it belongs to when read out on its own. */}
        <SelectTrigger className="w-fit" aria-label={`Who can see ${row.name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_VISIBILITIES.map((visibility) => (
            <SelectItem key={visibility} value={visibility}>
              {PAGE_VISIBILITY_LABELS[visibility]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </DisabledReason>
  )
}

/** The confirmation's wording, so the toast reads as a sentence. */
function visibilitySentence(visibility: PageVisibility) {
  if (visibility === "everyone") return "open to everyone."
  if (visibility === "members") return "members only."
  return "switched off."
}

function comparePages(a: PublicPageRow, b: PublicPageRow, sort: PageSort) {
  if (sort === "visits") return a.visits - b.visits
  if (sort === "address") return a.path.localeCompare(b.path)
  // Most open first when ascending, address as the tiebreak so pages that say
  // the same thing keep a steady order.
  if (sort === "status") {
    return (
      PAGE_VISIBILITIES.indexOf(a.visibility) -
        PAGE_VISIBILITIES.indexOf(b.visibility) ||
      a.path.localeCompare(b.path)
    )
  }
  return a.name.localeCompare(b.name)
}
