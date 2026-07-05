import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { FlaskConicalIcon, Loader2Icon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { Button } from "@/components/ui/button"
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createPaperWallet,
  deletePaperWallet,
  getPaperErrorMessage,
  resetPaperWallet,
  type PaperWalletItem,
} from "@/lib/api/paper"

type PendingAction = { kind: "reset" | "delete"; wallet: PaperWalletItem }

export function PaperWalletsSection({
  paperWallets,
}: {
  paperWallets: PaperWalletItem[]
}) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [startingEquity, setStartingEquity] = React.useState("10000")
  const [pending, setPending] = React.useState<PendingAction | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      await createPaperWallet(label.trim(), Number(startingEquity) || 10_000)
      await router.invalidate()
      setCreateOpen(false)
      setLabel("")
    } catch (error) {
      setError(getPaperErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmPending() {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      if (pending.kind === "reset") {
        await resetPaperWallet(pending.wallet.id)
      } else {
        await deletePaperWallet(pending.wallet.id)
      }
      await router.invalidate()
      setPending(null)
    } catch (error) {
      setError(getPaperErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6">
      <DashboardTable
        title="Paper Wallets"
        icon={
          <FlaskConicalIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={paperWallets.length}
        controls={
          <DashboardToolbarButton
            type="button"
            onClick={() => {
              setError(null)
              setCreateOpen(true)
            }}
          >
            <PlusIcon className="size-4" />
            Create Paper Wallet
          </DashboardToolbarButton>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Wallet</TableHead>
              <TableHead column="meta">Cash</TableHead>
              <TableHead column="meta">Starting equity</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={paperWallets.length === 0}
        emptyText="No paper wallets. Create one to trade the dashboard with simulated money — no exchange account needed."
        emptyColSpan={4}
        footer={{
          type: "summary",
          count: paperWallets.length,
          label: "paper wallets",
        }}
      >
        {paperWallets.map((wallet) => (
          <TableRow key={wallet.id}>
            <TableCell column="main">
              <div className="min-w-0">
                <div className="truncate font-medium">{wallet.label}</div>
                <div className="text-xs text-muted-foreground">
                  In-house simulation · fills from live market data
                </div>
              </div>
            </TableCell>
            <TableCell column="meta">
              <span className="font-mono tabular-nums">
                ${wallet.cash.toFixed(2)}
              </span>
            </TableCell>
            <TableCell column="meta">
              <span className="font-mono tabular-nums">
                ${wallet.starting_equity.toFixed(2)}
              </span>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={`Reset ${wallet.label}`}
                  aria-label={`Reset ${wallet.label}`}
                  onClick={() => setPending({ kind: "reset", wallet })}
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={`Delete ${wallet.label}`}
                  aria-label={`Delete ${wallet.label}`}
                  onClick={() => setPending({ kind: "delete", wallet })}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Create Paper Wallet</DialogTitle>
            <DialogDescription>
              An in-house simulated account. Orders fill against live market
              data; balances live only in this app.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="paper-label">Label</Label>
              <Input
                id="paper-label"
                value={label}
                placeholder="Practice account"
                disabled={busy}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paper-equity">Starting equity (USD)</Label>
              <Input
                id="paper-equity"
                value={startingEquity}
                inputMode="decimal"
                disabled={busy}
                onChange={(event) =>
                  setStartingEquity(event.target.value.trim())
                }
              />
            </div>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">
                {error}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || !label.trim()}
                onClick={() => void create()}
              >
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "reset" ? "Reset" : "Delete"} Paper Wallet
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "reset"
                ? "Clears positions, orders, and fills, and restores cash to the starting equity."
                : "Deletes the wallet with its positions, orders, and fill history."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              {pending?.kind === "reset" ? "Reset" : "Delete"}{" "}
              <span className="font-medium">{pending?.wallet.label}</span>?
            </p>
            {error ? (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void confirmPending()}
              >
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Confirm
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
