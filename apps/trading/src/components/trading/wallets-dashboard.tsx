import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createWallet,
  deleteWallet,
  getWalletErrorMessage,
  updateWallet,
  type WalletItem,
} from "@/lib/api/wallets"

type ImportForm = {
  label: string
  network: "testnet" | "mainnet"
  accountAddress: string
  agentAddress: string
  vaultAddress: string
  privateKey: string
}

type EditForm = {
  label: string
  isActive: boolean
}

const emptyImportForm: ImportForm = {
  label: "",
  network: "testnet",
  accountAddress: "",
  agentAddress: "",
  vaultAddress: "",
  privateKey: "",
}

export function WalletsDashboard({
  initialWallets: wallets,
  mainnetEnabled,
}: {
  initialWallets: WalletItem[]
  mainnetEnabled: boolean
}) {
  const router = useRouter()
  const [importOpen, setImportOpen] = React.useState(false)
  const [importForm, setImportForm] = React.useState<ImportForm>(emptyImportForm)
  const [editing, setEditing] = React.useState<WalletItem | null>(null)
  const [editForm, setEditForm] = React.useState<EditForm>({
    label: "",
    isActive: true,
  })
  const [pendingDelete, setPendingDelete] = React.useState<WalletItem | null>(
    null
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function openImportForm() {
    setImportForm(emptyImportForm)
    setError(null)
    setImportOpen(true)
  }

  function openEditForm(wallet: WalletItem) {
    setEditing(wallet)
    setEditForm({ label: wallet.label, isActive: wallet.is_active })
    setError(null)
  }

  async function saveImport() {
    setBusy(true)
    setError(null)
    try {
      await createWallet({
        label: importForm.label.trim(),
        network: importForm.network,
        accountAddress: importForm.accountAddress.trim(),
        agentAddress: importForm.agentAddress.trim(),
        vaultAddress: importForm.vaultAddress.trim() || undefined,
        privateKey: importForm.privateKey.trim(),
      })
      await router.invalidate()
      setImportOpen(false)
      setImportForm(emptyImportForm)
    } catch (error) {
      setError(getWalletErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      await updateWallet(editing.id, {
        label: editForm.label.trim(),
        isActive: editForm.isActive,
      })
      await router.invalidate()
      setEditing(null)
    } catch (error) {
      setError(getWalletErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    setError(null)
    try {
      await deleteWallet(pendingDelete.id)
      await router.invalidate()
      setPendingDelete(null)
    } catch (error) {
      setError(getWalletErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full pb-8">
      {error && !importOpen && !editing ? <Message>{error}</Message> : null}

      <DashboardTable
        title="Sandbox Wallets"
        icon={<WalletIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={wallets.length}
        controls={
          <DashboardToolbarButton type="button" onClick={openImportForm}>
            <PlusIcon className="size-4" />
            Import Sandbox Wallet
          </DashboardToolbarButton>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Wallet</TableHead>
              <TableHead column="meta">Network</TableHead>
              <TableHead column="meta">Agent</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={wallets.length === 0}
        emptyText="No sandbox wallets. Import an approved Hyperliquid testnet API wallet to trade the real (test) exchange."
        emptyColSpan={5}
        footer={{ type: "summary", count: wallets.length, label: "wallets" }}
      >
        {wallets.map((wallet) => (
          <TableRow key={wallet.id}>
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
              <Badge
                variant={wallet.network === "mainnet" ? "default" : "secondary"}
              >
                {wallet.network}
              </Badge>
            </TableCell>
            <TableCell column="meta">
              <span className="font-mono text-xs text-muted-foreground">
                {shortAddress(wallet.agent_address)}
              </span>
            </TableCell>
            <TableCell column="meta">
              {wallet.is_active ? (
                <Badge>Active</Badge>
              ) : (
                <Badge variant="secondary">Disabled</Badge>
              )}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEditForm(wallet)}
                  aria-label={`Edit ${wallet.label}`}
                  title={`Edit ${wallet.label}`}
                >
                  <PencilIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPendingDelete(wallet)}
                  aria-label={`Delete ${wallet.label}`}
                  title={`Delete ${wallet.label}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ImportWalletDialog
        open={importOpen}
        form={importForm}
        saving={busy}
        error={error}
        mainnetEnabled={mainnetEnabled}
        onFormChange={setImportForm}
        onOpenChange={setImportOpen}
        onSave={() => void saveImport()}
      />

      <EditWalletDialog
        wallet={editing}
        form={editForm}
        saving={busy}
        error={error}
        onFormChange={setEditForm}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSave={() => void saveEdit()}
      />

      <DeleteWalletDialog
        wallet={pendingDelete}
        deleting={busy}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

function ImportWalletDialog({
  open,
  form,
  saving,
  error,
  mainnetEnabled,
  onFormChange,
  onOpenChange,
  onSave,
}: {
  open: boolean
  form: ImportForm
  saving: boolean
  error: string | null
  mainnetEnabled: boolean
  onFormChange: (form: ImportForm) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Import Sandbox Wallet</DialogTitle>
          <DialogDescription>
            Import an approved Hyperliquid (testnet) API wallet. The private
            key is encrypted at rest and never sent back to the browser.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="wallet-label">Label</Label>
            <Input
              id="wallet-label"
              value={form.label}
              placeholder="Main testnet"
              disabled={saving}
              onChange={(event) =>
                onFormChange({ ...form, label: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wallet-network">Network</Label>
            <Select
              value={form.network}
              disabled={saving}
              onValueChange={(value) =>
                onFormChange({
                  ...form,
                  network: value as ImportForm["network"],
                })
              }
            >
              <SelectTrigger id="wallet-network" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="testnet">Testnet</SelectItem>
                <SelectItem value="mainnet" disabled={!mainnetEnabled}>
                  Mainnet{mainnetEnabled ? "" : " (disabled)"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wallet-account">Account address</Label>
            <Input
              id="wallet-account"
              value={form.accountAddress}
              placeholder="0x… (the account that holds funds)"
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
              onChange={(event) =>
                onFormChange({ ...form, accountAddress: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wallet-agent">Agent address</Label>
            <Input
              id="wallet-agent"
              value={form.agentAddress}
              placeholder="0x… (the API wallet address)"
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
              onChange={(event) =>
                onFormChange({ ...form, agentAddress: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wallet-vault">Vault / subaccount address (optional)</Label>
            <Input
              id="wallet-vault"
              value={form.vaultAddress}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
              onChange={(event) =>
                onFormChange({ ...form, vaultAddress: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wallet-key">Agent private key</Label>
            <Input
              id="wallet-key"
              type="password"
              value={form.privateKey}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
              onChange={(event) =>
                onFormChange({ ...form, privateKey: event.target.value })
              }
            />
          </div>
          {error ? (
            <div className="sm:col-span-2">
              <Message>{error}</Message>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={onSave}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {saving ? "Importing..." : "Import"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditWalletDialog({
  wallet,
  form,
  saving,
  error,
  onFormChange,
  onOpenChange,
  onSave,
}: {
  wallet: WalletItem | null
  form: EditForm
  saving: boolean
  error: string | null
  onFormChange: (form: EditForm) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
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
              disabled={saving}
              onChange={(event) =>
                onFormChange({ ...form, label: event.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="wallet-edit-active"
              checked={form.isActive}
              disabled={saving}
              onCheckedChange={(checked) =>
                onFormChange({ ...form, isActive: checked === true })
              }
            />
            <Label htmlFor="wallet-edit-active">
              Active (allowed to place orders)
            </Label>
          </div>
          {error ? <Message>{error}</Message> : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={onSave}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteWalletDialog({
  wallet,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  wallet: WalletItem | null
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(wallet)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Delete Wallet</DialogTitle>
          <DialogDescription>
            This removes the wallet and its encrypted key from this app. It
            does not revoke the agent on Hyperliquid.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">
            Delete{" "}
            <span className="font-medium">{wallet?.label ?? "this wallet"}</span>
            ?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={onConfirm}
            >
              {deleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Delete
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  )
}
