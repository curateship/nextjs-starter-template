import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  ExternalLinkIcon,
  PanelsTopLeftIcon,
  PlusIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardCardHeaderIcon } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import {
  hasSystemPageCopy,
  SystemPageCopyDialog,
  SYSTEM_PAGE_COPY,
} from "@/components/pages/system-page-copy-dialog"
import { WrittenPageDialog } from "@/components/pages/written-page-dialog"
import { useShellRuntime } from "@/components/shell/shell-layout"
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
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import {
  PAGE_GROUP_LABELS,
  PAGE_GROUPS,
  pageGroup,
  type PageGroup,
} from "@/lib/pages/page-groups"
import {
  getPageVisibilityErrorMessage,
  getWrittenPageErrorMessage,
  removeWrittenPage,
  savePageVisibility,
  type PagesOverview,
  type PublicPageRow,
} from "@/lib/api/content/pages"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import {
  PAGE_VISIBILITIES,
  PAGE_VISIBILITY_LABELS,
  PAGE_VISIBILITY_SENTENCES,
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

/** Where a page built from blocks is edited. */
const EDIT_ROUTE = "/admin/pages/edit"

/**
 * The picture on each tab. Here rather than beside the labels in
 * `lib/pages/page-groups.ts`, because that module is read on the server too and
 * an icon is a React component.
 */
const PAGE_GROUP_ICONS: Record<PageGroup, React.ReactNode> = {
  yours: <PanelsTopLeftIcon className="size-4" />,
  system: <WrenchIcon className="size-4" />,
}

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
  group,
}: {
  data: PagesOverview
  searchText: string
  /** Which half of the screen is open. See `lib/pages/page-groups.ts`. */
  group: PageGroup
}) {
  const router = useRouter()
  const runtime = useShellRuntime()
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

  /** True while the add-a-page window is open. */
  const [adding, setAdding] = React.useState(false)
  /** Which system page's words are open, or null. */
  const [editingCopy, setEditingCopy] = React.useState<
    keyof typeof SYSTEM_PAGE_COPY | null
  >(null)
  const [deleting, setDeleting] = React.useState<PublicPageRow | null>(null)
  const [deleteRunning, setDeleteRunning] = React.useState(false)

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
      toast.success(`${row.name} is now ${PAGE_VISIBILITY_SENTENCES[next]}`)
    } catch (error) {
      showErrorToast(getPageVisibilityErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  /** How many pages each tab holds, before the search narrows anything. */
  const groupCounts = React.useMemo(() => {
    const counts: Record<PageGroup, number> = { yours: 0, system: 0 }
    for (const row of data.rows) counts[pageGroup(row)] += 1
    return counts
  }, [data.rows])

  const rows = React.useMemo(() => {
    const query = searchText.trim().toLowerCase()
    const matching = data.rows.filter(
      (row) =>
        pageGroup(row) === group &&
        (!query || `${row.name} ${row.path}`.toLowerCase().includes(query))
    )
    const factor = direction === "asc" ? 1 : -1
    return matching.sort((a, b) => factor * comparePages(a, b, sort))
  }, [data.rows, group, searchText, sort, direction])

  return (
    <>
    <DashboardTable
      title="Pages"
      icon={<PanelsTopLeftIcon className="text-muted-foreground" />}
      count={rows.length}
      tabs={
        <Tabs
          value={group}
          onValueChange={(value) =>
            navigate({ group: value === "yours" ? undefined : (value as PageGroup) })
          }
        >
          <TabsList>
            {PAGE_GROUPS.map((value) => (
              <TabsTrigger
                key={value}
                value={value}
                className="group/page-tab"
                aria-label={`${PAGE_GROUP_LABELS[value]}, ${groupCounts[value]}`}
              >
                {/* Muted until the tab is the chosen one, the same as the tab's
                    own words, so the pill reads as one thing rather than an
                    icon sitting beside a label. */}
                <DashboardCardHeaderIcon className="group-data-[state=active]/page-tab:text-foreground">
                  {PAGE_GROUP_ICONS[value]}
                </DashboardCardHeaderIcon>
                {PAGE_GROUP_LABELS[value]}
                <TabsCount>{groupCounts[value]}</TabsCount>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
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
          <Button type="button" onClick={() => setAdding(true)}>
            <PlusIcon className="size-4" />
            Add a page
          </Button>
        </>
      }
      header={
        <SortableTableHeader
          columns={pageColumns(data.visitDays)}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          trailing={<TableHead column="meta">Open</TableHead>}
        />
      }
      isEmpty={rows.length === 0}
      emptyText={
        searchText.trim()
          ? "No page matches that search."
          : group === "yours"
            ? "No pages of your own yet. Write one, or give a page blocks in its own file."
            : "No public pages are declared."
      }
      emptyColSpan={5}
      footer={{
        type: "summary",
        count: rows.length,
        label: group === "yours" ? "pages" : "system pages",
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
      {rows.map((row) => {
        // Held as a value rather than asked twice: the check narrows the
        // address, and a callback that asks again later has lost the narrowing.
        const copyPath = hasSystemPageCopy(row.path) ? row.path : null
        return (
        <TableRow
          key={row.path}
          // Only a page built from blocks has an editor to open. Everything
          // else on this screen is code an app wrote or words an admin wrote,
          // so its row stays a row. The page's own card decides, so an app that
          // gives a second page blocks needs no change here.
          rowAction={
            row.blocks
              ? () =>
                  void router.navigate({
                    to: EDIT_ROUTE,
                    search: { path: row.path },
                  })
              : copyPath
                ? () => setEditingCopy(copyPath)
                : undefined
          }
        >
          <TableCell column="main">
            <div className="flex min-w-0 items-center gap-2">
              {/* `min-w-0` on the name as well as the row: a flex child
                  refuses to shrink below its own text by default, and without
                  it a long name pushes out of the cell instead of truncating. */}
              {row.blocks ? (
                <Link
                  to={EDIT_ROUTE}
                  search={{ path: row.path }}
                  className={cn(
                    "min-w-0 truncate text-sm font-medium hover:underline",
                    focusRing
                  )}
                  title={`Build ${row.name}`}
                >
                  {row.name}
                </Link>
              ) : copyPath ? (
                <button
                  type="button"
                  className={cn(
                    "min-w-0 truncate rounded-md text-left text-sm font-medium hover:underline",
                    focusRing
                  )}
                  title={`Change what ${row.name} says`}
                  onClick={() => setEditingCopy(copyPath)}
                >
                  {row.name}
                </button>
              ) : (
                <span
                  className="min-w-0 truncate text-sm font-medium"
                  title={row.name}
                >
                  {row.name}
                </span>
              )}
              {/* Only the app's own pages say anything. The shell's are the
                  ordinary case and a caption on every row would be noise —
                  and a page that never says where it came from reads as the
                  shell's, which is what every page here is. */}
              {row.source === "app" ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Added by this app
                </span>
              ) : null}
              {/* Only a page built from blocks says so, and it says how many
                  it holds: "0 blocks" is the difference between a page waiting
                  to be built and a page that is not built this way at all. */}
              {row.blocks ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {row.blockCount === 1 ? "1 block" : `${row.blockCount} blocks`}
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
              {/* A page built from blocks is edited by opening it, which is
                  what its name does. The one button left is the one the editor
                  has no place for: a page an admin added can be taken away,
                  and a coded page cannot. */}
              {row.writtenPageId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${row.name}`}
                  onClick={() => setDeleting(row)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              ) : null}
          </TableCell>
        </TableRow>
        )
      })}
    </DashboardTable>

    <WrittenPageDialog
      open={adding}
      onClose={() => setAdding(false)}
      onCreated={(page) => {
        setAdding(false)
        toast.success(`${page.title} was created.`)
        // Straight into the editor: the window asked for a name and an
        // address, and everything else about the page is built there.
        void router.navigate({
          to: EDIT_ROUTE,
          search: { path: page.path },
        })
      }}
    />

    <SystemPageCopyDialog
      path={editingCopy}
      config={runtime.config}
      onClose={() => setEditingCopy(null)}
      onSave={(publicSystemCopy) => {
        runtime.onConfigChange({ ...runtime.config, publicSystemCopy })
        setEditingCopy(null)
        toast.success("Saved.")
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
        <SelectTrigger
          className="w-full sm:w-fit"
          aria-label={`Who can see ${row.name}`}
        >
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
