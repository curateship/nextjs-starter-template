import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  CopyIcon,
  Loader2Icon,
  MailIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { useShellRuntime } from "@/components/shell/shell-layout"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  createBroadcast,
  deleteBroadcasts,
  duplicateBroadcast,
  getBroadcastErrorMessage,
  type BroadcastListItem,
  type BroadcastsPage,
} from "@/lib/api/broadcasts"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { formatDate } from "@/lib/format-time"
import { quoteOneLine } from "@/lib/quote-text"
import { useLastValue } from "@/lib/use-last-value"
import { useSelection } from "@/lib/use-selection"

type SortColumn = "name" | "status" | "updated"

const STATUS_LABELS: Record<BroadcastListItem["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
}

/** How far along a send is, in plain numbers rather than a percentage. */
function progressText(item: BroadcastListItem) {
  if (item.status === "draft") return "Not sent yet"
  const failed =
    item.totalFailed > 0 ? ` · ${item.totalFailed} did not go through` : ""
  return `${item.totalSent} of ${item.totalRecipients} sent${failed}`
}

export function BroadcastsListPage({ initial }: { initial: BroadcastsPage }) {
  const navigate = useNavigate()
  const { config } = useShellRuntime()
  const [broadcasts, setBroadcasts] = React.useState(initial.broadcasts)
  const [sort, setSort] = React.useState<SortColumn>("updated")
  const [direction, setDirection] = React.useState<TableSortDirection>("desc")
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<BroadcastListItem | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const selection = useSelection()
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  // The confirmation is still fading out after Cancel has cleared the target,
  // so its heading keeps reading the name it opened with.
  const closingDeleteTarget = useLastValue(deleteTarget)

  const toggleSort = (column: SortColumn) => {
    if (column === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDirection("asc")
  }

  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const query = search.trim().toLowerCase()
    return broadcasts
      .filter(
        (item) =>
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.subject.toLowerCase().includes(query)
      )
      .sort((left, right) => {
        if (sort === "name") return factor * left.name.localeCompare(right.name)
        if (sort === "status") {
          return factor * left.status.localeCompare(right.status)
        }
        return factor * left.updated_at.localeCompare(right.updated_at)
      })
  }, [broadcasts, direction, search, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  // Clamped rather than reset in an effect: changing the search or the page
  // size can leave `page` past the end of the shorter list, and correcting it
  // here shows the right rows in the same render instead of one render later.
  const currentPage = Math.min(page, totalPages)
  const visible = React.useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, sorted]
  )

  const openEditor = (broadcastId: string) =>
    navigate({
      to: "/admin/newsletter/$broadcastId",
      params: { broadcastId },
    })

  const handleCreate = async () => {
    if (creating || !createName.trim()) return
    setCreating(true)
    try {
      const created = await createBroadcast(createName)
      dismissErrorToast()
      toast.success(`Created "${created.name}".`)
      setCreateOpen(false)
      setCreateName("")
      await openEditor(created.id)
    } catch (error) {
      showErrorToast(getBroadcastErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  const handleDuplicate = async (item: BroadcastListItem) => {
    if (duplicatingId) return
    setDuplicatingId(item.id)
    try {
      const copy = await duplicateBroadcast(item.id)
      dismissErrorToast()
      setBroadcasts((current) => [copy, ...current])
      toast.success(`Copied as "${copy.name}".`)
    } catch (error) {
      showErrorToast(getBroadcastErrorMessage(error))
    } finally {
      setDuplicatingId(null)
    }
  }

  /** Both the single row and the selection go through here. */
  const removeMany = async (ids: string[], done: () => void) => {
    if (deleting || ids.length === 0) return
    setDeleting(true)
    try {
      const { deleted } = await deleteBroadcasts(ids)
      dismissErrorToast()
      const gone = new Set(ids)
      setBroadcasts((current) => current.filter((item) => !gone.has(item.id)))
      selection.clear()
      toast.success(
        deleted === 1 ? "Deleted it." : `Deleted ${deleted} newsletters.`
      )
      done()
    } catch (error) {
      showErrorToast(getBroadcastErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  const visibleIds = visible.map((item) => item.id)
  const selectedCount = selection.selected.size

  return (
    <>
      <DashboardTable
        title="Newsletter"
        icon={<MailIcon />}
        count={sorted.length}
        selectedCount={selectedCount}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedCount ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => setMassDeleteOpen(true)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="broadcast-search"
              aria-label="Search newsletters"
              placeholder="Search newsletters…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New newsletter
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select the newsletters on this page"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                >
                  Name
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
              <TableHead column="meta">Sent</TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "updated"}
                  direction={direction}
                  onClick={() => toggleSort("updated")}
                >
                  Updated
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sorted.length === 0}
        emptyText={
          search.trim()
            ? "Nothing matches that search."
            : "No newsletters yet. Write the first one."
        }
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sorted.length,
          totalPages,
          onPageChange: (next) =>
            setPage(Math.max(1, Math.min(next, totalPages))),
          onPageSizeChange: (next) => {
            setPage(1)
            setPageSize(next)
          },
        }}
      >
        {visible.map((item) => (
          <TableRow
            key={item.id}
            className="group"
            rowAction={() => void openEditor(item.id)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(item.id)}
                onCheckedChange={() => selection.toggle(item.id)}
                aria-label={`Select ${item.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <Link
                to="/admin/newsletter/$broadcastId"
                params={{ broadcastId: item.id }}
                className="block max-w-96 truncate text-left font-medium underline-offset-2 group-hover:underline"
                title={item.name}
              >
                {item.name}
              </Link>
            </TableCell>
            <TableCell column="meta">
              <Badge variant={item.status === "paused" ? "destructive" : "secondary"}>
                {STATUS_LABELS[item.status]}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta">{progressText(item)}</TableCell>
            <TableCell column="mutedMeta">{formatDate(item.updated_at)}</TableCell>
            <TableCell column="actions">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Make a copy of ${item.name}`}
                  disabled={duplicatingId !== null}
                  onClick={() => void handleDuplicate(item)}
                >
                  {duplicatingId === item.id ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Open ${item.name}`}
                  onClick={() => void openEditor(item.id)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => setDeleteTarget(item)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {/* FormDialog, not Dialog: a typed name is work, so every way out asks
          before throwing it away. */}
      <FormDialog
        open={createOpen}
        dirty={Boolean(createName.trim())}
        busy={creating}
        onClose={() => setCreateOpen(false)}
      >
        {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New newsletter</DialogTitle>
            <DialogDescription>
              Name it — only you see this name — then write it in the editor.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="broadcast-name">Name</Label>
                  <Input
                    id="broadcast-name"
                    value={createName}
                    maxLength={255}
                    autoFocus
                    placeholder="March update"
                    onChange={(event) => setCreateName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return
                      event.preventDefault()
                      void handleCreate()
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creating || !createName.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Create it
            </Button>
          </DialogFooter>
        </DialogContent>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={
          closingDeleteTarget
            ? `Delete ${quoteOneLine(closingDeleteTarget.name)}?`
            : "Delete this newsletter?"
        }
        description="The email and everything in it goes for good. Anything already sent stays sent — this cannot unsend it."
        confirmLabel="Delete it"
        loading={deleting}
        onConfirm={() =>
          void removeMany(deleteTarget ? [deleteTarget.id] : [], () =>
            setDeleteTarget(null)
          )
        }
      />

      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedCount} newsletter${selectedCount === 1 ? "" : "s"}?`}
        description="They go for good, along with everything written in them. Anything already sent stays sent — this cannot unsend it."
        confirmLabel={`Delete ${selectedCount}`}
        loading={deleting}
        onConfirm={() =>
          void removeMany([...selection.selected], () =>
            setMassDeleteOpen(false)
          )
        }
      />
    </>
  )
}
