import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  Loader2Icon,
  PlayIcon,
  SettingsIcon,
  Trash2Icon,
  UserMinusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { CopyDialog } from "@/components/social/copy-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { PnlAmount } from "@/components/trade/pnl-amount"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  getCopyErrorMessage,
  readViewerRelation,
  resumeCopying,
  setFollowing,
  stopCopying,
  unfollowMany,
} from "@/lib/api/trade/copy-trading"
import type { FollowingRow, ViewerRelation } from "@/lib/trade/copy/copy-rules"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatWholeUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { signedWholeUsd } from "@/lib/trade/public-profile/share-image"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Column = "trader" | "made" | "copy" | "copyMade"

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "trader", label: "Trader", column: "main" },
  { key: "made", label: "Made in 30 days", column: "meta" },
  { key: "copy", label: "Your copy", column: "meta" },
  {
    key: "copyMade",
    label: "Your copy made",
    column: "meta",
    className: "hidden md:table-cell",
  },
]

function copyRank(row: FollowingRow): number {
  if (!row.copy) return 2
  return row.copy.status === "active" ? 0 : 1
}

/**
 * Everybody the member follows or copies, with each trader's 30-day figure
 * and each copy's state. A copy's Settings changes its limits; the bin stops
 * it, asking the one question stopping needs.
 */
export function FollowingPage({ rows }: { rows: FollowingRow[] }) {
  const router = useRouter()
  const { config } = useShellRuntime()
  const selection = useSelection()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [stopping, setStopping] = React.useState<FollowingRow | null>(null)
  const [editing, setEditing] = React.useState<{
    row: FollowingRow
    relation: ViewerRelation
  } | null>(null)
  const { sort, direction, toggleSort } = useTableSort<Column>(
    "copy",
    "asc",
    (column) => (column === "trader" || column === "copy" ? "asc" : "desc")
  )

  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((left, right) => {
      const order =
        sort === "trader"
          ? left.handle.localeCompare(right.handle)
          : sort === "made"
            ? (left.made30d ?? -Infinity) - (right.made30d ?? -Infinity)
            : sort === "copy"
              ? copyRank(left) - copyRank(right)
              : (left.copy?.madeUsd ?? 0) - (right.copy?.madeUsd ?? 0)
      return factor * order || left.handle.localeCompare(right.handle)
    })
  }, [direction, rows, sort])

  const { visible, footer } = useClientPage(
    sorted,
    config.dashboardRowsPerPage,
    `${sort}|${direction}`
  )
  const visibleIds = visible.map((row) => row.handle)

  async function refresh() {
    await router.invalidate()
  }

  async function unfollowSelected() {
    const handles = [...selection.selected]
    setBusy("bulk")
    try {
      const result = await unfollowMany(handles)
      await refresh()
      selection.clear()
      const message = describeBulkResult({
        done: result.done.length,
        kept: result.kept.length,
        one: "trader",
        many: "traders",
        verb: "unfollowed",
      })
      if (result.kept.length > 0) {
        showErrorToast(
          `${message} Stop copying a trader before you unfollow them.`
        )
      } else toast.success(message)
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function unfollow(row: FollowingRow) {
    setBusy(row.handle)
    try {
      await setFollowing(row.handle, false)
      await refresh()
      toast.success(`You stopped following @${row.handle}.`)
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function resume(row: FollowingRow) {
    if (!row.copy) return
    setBusy(row.handle)
    try {
      await resumeCopying(row.copy.id)
      await refresh()
      toast.success(`Copying @${row.handle} again.`)
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function openSettings(row: FollowingRow) {
    setBusy(row.handle)
    try {
      const relation = await readViewerRelation(row.handle)
      if (relation) setEditing({ row, relation })
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <DashboardTable
        title="Following"
        count={rows.length}
        busy={busy === "bulk"}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          selection.selected.size ? (
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={busy === "bulk"}
              onClick={() => void unfollowSelected()}
            >
              <UserMinusIcon className="size-4" />
              Unfollow ({selection.selected.size})
            </DashboardToolbarButton>
          ) : null
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="traders"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={rows.length === 0}
        emptyText="You follow nobody yet. Find a trader on the Traders page, then press Follow or Copy on their profile."
        emptyColSpan={6}
        footer={footer}
      >
        {visible.map((row) => (
          <TableRow key={row.handle}>
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(row.handle)}
                onCheckedChange={() => selection.toggle(row.handle)}
                aria-label={`Select @${row.handle}`}
              />
            </TableCell>
            <TableCell column="main">
              <a
                href={`/t/${row.handle}`}
                className="flex max-w-72 items-center gap-2 hover:underline"
              >
                <Avatar size="sm">
                  {row.picture ? <AvatarImage src={row.picture} alt="" /> : null}
                  <AvatarFallback>
                    {row.displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-medium">
                  {row.displayName}{" "}
                  <span className="font-normal text-muted-foreground">
                    @{row.handle}
                  </span>
                </span>
              </a>
            </TableCell>
            <TableCell column="meta">
              {row.made30d === null ? (
                <span className="text-muted-foreground">Not public</span>
              ) : (
                <PnlAmount
                  className={cn("tabular-nums", moneyTone(Math.round(row.made30d)))}
                >
                  {signedWholeUsd(row.made30d)}
                </PnlAmount>
              )}
            </TableCell>
            <TableCell column="meta">
              {row.copy ? (
                <>
                  <Badge
                    variant={row.copy.status === "active" ? "outline" : "destructive"}
                  >
                    {row.copy.status === "active" ? "Copying" : "Paused"}
                  </Badge>
                  <span className="mt-1 block max-w-64 truncate text-xs text-muted-foreground">
                    {formatWholeUsd(row.copy.settings.dollarsPerTrade)} a trade
                    from {row.copy.traderVenue} into {row.copy.walletLabel}
                    {row.copy.walletKind === "paper" ? " (practice)" : ""}
                  </span>
                  {row.copy.pausedWords ? (
                    <span
                      className="mt-1 block max-w-64 text-xs text-muted-foreground"
                      title={row.copy.pausedWords}
                    >
                      {row.copy.pausedWords}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">Following only</span>
              )}
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {row.copy ? (
                <PnlAmount
                  className={cn(
                    "tabular-nums",
                    moneyTone(Math.round(row.copy.madeUsd))
                  )}
                >
                  {signedWholeUsd(row.copy.madeUsd)}
                </PnlAmount>
              ) : (
                <span className="text-muted-foreground">&mdash;</span>
              )}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center justify-end gap-1">
                {busy === row.handle ? (
                  <Loader2Icon
                    className="size-4 animate-spin"
                    aria-label="Working"
                  />
                ) : null}
                {row.copy?.status === "paused" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void resume(row)}
                  >
                    <PlayIcon className="size-4" />
                    Resume
                  </Button>
                ) : null}
                {row.copy ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy !== null}
                    aria-label={`Copy settings for @${row.handle}`}
                    onClick={() => void openSettings(row)}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy !== null}
                  aria-label={
                    row.copy
                      ? `Stop copying @${row.handle}`
                      : `Unfollow @${row.handle}`
                  }
                  onClick={() =>
                    row.copy ? setStopping(row) : void unfollow(row)
                  }
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <StopCopyDialog
        row={stopping}
        onClose={() => setStopping(null)}
        onStopped={refresh}
      />
      {editing?.row.copy ? (
        <CopyDialog
          open
          handle={editing.row.handle}
          relation={editing.relation}
          copy={editing.row.copy}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </>
  )
}

/**
 * Stopping a copy asks one question: close the copied positions now, or leave
 * them open and only stop new copies. Closing uses the chased limit order a
 * part close uses, never a market order.
 */
function StopCopyDialog({
  row,
  onClose,
  onStopped,
}: {
  row: FollowingRow | null
  onClose: () => void
  onStopped: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState<"close" | "leave" | null>(null)

  async function stop(closePositions: boolean) {
    if (!row?.copy) return
    setBusy(closePositions ? "close" : "leave")
    try {
      const { closing } = await stopCopying(row.copy.id, closePositions)
      await onStopped()
      toast.success(
        closePositions
          ? closing > 0
            ? `Stopped copying @${row.handle}. Closing ${closing} ${closing === 1 ? "position" : "positions"} with limit orders that follow the price.`
            : `Stopped copying @${row.handle}. It had no open positions.`
          : `Stopped copying @${row.handle}. Your copied positions stay open.`
      )
      onClose()
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open && busy === null) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stop copying @{row?.handle}</DialogTitle>
          <DialogDescription>
            No new trades are copied from now on. What happens to the positions
            the copy already opened is your choice.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent className="grid gap-2 text-sm">
              <p>
                <span className="font-medium">Close them now</span> sells each
                copied position with a limit order that follows the price until
                it fills.
              </p>
              <p>
                <span className="font-medium">Leave them open</span> keeps them
                in your wallet, with any stop you set, to close yourself.
              </p>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void stop(false)}
          >
            {busy === "leave" ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            Leave them open
          </Button>
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() => void stop(true)}
          >
            {busy === "close" ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            Close them now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
