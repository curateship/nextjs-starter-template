import * as React from "react"
import {
  BanIcon,
  CheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SendIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  getCopyErrorMessage,
  readCopyAdmin,
  saveCopyAdminConfig,
  sendAdminPayout,
  setAdminTradersCopyBlocked,
  type CopyAdmin,
} from "@/lib/api/trade/copy-trading"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatUsd } from "@/lib/trade/format"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type Trader = CopyAdmin["traders"][number]
type Column = "trader" | "status" | "copiers" | "owed" | "paid"

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "trader", label: "Trader", column: "main" },
  { key: "status", label: "Copying", column: "meta" },
  { key: "copiers", label: "Copiers", column: "meta" },
  { key: "owed", label: "Owed", column: "meta" },
  {
    key: "paid",
    label: "Paid",
    column: "meta",
    className: "hidden md:table-cell",
  },
]

function statusOf(row: Trader): { label: string; rank: number } {
  if (row.blocked) return { label: "Stopped by admin", rank: 0 }
  if (row.allowCopying) return { label: "Open", rank: 1 }
  return { label: "Off", rank: 2 }
}

/**
 * Admin → Copy trading: the fee, the trader's share, the switch for
 * real-money copying, what each trader is owed with a way to mark a payout
 * sent, and a per-trader stop on new copies. Nothing here closes anybody's
 * position.
 */
export function AdminCopyTradingPage({ initial }: { initial: CopyAdmin }) {
  const [data, setData] = React.useState(initial)
  const refresh = React.useCallback(async () => {
    setData(await readCopyAdmin())
  }, [])
  return (
    <>
      <CopySettingsCard data={data} onSaved={refresh} />
      <TradersTable data={data} onChanged={refresh} />
    </>
  )
}

function CopySettingsCard({
  data,
  onSaved,
}: {
  data: CopyAdmin
  onSaved: () => Promise<void>
}) {
  const saved = React.useMemo(
    () => ({
      fee: String(Number((data.config.feeRate * 100).toFixed(4))),
      share: String(Number((data.config.traderShare * 100).toFixed(2))),
      realMoney: data.config.realMoney,
    }),
    [data.config]
  )
  const [form, setForm] = React.useState(saved)
  const [lastSaved, setLastSaved] = React.useState(saved)
  if (saved !== lastSaved) {
    setLastSaved(saved)
    setForm(saved)
  }
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState<"fee" | "share" | null>(null)

  async function save() {
    const feeRate = Number(form.fee) / 100
    const traderShare = Number(form.share) / 100
    if (!(feeRate >= 0 && feeRate <= 0.001)) {
      setInvalid("fee")
      showErrorToast(
        "The fee can be at most 0.1%, the most Hyperliquid lets an app add."
      )
      return
    }
    if (!(traderShare >= 0 && traderShare <= 1)) {
      setInvalid("share")
      showErrorToast("The trader's share must be between 0% and 100%.")
      return
    }
    dismissErrorToast()
    setInvalid(null)
    setBusy(true)
    try {
      await saveCopyAdminConfig({
        feeRate,
        traderShare,
        realMoney: form.realMoney,
      })
      await onSaved()
      toast.success("Copy trading settings saved.")
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const exampleFee = 200 * (Number(form.fee) / 100)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Copy trading</CardTitle>
        <CardDescription>
          The fee on each copied real-money trade and how much of it the trader
          is owed. Practice copies are always free.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="copy-fee"
                hint="Hyperliquid caps an app's fee on perps at 0.1%."
              >
                Fee on each copied trade, %
              </FieldLabel>
              <Input
                id="copy-fee"
                inputMode="decimal"
                value={form.fee}
                aria-invalid={invalid === "fee" || undefined}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fee: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="copy-share">Trader&apos;s share of the fee, %</Label>
              <Input
                id="copy-share"
                inputMode="decimal"
                value={form.share}
                aria-invalid={invalid === "share" || undefined}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    share: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {Number.isFinite(exampleFee) && exampleFee >= 0
              ? `A $200 copied trade pays ${formatUsd(exampleFee)}, of which the trader is owed ${formatUsd(exampleFee * (Number(form.share) / 100 || 0))}.`
              : "Type a fee to see what a $200 copy pays."}
          </p>
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1 text-sm">
              <Label htmlFor="copy-real-money">Real-money copying</Label>
              <p className="text-muted-foreground">
                {data.builderAddress
                  ? `Fees go to ${data.builderAddress}.`
                  : "No fee address is set on the server (TRADE_BUILDER_ADDRESS), so real money cannot copy even when this is on."}
              </p>
            </div>
            <Switch
              id="copy-real-money"
              checked={form.realMoney}
              onCheckedChange={(realMoney) =>
                setForm((current) => ({ ...current, realMoney }))
              }
            />
          </div>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}

function TradersTable({
  data,
  onChanged,
}: {
  data: CopyAdmin
  onChanged: () => Promise<void>
}) {
  const { config } = useShellRuntime()
  const selection = useSelection()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [paying, setPaying] = React.useState<Trader | null>(null)
  const { sort, direction, toggleSort } = useTableSort<Column>(
    "owed",
    "desc",
    (column) => (column === "trader" || column === "status" ? "asc" : "desc")
  )
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...data.traders].sort((left, right) => {
      const order =
        sort === "trader"
          ? left.handle.localeCompare(right.handle)
          : sort === "status"
            ? statusOf(left).rank - statusOf(right).rank
            : sort === "copiers"
              ? left.copiers - right.copiers
              : sort === "owed"
                ? left.owedUsd - right.owedUsd
                : left.paidUsd - right.paidUsd
      return factor * order || left.handle.localeCompare(right.handle)
    })
  }, [data.traders, direction, sort])
  const { visible, footer } = useClientPage(
    sorted,
    config.dashboardRowsPerPage,
    `${sort}|${direction}`
  )
  const visibleIds = visible.map((row) => row.userId)

  async function block(userIds: string[], blocked: boolean, key: string) {
    setBusy(key)
    try {
      const result = await setAdminTradersCopyBlocked(userIds, blocked)
      await onChanged()
      selection.clear()
      toast.success(
        describeBulkResult({
          done: result.done.length,
          kept: result.kept.length,
          one: "trader",
          many: "traders",
          verb: blocked ? "stopped" : "opened again",
        })
      )
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <DashboardTable
        title="Traders"
        count={data.traders.length}
        busy={busy === "bulk"}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          selection.selected.size ? (
            <>
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  void block([...selection.selected], false, "bulk")
                }
              >
                <CheckIcon className="size-4" />
                Allow new copies ({selection.selected.size})
              </DashboardToolbarButton>
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void block([...selection.selected], true, "bulk")}
              >
                <BanIcon className="size-4" />
                Stop new copies ({selection.selected.size})
              </DashboardToolbarButton>
            </>
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
        isEmpty={data.traders.length === 0}
        emptyText="No trader allows copying yet, and nobody is owed anything."
        emptyColSpan={7}
        footer={footer}
      >
        {visible.map((row) => {
          const status = statusOf(row)
          return (
            <TableRow key={row.userId}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(row.userId)}
                  onCheckedChange={() => selection.toggle(row.userId)}
                  aria-label={`Select @${row.handle}`}
                />
              </TableCell>
              <TableCell column="main">
                <span className="block max-w-72 truncate text-sm font-medium">
                  @{row.handle}
                </span>
                <span className="block max-w-72 truncate text-xs text-muted-foreground">
                  {row.email}
                </span>
              </TableCell>
              <TableCell column="meta">
                <Badge variant={status.rank === 0 ? "destructive" : "outline"}>
                  {status.label}
                </Badge>
              </TableCell>
              <TableCell column="meta" className="tabular-nums">
                {row.copiers}
              </TableCell>
              <TableCell column="meta" className="tabular-nums">
                {formatUsd(row.owedUsd)}
                <span className="mt-1 block max-w-56 truncate font-mono text-xs text-muted-foreground">
                  {row.payoutAddress ?? "No payout address yet"}
                </span>
              </TableCell>
              <TableCell
                column="meta"
                className="hidden tabular-nums md:table-cell"
              >
                {formatUsd(row.paidUsd)}
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => {
                      if (row.owedUsd < 0.01) {
                        showErrorToast(`Nothing is owed to @${row.handle} right now.`)
                        return
                      }
                      setPaying(row)
                    }}
                  >
                    <SendIcon className="size-4" />
                    Mark paid
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      void block([row.userId], !row.blocked, row.userId)
                    }
                  >
                    {busy === row.userId ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : row.blocked ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <BanIcon className="size-4" />
                    )}
                    {row.blocked ? "Allow new copies" : "Stop new copies"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>
      <PayoutDialog
        row={paying}
        onClose={() => setPaying(null)}
        onPaid={onChanged}
      />
    </>
  )
}

function PayoutDialog({
  row,
  onClose,
  onPaid,
}: {
  row: Trader | null
  onClose: () => void
  onPaid: () => Promise<void>
}) {
  const [amount, setAmount] = React.useState("")
  const [link, setLink] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState<"amount" | "link" | null>(null)
  const [lastRow, setLastRow] = React.useState(row)
  if (row !== lastRow) {
    setLastRow(row)
    setAmount(row ? row.owedUsd.toFixed(2) : "")
    setLink("")
    setInvalid(null)
  }

  async function pay() {
    if (!row) return
    const amountUsd = Number(amount)
    if (!(amountUsd > 0) || amountUsd > row.owedUsd + 0.01) {
      setInvalid("amount")
      showErrorToast(
        `The payout must be more than $0 and at most the ${formatUsd(row.owedUsd)} owed.`
      )
      return
    }
    if (!/^https:\/\/\S+$/.test(link.trim())) {
      setInvalid("link")
      showErrorToast("Paste the transaction's link, starting with https://.")
      return
    }
    dismissErrorToast()
    setBusy(true)
    try {
      await sendAdminPayout({
        traderUserId: row.userId,
        amountUsd,
        txLink: link.trim(),
      })
      await onPaid()
      toast.success(`${formatUsd(amountUsd)} to @${row.handle} marked as sent.`)
      onClose()
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={row !== null}
      dirty={link.trim().length > 0}
      busy={busy}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark a payout to @{row?.handle}</DialogTitle>
            <DialogDescription>
              Send the money yourself first, to{" "}
              <span className="font-mono">
                {row?.payoutAddress ?? "the address the trader gives you"}
              </span>
              . This only records that it went.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void pay()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="payout-amount">Dollars sent</Label>
                    <Input
                      id="payout-amount"
                      inputMode="decimal"
                      value={amount}
                      aria-invalid={invalid === "amount" || undefined}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="payout-link">Transaction link</Label>
                    <Input
                      id="payout-link"
                      value={link}
                      placeholder="https://"
                      spellCheck={false}
                      aria-invalid={invalid === "link" || undefined}
                      onChange={(event) => setLink(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Mark as sent
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
