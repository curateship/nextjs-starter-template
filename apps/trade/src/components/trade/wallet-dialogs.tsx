import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createWallet,
  deleteWallet,
  getWalletErrorMessage,
  updateWallet,
} from "@/lib/api/wallets"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  cleanAgentKey,
  describeAgentKeyProblem,
  isAgentKey,
  isWalletAddress,
  MAX_STARTING_BALANCE,
  shortenAddress,
  WALLET_LABEL_MAX,
  type TradeWallet,
  type WalletKind,
  type WalletStatus,
} from "@/lib/trade/wallets"
import { cn } from "@/lib/utils"

/**
 * The two wallet windows: adding one, and the card-click window that edits,
 * switches to, or deletes one.
 *
 * The trading key is written here and nowhere else — typed into a password
 * field, sent once, never shown back. The edit window's key field is always
 * empty on open; blank means "keep the one that is stored".
 */

/** The one place a network is offered; mainnet first because it is the default. */
const NETWORKS = [
  { id: "mainnet" as const, label: "Mainnet" },
  { id: "testnet" as const, label: "Testnet" },
]

function KindChoice({
  kind,
  onChange,
}: {
  kind: WalletKind
  onChange: (kind: WalletKind) => void
}) {
  const options: Array<{ id: WalletKind; label: string; hint: string }> = [
    {
      id: "paper",
      label: "Practice",
      hint: "Pretend cash, real prices. Nothing can be lost.",
    },
    {
      id: "live",
      label: "Live Hyperliquid",
      hint: "A real account, added by its address and trading key.",
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={kind === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-lg border p-3 text-left transition-colors",
            kind === option.id
              ? "border-foreground/60 bg-muted/50"
              : "border-foreground/10 hover:bg-muted/30"
          )}
        >
          <span className="block text-sm font-medium">{option.label}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {option.hint}
          </span>
        </button>
      ))}
    </div>
  )
}

export function AddWalletDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  /** The new wallet, already saved — the caller makes it active and refreshes. */
  onAdded: (wallet: TradeWallet) => void
}) {
  const [kind, setKind] = React.useState<WalletKind>("paper")
  const [label, setLabel] = React.useState("Practice")
  const [labelTouched, setLabelTouched] = React.useState(false)
  const [startingBalance, setStartingBalance] = React.useState("10000")
  const [network, setNetwork] = React.useState<"mainnet" | "testnet">("mainnet")
  const [address, setAddress] = React.useState("")
  const [agentKey, setAgentKey] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // A fresh window each time it opens, not the leftovers of the last add.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setKind("paper")
      setLabel("Practice")
      setLabelTouched(false)
      setStartingBalance("10000")
      setNetwork("mainnet")
      setAddress("")
      setAgentKey("")
    }
  }

  const pickKind = (next: WalletKind) => {
    setKind(next)
    // The default name follows the kind until the person names it themselves.
    if (!labelTouched) setLabel(next === "paper" ? "Practice" : "Live")
  }

  const dirty =
    labelTouched ||
    kind !== "paper" ||
    startingBalance !== "10000" ||
    address !== "" ||
    agentKey !== ""

  const balanceNumber = Number(startingBalance)
  const refusal =
    label.trim().length === 0
      ? "Give the wallet a name."
      : kind === "paper"
        ? !Number.isFinite(balanceNumber) ||
          balanceNumber <= 0 ||
          balanceNumber > MAX_STARTING_BALANCE
          ? "Enter the cash a practice wallet starts with."
          : null
        : !isWalletAddress(address.trim())
          ? "Enter the account's address — 0x followed by 40 characters."
          : !isAgentKey(cleanAgentKey(agentKey))
            ? // Precise about WHAT is wrong with the paste — an invisible
              // character or a stray 0x looks perfect on screen, and "64
              // characters of hex" alone sends people counting in vain.
              `That key does not read right. ${describeAgentKeyProblem(agentKey) ?? ""}`
            : null

  const handleAdd = async () => {
    if (saving) return
    if (refusal) {
      showErrorToast(refusal)
      return
    }
    setSaving(true)
    try {
      const { wallet } = await createWallet(
        kind === "paper"
          ? {
              label: label.trim(),
              kind,
              protocol: "hyperliquid",
              network: "mainnet",
              startingBalance: balanceNumber,
            }
          : {
              label: label.trim(),
              kind,
              protocol: "hyperliquid",
              network,
              address: address.trim(),
              agentKey: cleanAgentKey(agentKey),
            }
      )
      toast.success(`Added "${wallet.label}".`)
      onAdded(wallet)
      onClose()
    } catch (error) {
      showErrorToast(getWalletErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a wallet</DialogTitle>
            <DialogDescription>
              A practice wallet trades pretend cash at real prices. A live one
              is your own Hyperliquid account.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleAdd()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardContent className="grid gap-4">
                  <KindChoice kind={kind} onChange={pickKind} />
                  <div className="grid gap-2">
                    <Label htmlFor="wallet-label">Name</Label>
                    <Input
                      id="wallet-label"
                      value={label}
                      maxLength={WALLET_LABEL_MAX}
                      autoFocus
                      aria-invalid={label.trim().length === 0 || undefined}
                      onChange={(event) => {
                        setLabel(event.target.value)
                        setLabelTouched(true)
                      }}
                    />
                  </div>
                  {kind === "paper" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="wallet-balance">Starting cash</Label>
                      <Input
                        id="wallet-balance"
                        inputMode="decimal"
                        value={startingBalance}
                        aria-invalid={
                          !(balanceNumber > 0 && balanceNumber <= MAX_STARTING_BALANCE) ||
                          undefined
                        }
                        onChange={(event) => setStartingBalance(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        In dollars. It can be changed or reset later.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="wallet-network">Network</Label>
                        <Select
                          value={network}
                          onValueChange={(value) =>
                            setNetwork(value as "mainnet" | "testnet")
                          }
                        >
                          <SelectTrigger id="wallet-network">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {NETWORKS.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="wallet-address">Account address</Label>
                        <Input
                          id="wallet-address"
                          value={address}
                          placeholder="0x…"
                          spellCheck={false}
                          aria-invalid={
                            (address !== "" && !isWalletAddress(address.trim())) ||
                            undefined
                          }
                          onChange={(event) => setAddress(event.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="wallet-key">Trading key</Label>
                        <PasswordInput
                          id="wallet-key"
                          value={agentKey}
                          aria-invalid={
                            (agentKey !== "" &&
                              !isAgentKey(cleanAgentKey(agentKey))) ||
                            undefined
                          }
                          onChange={(event) => setAgentKey(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          The API key from Hyperliquid — never the account&apos;s
                          main key. It is checked with Hyperliquid before saving,
                          stored encrypted, and only ever used to sign orders.
                        </p>
                      </div>
                    </>
                  )}
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
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Add wallet
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

export function WalletSettingsDialog({
  wallet,
  active,
  onClose,
  onChanged,
  onUse,
}: {
  /** Null keeps the window closed; the card click passes the wallet in. */
  wallet: TradeWallet | null
  /** Whether this wallet is the active one already. */
  active: boolean
  onClose: () => void
  /** Something was saved or deleted — the caller refreshes. */
  onChanged: () => void
  onUse: (walletId: string) => void
}) {
  return wallet ? (
    <WalletSettingsWindow
      // Keyed by wallet so switching cards can never carry edits across.
      key={wallet.id}
      wallet={wallet}
      active={active}
      onClose={onClose}
      onChanged={onChanged}
      onUse={onUse}
    />
  ) : null
}

function WalletSettingsWindow({
  wallet,
  active,
  onClose,
  onChanged,
  onUse,
}: {
  wallet: TradeWallet
  active: boolean
  onClose: () => void
  onChanged: () => void
  onUse: (walletId: string) => void
}) {
  const [label, setLabel] = React.useState(wallet.label)
  const [startingBalance, setStartingBalance] = React.useState(
    String(wallet.startingBalance)
  )
  const [agentKey, setAgentKey] = React.useState("")
  const [status, setStatus] = React.useState<WalletStatus>(wallet.status)
  // Ticked here, applied on Save with everything else — the tick is part of
  // the form, not a separate action that fires as you touch it.
  const [makeActive, setMakeActive] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const balanceNumber = Number(startingBalance)
  const balanceDirty =
    wallet.kind === "paper" && balanceNumber !== wallet.startingBalance
  const dirty =
    label !== wallet.label ||
    balanceDirty ||
    agentKey !== "" ||
    status !== wallet.status ||
    makeActive

  const refusal =
    label.trim().length === 0
      ? "Give the wallet a name."
      : wallet.kind === "paper" &&
          !(balanceNumber > 0 && balanceNumber <= MAX_STARTING_BALANCE)
        ? "Enter the cash a practice wallet starts with."
        : agentKey !== "" && !isAgentKey(cleanAgentKey(agentKey))
          ? `That key does not read right. ${describeAgentKeyProblem(agentKey) ?? ""}`
          : null

  const handleSave = async () => {
    if (saving) return
    if (!dirty) {
      onClose()
      return
    }
    if (refusal) {
      showErrorToast(refusal)
      return
    }
    setSaving(true)
    try {
      if (
        label !== wallet.label ||
        balanceDirty ||
        agentKey !== "" ||
        status !== wallet.status
      ) {
        await updateWallet({
          id: wallet.id,
          ...(label !== wallet.label ? { label: label.trim() } : {}),
          ...(balanceDirty ? { startingBalance: balanceNumber } : {}),
          ...(agentKey !== "" ? { agentKey: cleanAgentKey(agentKey) } : {}),
          ...(status !== wallet.status ? { status } : {}),
        })
      }
      if (makeActive && status === "active") onUse(wallet.id)
      toast.success("Wallet saved.")
      onChanged()
      onClose()
    } catch (error) {
      showErrorToast(getWalletErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteWallet(wallet.id)
      toast.success(`Deleted "${wallet.label}".`)
      setConfirmingDelete(false)
      onChanged()
      onClose()
    } catch (error) {
      showErrorToast(getWalletErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <FormDialog open dirty={dirty} busy={saving || deleting} onClose={onClose}>
        {(requestClose) => (
          <DialogContent variant="admin" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="min-w-0 truncate">{wallet.label}</span>
                {/* Being the wallet an order would go to is a state, not an
                    action, so it is said here rather than sitting in the form
                    among the things you can change. */}
                {active ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    <span
                      className="size-1.5 rounded-full bg-emerald-500"
                      aria-hidden
                    />
                    This wallet is active
                  </span>
                ) : null}
              </DialogTitle>
              <DialogDescription>
                {wallet.kind === "paper"
                  ? "A practice wallet — pretend cash at real prices."
                  : "A live Hyperliquid account."}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void handleSave()
              }}
            >
              <DialogBody>
                <Card size="sm">
                  <CardContent className="grid gap-4">
                    {active || status === "inactive" ? null : (
                      <div className="flex items-start gap-2.5">
                        <Checkbox
                          id="wallet-edit-active"
                          checked={makeActive}
                          onCheckedChange={(checked) =>
                            setMakeActive(checked === true)
                          }
                        />
                        <div className="grid gap-1">
                          <Label htmlFor="wallet-edit-active">
                            Trade with this wallet
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Orders go to whichever wallet is active.
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="wallet-edit-status">Status</Label>
                      <Select
                        value={status}
                        onValueChange={(value) => {
                          const next = value as WalletStatus
                          setStatus(next)
                          if (next === "inactive") setMakeActive(false)
                        }}
                      >
                        <SelectTrigger id="wallet-edit-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="wallet-edit-label">Name</Label>
                      <Input
                        id="wallet-edit-label"
                        value={label}
                        maxLength={WALLET_LABEL_MAX}
                        aria-invalid={label.trim().length === 0 || undefined}
                        onChange={(event) => setLabel(event.target.value)}
                      />
                    </div>
                    {wallet.kind === "paper" ? (
                      <div className="grid gap-2">
                        <Label htmlFor="wallet-edit-balance">Starting cash</Label>
                        <Input
                          id="wallet-edit-balance"
                          inputMode="decimal"
                          value={startingBalance}
                          aria-invalid={
                            !(
                              balanceNumber > 0 &&
                              balanceNumber <= MAX_STARTING_BALANCE
                            ) || undefined
                          }
                          onChange={(event) =>
                            setStartingBalance(event.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          What this wallet measures itself against.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-2">
                          <Label>Account address</Label>
                          <p
                            className="text-sm text-muted-foreground"
                            title={wallet.address ?? undefined}
                          >
                            {wallet.address ? shortenAddress(wallet.address) : "—"}
                          </p>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="wallet-edit-key">Replace trading key</Label>
                          <PasswordInput
                            id="wallet-edit-key"
                            value={agentKey}
                            placeholder="Leave blank to keep the current key"
                            aria-invalid={
                              (agentKey !== "" &&
                                !isAgentKey(cleanAgentKey(agentKey))) ||
                              undefined
                            }
                            onChange={(event) => setAgentKey(event.target.value)}
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                {/* Hard left, so the button that throws the wallet away can
                    never be mistaken for the one that saves it. */}
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={saving || deleting}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || deleting}
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || deleting}>
                  {saving ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </FormDialog>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete "${wallet.label}"?`}
        description={
          wallet.kind === "paper"
            ? "This practice wallet is removed from this app. It only ever held pretend cash — there is nothing anywhere else to change."
            : "This removes the wallet and its stored trading key from this app. The account on Hyperliquid itself is untouched — nothing moves and nothing is closed."
        }
        confirmLabel="Delete wallet"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  )
}
