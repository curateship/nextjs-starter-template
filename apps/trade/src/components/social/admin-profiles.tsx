import * as React from "react"
import {
  EyeIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  getPublicProfileErrorMessage,
  loadAdminProfiles,
  setAdminProfileHidden,
  type AdminProfileRow,
} from "@/lib/api/trade/public-profiles"
import { formatDate } from "@/lib/format/format-time"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type Column = "profile" | "status" | "reports" | "updated"

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "profile", label: "Profile", column: "main" },
  { key: "status", label: "Status", column: "meta" },
  { key: "reports", label: "Reports", column: "meta" },
  {
    key: "updated",
    label: "Updated",
    column: "meta",
    className: "hidden md:table-cell",
  },
]

function statusOf(row: AdminProfileRow): { label: string; rank: number } {
  if (row.hiddenAt !== null) return { label: "Hidden", rank: 0 }
  if (row.enabled) return { label: "Public", rank: 1 }
  return { label: "Off", rank: 2 }
}

/**
 * Admin → Profiles: every saved public profile, its reports, and the switch
 * that hides one from the public and the leaderboard. Hiding never deletes
 * anything; the member reads the reason in their own Public profile window.
 */
export function AdminProfilesPage({ initial }: { initial: AdminProfileRow[] }) {
  const { config } = useShellRuntime()
  const [rows, setRows] = React.useState(initial)
  const [search, setSearch] = React.useState("")
  const [hiding, setHiding] = React.useState<AdminProfileRow | null>(null)
  const [showing, setShowing] = React.useState<string | null>(null)
  const { sort, direction, toggleSort } = useTableSort<Column>(
    "reports",
    "desc",
    (column) => (column === "profile" ? "asc" : "desc")
  )

  const refresh = React.useCallback(async () => {
    setRows(await loadAdminProfiles())
  }, [])

  const sorted = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    const kept = needle
      ? rows.filter((row) =>
          [row.handle, row.displayName, row.email].some((value) =>
            value.toLowerCase().includes(needle)
          )
        )
      : rows
    const factor = direction === "asc" ? 1 : -1
    return [...kept].sort((left, right) => {
      const order =
        sort === "profile"
          ? left.handle.localeCompare(right.handle)
          : sort === "status"
            ? statusOf(left).rank - statusOf(right).rank
            : sort === "reports"
              ? left.reports - right.reports
              : left.updatedAt - right.updatedAt
      return factor * order || left.handle.localeCompare(right.handle)
    })
  }, [direction, rows, search, sort])

  const { visible, footer } = useClientPage(
    sorted,
    config.dashboardRowsPerPage,
    `${search}|${sort}|${direction}`
  )

  async function show(row: AdminProfileRow) {
    setShowing(row.userId)
    try {
      await setAdminProfileHidden(row.userId, null)
      await refresh()
      toast.success(`@${row.handle} is public again.`)
    } catch (error) {
      showErrorToast(getPublicProfileErrorMessage(error))
    } finally {
      setShowing(null)
    }
  }

  return (
    <>
      <DashboardTable
        title="Profiles"
        count={sorted.length}
        controls={
          <DashboardToolbarSearch
            name="profile-search"
            aria-label="Search profiles"
            placeholder="Search handle, name or email..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
        isEmpty={sorted.length === 0}
        emptyText={
          search.trim()
            ? "No profiles match that search."
            : "No member has saved a public profile yet."
        }
        emptyColSpan={5}
        footer={footer}
      >
        {visible.map((row) => {
          const status = statusOf(row)
          return (
            <TableRow key={row.userId}>
              <TableCell column="main">
                <span className="block max-w-72 truncate text-sm font-medium">
                  {row.displayName}{" "}
                  <span className="font-normal text-muted-foreground">
                    @{row.handle}
                  </span>
                </span>
                <span className="block max-w-72 truncate text-xs text-muted-foreground">
                  {row.email}
                </span>
              </TableCell>
              <TableCell column="meta">
                <Badge variant={status.rank === 0 ? "destructive" : "outline"}>
                  {status.label}
                </Badge>
                {row.hiddenReason ? (
                  <span
                    className="mt-1 block max-w-56 truncate text-xs text-muted-foreground"
                    title={row.hiddenReason}
                  >
                    {row.hiddenReason}
                  </span>
                ) : null}
              </TableCell>
              <TableCell column="meta">
                <span className="tabular-nums">{row.reports}</span>
                {row.lastReport ? (
                  <span
                    className="mt-1 block max-w-64 truncate text-xs text-muted-foreground"
                    title={row.lastReport}
                  >
                    {row.lastReportAt
                      ? `${formatDate(new Date(row.lastReportAt))}: `
                      : ""}
                    {row.lastReport}
                  </span>
                ) : null}
              </TableCell>
              <TableCell column="meta" className="hidden md:table-cell">
                {formatDate(new Date(row.updatedAt))}
              </TableCell>
              <TableCell column="actions">
                <div className="flex items-center justify-end gap-1">
                  <Button asChild size="icon-sm" variant="ghost">
                    <a
                      href={`/t/${row.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open @${row.handle}'s page`}
                    >
                      <ExternalLinkIcon className="size-4" />
                    </a>
                  </Button>
                  {row.hiddenAt === null ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setHiding(row)}
                    >
                      <EyeOffIcon className="size-4" />
                      Hide
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={showing === row.userId}
                      onClick={() => void show(row)}
                    >
                      {showing === row.userId ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                      Show again
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>
      <HideProfileDialog
        row={hiding}
        onClose={() => setHiding(null)}
        onHidden={async () => {
          await refresh()
        }}
      />
    </>
  )
}

function HideProfileDialog({
  row,
  onClose,
  onHidden,
}: {
  row: AdminProfileRow | null
  onClose: () => void
  onHidden: () => Promise<void>
}) {
  const [reason, setReason] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)

  const close = () => {
    setReason("")
    setInvalid(false)
    onClose()
  }

  async function hide() {
    if (!row) return
    if (!reason.trim()) {
      setInvalid(true)
      showErrorToast(
        "Write the reason the member will read before hiding the profile."
      )
      return
    }
    dismissErrorToast()
    setSaving(true)
    try {
      await setAdminProfileHidden(row.userId, reason)
      await onHidden()
      toast.success(`@${row.handle} is hidden from the public.`)
      close()
    } catch (error) {
      showErrorToast(getPublicProfileErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={row !== null}
      dirty={reason.trim().length > 0}
      busy={saving}
      onClose={close}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hide @{row?.handle}</DialogTitle>
            <DialogDescription>
              The page and its leaderboard row disappear for everybody. The
              member&apos;s trade record is not touched, and Show again brings
              it all back.
            </DialogDescription>
          </DialogHeader>
          <form
            // The body scrolls only as a flex child of the window.
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void hide()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardContent className="grid gap-2">
                  <Label htmlFor="profile-hide-reason">
                    Reason the member will read
                  </Label>
                  <Textarea
                    id="profile-hide-reason"
                    value={reason}
                    maxLength={500}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => {
                      setReason(event.target.value)
                      if (event.target.value.trim()) setInvalid(false)
                    }}
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={saving}>
                {saving ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Hide profile
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
