import * as React from "react"
import { ExternalLinkIcon, MessagesSquareIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { SortableTableHeader, type TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import type { OwnPostRow } from "@/lib/api/social/reddit/own-posts"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { postedDateText } from "@/lib/social/wording"

import { Hint } from "../hint"
import { IN_COLUMN_TABLE } from "../projects/project-columns"

type SortColumn = "post" | "account" | "subreddit" | "sent"

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "post", label: "Post", column: "main" },
  // By the middle column's width, not the window's: narrower than 56rem the
  // account and when it went up fold into a line under the post's title.
  { key: "account", label: "Account", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "subreddit", label: "Subreddit", column: "meta" },
  { key: "sent", label: "Sent", column: "meta", className: "hidden @4xl:table-cell" },
]

function compare(a: OwnPostRow, b: OwnPostRow, column: SortColumn): number {
  switch (column) {
    case "account":
      return (a.account.handle || "~").localeCompare(b.account.handle || "~")
    case "subreddit":
      return a.subreddit.localeCompare(b.subreddit)
    case "sent":
      return new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
    default:
      return a.title.localeCompare(b.title)
  }
}

/** Only an address on Reddit is ever opened from a stored value. */
function openOnReddit(url: string) {
  if (url.startsWith("https://www.reddit.com/")) window.open(url, "_blank", "noopener,noreferrer")
}

/**
 * Every post of your own that landed, newest first. A post is read on Reddit
 * itself, so a row opens it there. There is nothing to do to several at once,
 * so the table has no ticks.
 */
export function PostsTable({ tabs, rows }: { tabs: React.ReactNode; rows: OwnPostRow[] }) {
  const { config } = useShellRuntime()
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("sent", "desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => factor * compare(a, b, sort))
  }, [direction, rows, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <DashboardTable
      title="Posts of your own"
      icon={<MessagesSquareIcon />}
      fillHeight
      className={IN_COLUMN_TABLE}
      tabs={tabs}
      count={rows.length}
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
      emptyText="No posts of your own from this project yet."
      emptyColSpan={COLUMNS.length + 1}
      footer={{
        type: "pagination",
        page: currentPage,
        pageSize,
        total: rows.length,
        totalPages,
        onPageChange: (next) => setPage(Math.max(1, Math.min(next, totalPages))),
        onPageSizeChange: (next) => {
          setPage(1)
          setPageSize(next)
        },
      }}
    >
      {visible.map((row) => (
        <TableRow key={row.id} className="group" rowAction={() => openOnReddit(row.postUrl)}>
          <TableCell column="main" className="max-w-0">
            <Hint label={row.title}>
              <button
                type="button"
                className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => openOnReddit(row.postUrl)}
              >
                {row.title}
              </button>
            </Hint>
            <Hint label={row.body}>
              <span className="block truncate text-xs text-muted-foreground">
                {row.body || "A post with a title alone."}
              </span>
            </Hint>
            <span className="block truncate text-xs text-muted-foreground @4xl:hidden">
              {row.account.handle ? `u/${row.account.handle}` : "An account not signed in"}
              {` · sent ${postedDateText(new Date(row.postedAt)).toLowerCase()}`}
            </span>
          </TableCell>
          <TableCell column="meta" className="hidden max-w-32 @4xl:table-cell">
            <span className="block truncate">{row.account.handle ? `u/${row.account.handle}` : "Not signed in"}</span>
          </TableCell>
          <TableCell column="meta" className="max-w-32">
            <span className="block truncate text-muted-foreground">r/{row.subreddit}</span>
          </TableCell>
          <TableCell column="meta" className="hidden text-muted-foreground @4xl:table-cell">
            {postedDateText(new Date(row.postedAt))}
          </TableCell>
          <TableCell column="actions">
            <Hint label="Open on Reddit">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => openOnReddit(row.postUrl)}
                aria-label={`Open ${row.title} on Reddit`}
              >
                <ExternalLinkIcon className="size-4" />
              </Button>
            </Hint>
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}
