import * as React from "react"
import { Loader2Icon, RefreshCwIcon, ScrollTextIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  AUDIT_LOADER_PAGE_SIZE,
  getAdminAuditErrorMessage,
  listAdminAuditLogs,
  type AuditFilterOptions,
  type AuditLogRow,
} from "@/lib/api/admin-audit"
import {
  actionLabel,
  activitySentence,
  actorLabel,
  resourceLabel,
} from "@/lib/audit-sentence"
import { formatDateTime } from "@/lib/money"

type SortColumn = "action" | "resource" | "created"

const sortableColumns: {
  by: SortColumn
  label: string
  column: "main" | "meta"
  className?: string
}[] = [
  { by: "action", label: "Activity", column: "main" },
  // The sentence usually names the thing anyway ("the free plan"), so this is
  // the column to drop when the screen is narrow — the time is not.
  { by: "resource", label: "What", column: "meta", className: "hidden lg:table-cell" },
  { by: "created", label: "When", column: "meta" },
]

/** Read-only record of every change an admin made. Nothing here writes. */
export function AdminAuditDashboard({
  initialEntries,
  initialTotal,
  initialOptions,
  defaultPageSize,
}: {
  initialEntries: AuditLogRow[]
  initialTotal: number
  initialOptions: AuditFilterOptions
  defaultPageSize: number
}) {
  const [entries, setEntries] = React.useState(initialEntries)
  const [total, setTotal] = React.useState(initialTotal)
  const [options, setOptions] = React.useState(initialOptions)
  const [search, setSearch] = React.useState("")
  const [action, setAction] = React.useState("all")
  const [resource, setResource] = React.useState("all")
  const [actor, setActor] = React.useState("all")
  const [sort, setSort] = React.useState<SortColumn>("created")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [viewing, setViewing] = React.useState<AuditLogRow | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await listAdminAuditLogs({
        search,
        action,
        resource,
        actor,
        page,
        pageSize,
        sort,
        direction,
      })
      setEntries(result.entries)
      setTotal(result.total)
      setOptions(result.options)
      setError(null)
    } catch (loadError) {
      setError(getAdminAuditErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [action, actor, direction, page, pageSize, resource, search, sort])

  const isFirstRender = React.useRef(true)
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      // The loader could not know this workspace's rows-per-page, so skip the
      // extra fetch only when it happened to ask for the right number of rows.
      if (defaultPageSize === AUDIT_LOADER_PAGE_SIZE) return
    }

    const timer = setTimeout(refresh, 250)
    return () => clearTimeout(timer)
  }, [defaultPageSize, refresh])

  const toggleSort = React.useCallback(
    (column: SortColumn) => {
      if (sort === column) {
        setDirection(direction === "asc" ? "desc" : "asc")
        return
      }
      setSort(column)
      setDirection(column === "created" ? "desc" : "asc")
    },
    [direction, sort]
  )

  // The database sorts by the raw word it saved, so re-sort by what is read.
  const actionOptions = sortByLabel(options.actions, actionLabel)
  const resourceOptions = sortByLabel(options.resources, resourceLabel)

  // Deleting an admin blanks the actor on their entries, so the person you are
  // filtering by can leave the list. Keep the row listed or the dropdown would
  // go blank while it is still filtering.
  const actorOptions =
    actor === "all" || options.actors.some((row) => row.id === actor)
      ? options.actors
      : [...options.actors, { id: actor, name: "Deleted admin" }]

  const filtered =
    Boolean(search.trim()) ||
    action !== "all" ||
    resource !== "all" ||
    actor !== "all"
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <DashboardTable
        title="Activity log"
        icon={<ScrollTextIcon className="text-muted-foreground" />}
        count={total}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        controls={
          <>
            <DashboardToolbarSearch
              name="audit-search"
              aria-label="Search activity"
              placeholder="Search person, detail or id..."
              value={search}
              onChange={(event) => {
                setPage(1)
                setSearch(event.target.value)
              }}
            />
            <Select
              value={action}
              onValueChange={(value) => {
                setPage(1)
                setAction(value)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by action">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actionOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {actionLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={resource}
              onValueChange={(value) => {
                setPage(1)
                setResource(value)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by what changed">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything</SelectItem>
                {resourceOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {resourceLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={actor}
              onValueChange={(value) => {
                setPage(1)
                setActor(value)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by admin">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {actorOptions.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
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
          <TableHeader>
            <TableRow>
              {sortableColumns.map((column) => (
                <TableHead
                  key={column.by}
                  column={column.column}
                  className={column.className}
                  aria-sort={
                    sort === column.by
                      ? direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <TableSortButton
                    active={sort === column.by}
                    direction={direction}
                    onClick={() => toggleSort(column.by)}
                  >
                    {column.label}
                  </TableSortButton>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        }
        isEmpty={entries.length === 0}
        emptyText={
          filtered
            ? "Nothing matches those filters."
            : "No admin activity has been recorded yet."
        }
        emptyColSpan={sortableColumns.length}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total,
          totalPages,
          onPageChange: setPage,
          onPageSizeChange: (nextSize) => {
            setPage(1)
            setPageSize(nextSize)
          },
        }}
      >
        {entries.map((entry) => (
          <TableRow key={entry.id} className="group">
            <TableCell column="main">
              <button
                type="button"
                className="line-clamp-2 text-left text-sm font-medium whitespace-normal group-hover:underline"
                title={activitySentence(entry)}
                onClick={() => setViewing(entry)}
              >
                {activitySentence(entry)}
              </button>
            </TableCell>
            <TableCell column="meta" className="hidden lg:table-cell">
              <Badge variant="outline">{resourceLabel(entry.resource)}</Badge>
            </TableCell>
            <TableCell column="mutedMeta">
              {formatDateTime(entry.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <AuditEntryDialog entry={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

function sortByLabel(values: string[], label: (value: string) => string) {
  return [...values].sort((a, b) => label(a).localeCompare(label(b)))
}

/** The whole entry, including the record ids that never fit in a table cell. */
function AuditEntryDialog({
  entry,
  onClose,
}: {
  entry: AuditLogRow | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {entry ? activitySentence(entry) : "Activity"}
          </DialogTitle>
          <DialogDescription>
            {entry
              ? formatDateTime(entry.createdAt)
              : "What happened, who did it and when."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>What happened</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <DetailRow
                label="Action"
                value={entry ? actionLabel(entry.action) : null}
              />
              <DetailRow
                label="What changed"
                value={entry ? resourceLabel(entry.resource) : null}
              />
              <DetailRow
                label={entry?.changedFields ? "Fields changed" : "Details"}
                value={
                  entry?.changedFields
                    ? entry.changedFields.join(", ")
                    : (entry?.detail ?? null)
                }
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Who and when</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <DetailRow label="Name" value={entry ? actorLabel(entry) : null} />
              <DetailRow label="Email" value={entry?.actorEmail ?? null} />
              <DetailRow
                label="Time"
                value={entry ? formatDateTime(entry.createdAt) : null}
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Records affected</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {entry?.records.length ? (
                <ul className="grid gap-2">
                  {entry.records.map((record) => (
                    <li key={record.id} className="grid gap-0.5">
                      <span className="text-sm">
                        {record.name ?? "No longer exists"}
                      </span>
                      <span className="font-mono text-xs break-all text-muted-foreground">
                        {record.id}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This entry does not name a record.
                </p>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm break-words text-muted-foreground">
        {value ?? "—"}
      </span>
    </div>
  )
}
