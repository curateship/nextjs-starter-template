import * as React from "react"
import { Link } from "@tanstack/react-router"
import { HardDriveIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  getAdminMediaErrorMessage,
  loadStorage,
  type StorageDashboard,
  type StorageUserRow,
} from "@/lib/api/admin-media"
import { formatFileSize } from "@/lib/format-bytes"
import { useClientPage } from "@/lib/use-client-page"
import { useTableSort } from "@/lib/use-table-sort"

type StorageSort = "person" | "files" | "storage" | "orphans" | "share"

const sortableColumns: SortableColumn<StorageSort>[] = [
  { key: "person", label: "Person", column: "main" },
  { key: "files", label: "Files", column: "meta" },
  { key: "storage", label: "Storage", column: "meta" },
  { key: "orphans", label: "Orphans", column: "meta" },
  { key: "share", label: "Share", column: "meta", className: "hidden lg:table-cell" },
]

/** Everything but the person's name reads as a number, so it starts biggest-first. */
const storageSortDirection = (column: StorageSort) =>
  column === "person" ? "asc" : "desc"

/** Who is using the space. Picking a name opens their files in the library. */
export function MediaStorageDashboard({
  initialData,
  defaultPageSize,
}: {
  initialData: StorageDashboard
  defaultPageSize: number
}) {
  const [data, setData] = React.useState(initialData)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const { sort, direction, toggleSort } = useTableSort<StorageSort>(
    "storage",
    "desc",
    storageSortDirection
  )

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await loadStorage())
      setError(null)
    } catch (loadError) {
      setError(getAdminMediaErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  const sorted = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = data.users.filter(
      (user) =>
        !query ||
        `${user.name} ${user.email}`.toLowerCase().includes(query)
    )
    const factor = direction === "asc" ? 1 : -1
    return rows.sort((a, b) => factor * compareUsers(a, b, sort))
  }, [data.users, direction, search, sort])

  const { visible, footer } = useClientPage(
    sorted,
    defaultPageSize,
    `${search}|${sort}|${direction}`
  )

  // The usage numbers are real even when the bucket cannot be read; only the
  // orphan column is unknown, so say that rather than blanking the table.
  const tableError = error
    ? { message: error, onRetry: () => void refresh() }
    : data.scanError
      ? {
          message: getAdminMediaErrorMessage(data.scanError),
          onRetry: () => void refresh(),
        }
      : null

  return (
    <DashboardTable
      title="Storage by user"
      icon={<HardDriveIcon className="text-muted-foreground" />}
      count={sorted.length}
      error={tableError}
      controls={
        <>
          <DashboardToolbarSearch
            name="storage-search"
            aria-label="Search people"
            placeholder="Search name or email…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <DashboardToolbarButton
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            Refresh
          </DashboardToolbarButton>
        </>
      }
      header={
        <SortableTableHeader
          columns={sortableColumns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          withAriaSort
        />
      }
      isEmpty={visible.length === 0}
      emptyText={
        search.trim()
          ? "Nobody matches that search."
          : "Nobody has uploaded anything yet."
      }
      emptyColSpan={5}
      footer={footer}
    >
      {visible.map((user) => (
        <TableRow key={user.userId} className="group">
          <TableCell column="main">
            <Link
              to="/admin/media"
              search={{ owner: user.userId }}
              className="block max-w-full truncate text-sm font-medium group-hover:underline"
              title={user.email}
            >
              {user.name}
            </Link>
          </TableCell>
          <TableCell column="mutedMeta">{user.files.toLocaleString()}</TableCell>
          <TableCell column="mutedMeta">{formatFileSize(user.bytes)}</TableCell>
          <TableCell column="meta">
            {data.scanError ? (
              <span className="text-muted-foreground">—</span>
            ) : user.orphanFiles ? (
              <Link
                to="/admin/media/orphans"
                className="text-destructive hover:underline"
              >
                {user.orphanFiles.toLocaleString()} ·{" "}
                {formatFileSize(user.orphanBytes)}
              </Link>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden lg:table-cell">
            {formatShare(user.bytes, data.totalBytes)}
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

function compareUsers(a: StorageUserRow, b: StorageUserRow, sort: StorageSort) {
  if (sort === "files") return a.files - b.files
  if (sort === "orphans") return a.orphanFiles - b.orphanFiles
  // Share is the same ordering as storage; both compare raw bytes.
  if (sort === "storage" || sort === "share") return a.bytes - b.bytes
  return a.name.localeCompare(b.name)
}

function formatShare(bytes: number, totalBytes: number) {
  if (!totalBytes) return "0%"
  return `${Math.round((bytes / totalBytes) * 100)}%`
}
