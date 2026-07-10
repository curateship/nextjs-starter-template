import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  type TableSortDirection,
} from "@/components/ui/table"
import {
  deletePaperWallet,
  getPaperErrorMessage,
  resetPaperWallet,
  type PaperWalletItem,
} from "@/lib/api/paper"
import {
  deleteWallet,
  getWalletErrorMessage,
  updateWallet,
  type WalletItem,
} from "@/lib/api/wallets"
import {
  getOnboardingErrorMessage,
  verifyAgentApproval,
} from "@/lib/api/agent-onboarding"
import { shortAddress } from "@/components/scanner/format"
import { ConnectWalletFlow } from "@/components/trading/connect-wallet-flow"
import { NewWalletDialog } from "@/components/trading/new-wallet-dialog"

type WalletRow =
  | { kind: "exchange"; id: string; wallet: WalletItem }
  | { kind: "paper"; id: string; wallet: PaperWalletItem }

type WalletFilter = "all" | "paper" | "exchange-testnet" | "exchange-mainnet"

type SortColumn = "label" | "type" | "network" | "balance" | "status"

const EXPIRY_WARNING_DAYS = 14

const filterLabels: Record<WalletFilter, string> = {
  all: "All types",
  paper: "Paper",
  "exchange-testnet": "Exchange — testnet",
  "exchange-mainnet": "Exchange — mainnet",
}

export function WalletsUnified({
  wallets,
  paperWallets,
  mainnetEnabled,
}: {
  wallets: WalletItem[]
  paperWallets: PaperWalletItem[]
  mainnetEnabled: boolean
}) {
  const router = useRouter()
  const [filter, setFilter] = React.useState<WalletFilter>("all")
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("label")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("asc")
  const [newOpen, setNewOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<WalletItem | null>(null)
  const [editForm, setEditForm] = React.useState({ label: "", isActive: true })
  const [approving, setApproving] = React.useState<WalletItem | null>(null)
  const [pendingAction, setPendingAction] = React.useState<
    | { kind: "delete-exchange"; wallet: WalletItem }
    | { kind: "delete-paper"; wallet: PaperWalletItem }
    | { kind: "reset-paper"; wallet: PaperWalletItem }
    | null
  >(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [verifyingId, setVerifyingId] = React.useState<string | null>(null)
  const [verifyStatus, setVerifyStatus] = React.useState<{
    tone: "error" | "success"
    text: string
  } | null>(null)

  const rows = React.useMemo<WalletRow[]>(() => {
    const merged: WalletRow[] = [
      ...wallets.map((wallet) => ({
        kind: "exchange" as const,
        id: wallet.id,
        wallet,
      })),
      ...paperWallets.map((wallet) => ({
        kind: "paper" as const,
        id: `paper:${wallet.id}`,
        wallet,
      })),
    ]
    const filtered = merged.filter((row) => matchesFilter(row, filter))
    const direction = sortDirection === "asc" ? 1 : -1
    return filtered.sort((a, b) => compareRows(a, b, sortColumn) * direction)
  }, [wallets, paperWallets, filter, sortColumn, sortDirection])

  const disabledNetworkWallets = wallets.filter(
    (wallet) => wallet.network === "mainnet" && !mainnetEnabled
  )

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortColumn(column)
    setSortDirection("asc")
  }

  async function refresh() {
    await router.invalidate()
  }

  async function recheckApproval(wallet: WalletItem) {
    setVerifyingId(wallet.id)
    setVerifyStatus(null)
    try {
      const result = await verifyAgentApproval(wallet.id)
      await refresh()
      setVerifyStatus(
        result.approved
          ? {
              tone: "success",
              text: `${wallet.label}: approval confirmed${
                result.approvalValidUntil
                  ? ` · valid until ${new Date(result.approvalValidUntil).toLocaleDateString()}`
                  : ""
              }`,
            }
          : {
              tone: "error",
              text: `${wallet.label}: approval is no longer active on Hyperliquid — wallet disabled.`,
            }
      )
    } catch (error) {
      setVerifyStatus({ tone: "error", text: getOnboardingErrorMessage(error) })
    } finally {
      setVerifyingId(null)
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) return
    setBusy(true)
    setError(null)
    try {
      if (pendingAction.kind === "delete-exchange") {
        await deleteWallet(pendingAction.wallet.id)
      } else if (pendingAction.kind === "delete-paper") {
        await deletePaperWallet(pendingAction.wallet.id)
      } else {
        await resetPaperWallet(pendingAction.wallet.id)
      }
      await refresh()
      setPendingAction(null)
    } catch (error) {
      setError(
        pendingAction.kind === "delete-exchange"
          ? getWalletErrorMessage(error)
          : getPaperErrorMessage(error)
      )
    } finally {
      setBusy(false)
    }
  }

  const sortableHead = (column: SortColumn, label: string) => (
    <TableSortButton
      active={sortColumn === column}
      direction={sortDirection}
      onClick={() => toggleSort(column)}
    >
      {label}
    </TableSortButton>
  )

  return (
    <div className="w-full pb-8">
      {disabledNetworkWallets.length > 0 ? (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 sm:mb-6 dark:text-amber-400">
          {disabledNetworkWallets.length === 1
            ? `"${disabledNetworkWallets[0].label}" is a mainnet wallet, but mainnet trading is currently switched off (TRADING_ENABLE_MAINNET).`
            : `${disabledNetworkWallets.length} mainnet wallets exist, but mainnet trading is currently switched off (TRADING_ENABLE_MAINNET).`}
        </div>
      ) : null}
      {error && !pendingAction && !editing ? (
        <div className="mb-4 sm:mb-6">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      ) : null}

      <DashboardTable
        title="Wallets"
        icon={<WalletIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={rows.length}
        status={verifyStatus}
        controls={
          <>
            <Select
              value={filter}
              onValueChange={(value) => setFilter(value as WalletFilter)}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter wallets by type">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {(Object.keys(filterLabels) as WalletFilter[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {filterLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              onClick={() => {
                setError(null)
                setNewOpen(true)
              }}
            >
              <PlusIcon className="size-4" />
              New Wallet
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">{sortableHead("label", "Wallet")}</TableHead>
              <TableHead column="meta">{sortableHead("type", "Type")}</TableHead>
              <TableHead column="meta">{sortableHead("network", "Network")}</TableHead>
              <TableHead column="meta">{sortableHead("balance", "Balance")}</TableHead>
              <TableHead column="meta">{sortableHead("status", "Status")}</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={rows.length === 0}
        emptyText={
          filter === "all"
            ? "No wallets yet. Create one to start trading — paper for practice, or connect your Hyperliquid wallet."
            : "No wallets match this filter."
        }
        emptyColSpan={6}
        footer={{ type: "summary", count: rows.length, label: "wallets" }}
      >
        {rows.map((row) =>
          row.kind === "exchange" ? (
            <ExchangeWalletRow
              key={row.id}
              wallet={row.wallet}
              verifying={verifyingId === row.wallet.id}
              onRecheck={() => void recheckApproval(row.wallet)}
              onEdit={() => {
                setError(null)
                setEditForm({
                  label: row.wallet.label,
                  isActive: row.wallet.is_active,
                })
                setEditing(row.wallet)
              }}
              onDelete={() =>
                setPendingAction({ kind: "delete-exchange", wallet: row.wallet })
              }
              onApprove={() => {
                setError(null)
                setApproving(row.wallet)
              }}
            />
          ) : (
            <PaperWalletRow
              key={row.id}
              wallet={row.wallet}
              onReset={() =>
                setPendingAction({ kind: "reset-paper", wallet: row.wallet })
              }
              onDelete={() =>
                setPendingAction({ kind: "delete-paper", wallet: row.wallet })
              }
            />
          )
        )}
      </DashboardTable>

      <NewWalletDialog
        open={newOpen}
        mainnetEnabled={mainnetEnabled}
        onOpenChange={setNewOpen}
        onCreated={refresh}
      />

      <EditWalletDialog
        wallet={editing}
        form={editForm}
        onFormChange={setEditForm}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSaved={refresh}
      />

      <Dialog
        open={Boolean(approving)}
        onOpenChange={(open) => {
          if (!open) setApproving(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {approving?.status === "pending"
                ? "Finish Wallet Approval"
                : "Re-approve Wallet"}
            </DialogTitle>
            <DialogDescription>
              Sign the Hyperliquid approval with your browser wallet. The
              trading key stays the same, so bots keep running.
            </DialogDescription>
          </DialogHeader>
          {approving ? (
            <ConnectWalletFlow
              mode={{ kind: "existing", wallet: approving }}
              mainnetEnabled={mainnetEnabled}
              onDone={() => {
                setApproving(null)
                void refresh()
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.kind === "reset-paper"
                ? "Reset Paper Wallet"
                : "Delete Wallet"}
            </DialogTitle>
            <DialogDescription>
              {pendingAction?.kind === "reset-paper"
                ? "Clears positions, orders, and fills, and restores cash to the starting equity."
                : pendingAction?.kind === "delete-paper"
                  ? "Deletes the wallet with its positions, orders, and fill history."
                  : "This removes the wallet and its encrypted key from this app. It does not revoke the agent on Hyperliquid."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              {pendingAction?.kind === "reset-paper" ? "Reset" : "Delete"}{" "}
              <span className="font-medium">
                {pendingAction?.wallet.label ?? "this wallet"}
              </span>
              ?
            </p>
            {error ? (
              <div className="mt-2">
                <ErrorMessage>{error}</ErrorMessage>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPendingAction(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={
                  pendingAction?.kind === "reset-paper"
                    ? "default"
                    : "destructive"
                }
                disabled={busy}
                onClick={() => void confirmPendingAction()}
              >
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {pendingAction?.kind === "reset-paper" ? "Reset" : "Delete"}
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExchangeWalletRow({
  wallet,
  verifying,
  onRecheck,
  onEdit,
  onDelete,
  onApprove,
}: {
  wallet: WalletItem
  verifying: boolean
  onRecheck: () => void
  onEdit: () => void
  onDelete: () => void
  onApprove: () => void
}) {
  const expiry = expiryState(wallet)
  const needsApproval =
    wallet.status === "pending" || expiry.kind === "expired"

  return (
    <TableRow>
      <TableCell column="main">
        <div className="min-w-0">
          <div className="truncate font-medium">{wallet.label}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {shortAddress(wallet.account_address)}
            {wallet.vault_address
              ? ` · vault ${shortAddress(wallet.vault_address)}`
              : null}
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="outline">Exchange</Badge>
      </TableCell>
      <TableCell column="meta">
        <Badge variant={wallet.network === "mainnet" ? "default" : "secondary"}>
          {wallet.network}
        </Badge>
      </TableCell>
      <TableCell column="mutedMeta">—</TableCell>
      <TableCell column="meta">
        <div className="flex items-center gap-1.5">
          {wallet.status === "pending" ? (
            <Badge variant="secondary">Awaiting approval</Badge>
          ) : wallet.is_active ? (
            <Badge>Active</Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
          {expiry.kind === "expired" ? (
            <Badge variant="destructive">Approval expired</Badge>
          ) : expiry.kind === "expiring" ? (
            <Badge variant="outline">expires in {expiry.days}d</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell column="meta">
        <div className="flex items-center gap-1">
          {needsApproval || expiry.kind === "expiring" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onApprove}
              aria-label={
                wallet.status === "pending"
                  ? `Finish approval for ${wallet.label}`
                  : `Re-approve ${wallet.label}`
              }
              title={
                wallet.status === "pending"
                  ? `Finish approval for ${wallet.label}`
                  : `Re-approve ${wallet.label}`
              }
            >
              <ShieldCheckIcon className="size-4" />
            </Button>
          ) : wallet.status === "active" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={verifying}
              onClick={onRecheck}
              aria-label={`Re-check approval for ${wallet.label}`}
              title={`Re-check approval for ${wallet.label}`}
            >
              {verifying ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ShieldCheckIcon className="size-4" />
              )}
            </Button>
          ) : null}
          {wallet.status === "active" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onEdit}
              aria-label={`Edit ${wallet.label}`}
              title={`Edit ${wallet.label}`}
            >
              <PencilIcon className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${wallet.label}`}
            title={`Delete ${wallet.label}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function PaperWalletRow({
  wallet,
  onReset,
  onDelete,
}: {
  wallet: PaperWalletItem
  onReset: () => void
  onDelete: () => void
}) {
  return (
    <TableRow>
      <TableCell column="main">
        <div className="min-w-0">
          <div className="truncate font-medium">{wallet.label}</div>
          <div className="text-xs text-muted-foreground">
            In-house simulation · fills from live market data
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="outline">Paper</Badge>
      </TableCell>
      <TableCell column="mutedMeta">—</TableCell>
      <TableCell column="meta">
        <span className="font-mono tabular-nums">
          ${wallet.cash.toFixed(2)}
        </span>
      </TableCell>
      <TableCell column="meta">
        <Badge>Active</Badge>
      </TableCell>
      <TableCell column="meta">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={`Reset ${wallet.label}`}
            aria-label={`Reset ${wallet.label}`}
            onClick={onReset}
          >
            <RotateCcwIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={`Delete ${wallet.label}`}
            aria-label={`Delete ${wallet.label}`}
            onClick={onDelete}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function EditWalletDialog({
  wallet,
  form,
  onFormChange,
  onOpenChange,
  onSaved,
}: {
  wallet: WalletItem | null
  form: { label: string; isActive: boolean }
  onFormChange: (form: { label: string; isActive: boolean }) => void
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    if (!wallet) return
    setBusy(true)
    setError(null)
    try {
      await updateWallet(wallet.id, {
        label: form.label.trim(),
        isActive: form.isActive,
      })
      await onSaved()
      onOpenChange(false)
    } catch (error) {
      setError(getWalletErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(wallet)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Edit Wallet</DialogTitle>
          <DialogDescription>
            Rename the wallet or disable it to block new orders.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="wallet-edit-label">Label</Label>
            <Input
              id="wallet-edit-label"
              value={form.label}
              disabled={busy}
              onChange={(event) =>
                onFormChange({ ...form, label: event.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="wallet-edit-active"
              checked={form.isActive}
              disabled={busy}
              onCheckedChange={(checked) =>
                onFormChange({ ...form, isActive: checked === true })
              }
            />
            <Label htmlFor="wallet-edit-active">
              Active (allowed to place orders)
            </Label>
          </div>
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {busy ? "Saving..." : "Save"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function matchesFilter(row: WalletRow, filter: WalletFilter): boolean {
  switch (filter) {
    case "all":
      return true
    case "paper":
      return row.kind === "paper"
    case "exchange-testnet":
      return row.kind === "exchange" && row.wallet.network === "testnet"
    case "exchange-mainnet":
      return row.kind === "exchange" && row.wallet.network === "mainnet"
  }
}

function compareRows(a: WalletRow, b: WalletRow, column: SortColumn): number {
  switch (column) {
    case "label":
      return a.wallet.label.localeCompare(b.wallet.label)
    case "type":
      return a.kind.localeCompare(b.kind) || a.wallet.label.localeCompare(b.wallet.label)
    case "network":
      return networkKey(a).localeCompare(networkKey(b))
    case "balance":
      return balanceKey(a) - balanceKey(b)
    case "status":
      return statusRank(a) - statusRank(b)
  }
}

function networkKey(row: WalletRow): string {
  return row.kind === "exchange" ? row.wallet.network : ""
}

function balanceKey(row: WalletRow): number {
  return row.kind === "paper" ? row.wallet.cash : -1
}

function statusRank(row: WalletRow): number {
  if (row.kind === "paper") return 0
  const expiry = expiryState(row.wallet)
  if (row.wallet.status === "pending") return 3
  if (expiry.kind === "expired") return 4
  if (!row.wallet.is_active) return 2
  if (expiry.kind === "expiring") return 1
  return 0
}

function expiryState(
  wallet: WalletItem
):
  | { kind: "none" }
  | { kind: "expiring"; days: number }
  | { kind: "expired" } {
  if (!wallet.approval_valid_until || wallet.status !== "active") {
    return { kind: "none" }
  }
  const remainingMs = new Date(wallet.approval_valid_until).getTime() - Date.now()
  if (remainingMs <= 0) return { kind: "expired" }
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
  if (days <= EXPIRY_WARNING_DAYS) return { kind: "expiring", days }
  return { kind: "none" }
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  )
}
