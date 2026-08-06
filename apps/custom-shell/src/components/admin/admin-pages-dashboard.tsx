import * as React from "react"
import { ExternalLinkIcon, PanelsTopLeftIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import type { PagesOverview, PublicPageRow } from "@/lib/api/pages"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/list-search"
import { useTableSort } from "@/lib/use-table-sort"

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
    {
      key: "status",
      label: "Status",
      column: "meta",
      className: "hidden sm:table-cell",
    },
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
  const navigate = useListSearchNavigate()
  const [text, setText] = useSearchBoxText(searchText, (value) =>
    navigate({ q: value || undefined })
  )
  const { sort, direction, toggleSort } = useTableSort<PageSort>(
    "visits",
    "desc",
    pageSortDirection
  )

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
    <DashboardTable
      title="Pages"
      icon={<PanelsTopLeftIcon className="text-muted-foreground" />}
      count={rows.length}
      controls={
        <DashboardToolbarSearch
          name="pages-search"
          aria-label="Search pages"
          placeholder="Search name or address…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
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
            <span
              className="block max-w-full truncate text-sm font-medium"
              title={row.name}
            >
              {row.name}
            </span>
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
          <TableCell column="mutedMeta" className="hidden sm:table-cell">
            {/* Read-only until the visibility task lands: today every page is
                on, and the ones the app cannot live without say so. */}
            {row.canSwitchOff ? "On" : "Always on"}
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
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

function comparePages(a: PublicPageRow, b: PublicPageRow, sort: PageSort) {
  if (sort === "visits") return a.visits - b.visits
  if (sort === "address") return a.path.localeCompare(b.path)
  // "Always on" ahead of "On" when ascending, address as the tiebreak so the
  // order is stable while every page still says the same thing.
  if (sort === "status") {
    return (
      Number(a.canSwitchOff) - Number(b.canSwitchOff) ||
      a.path.localeCompare(b.path)
    )
  }
  return a.name.localeCompare(b.name)
}
