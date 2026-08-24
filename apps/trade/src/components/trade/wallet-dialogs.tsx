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
  protocolLabel,
  type CredentialForm,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { loadProtocolsOnce, type ProtocolDescription } from "@/lib/api/protocols"
import {
  createWallet,
  deleteWallet,
  getWalletErrorMessage,
  updateWallet,
} from "@/lib/api/wallets"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  cleanAgentKey,
  describeAgentKeyProblem,
  isAgentKey,
  MAX_STARTING_BALANCE,
  shortenAddress,
  venueLabel,
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
 * The credential is written here and nowhere else — typed into password
 * fields, sent once, never shown back. The edit window's fields are always
 * empty on open; blank means "keep the one that is stored".
 *
 * Both windows belong to ONE exchange — the dashboard they were opened on.
 * A wallet made here is that exchange's wallet, practice ones included, so
 * it shows up on the page that made it. Which fields a live wallet asks for
 * is the exchange's own answer: each protocol describes its sign-in as data
 * (`CredentialForm`) — an address and a trading key on Hyperliquid, a key id
 * and a secret (and sometimes a passphrase) on an API-key exchange.
 */

/** The one place a network is offered; mainnet first because it is the default. */
const NETWORK_LABELS: Record<NetworkId, string> = {
  mainnet: "Mainnet",
  testnet: "Testnet",
}

/**
 * The exchange descriptions, fetched once per page and shared by both
 * windows. Module-level on purpose: the list is fixed at build time, so the
 * second window opening should not ask again.
 */
let protocolsPromise: Promise<ProtocolDescription[]> | null = null

function walletProtocols(): Promise<ProtocolDescription[]> {
  protocolsPromise ??= loadProtocolsOnce()
    .then((result) =>
      result.protocols.filter(
        (one) => one.capabilities.accounts && one.credentialForm
      )
    )
    .catch((error: unknown) => {
      // A failed read must not stick as an empty list forever.
      protocolsPromise = null
      throw error
    })
  return protocolsPromise
}

function useWalletProtocols(open: boolean): ProtocolDescription[] | null {
  const [protocols, setProtocols] = React.useState<
    ProtocolDescription[] | null
  >(null)
  React.useEffect(() => {
    if (!open || protocols) return
    let gone = false
    walletProtocols()
      .then((list) => {
        if (!gone) setProtocols(list)
      })
      .catch(() => {
        // The window still works for practice wallets; the live pane says the
        // list would not come and the next open retries.
        if (!gone) setProtocols([])
      })
    return () => {
      gone = true
    }
  }, [open, protocols])
  return protocols
}

/**
 * Checks a pasted credential the way its exchange reads it. Only an EVM
 * agent key has a checkable shape (and the count-the-characters help that
 * goes with it); an API secret is whatever the exchange minted.
 */
function secretProblem(form: CredentialForm, secret: string): string | null {
  if (!form.secretIsAgentKey) return null
  if (isAgentKey(cleanAgentKey(secret))) return null
  // Precise about WHAT is wrong with the paste — an invisible character or a
  // stray 0x looks perfect on screen, and "64 characters of hex" alone sends
  // people counting in vain.
  return `That key does not read right. ${describeAgentKeyProblem(secret) ?? ""}`
}

/** The pasted fields, in the shape the API wants for this exchange. */
function credentialFields(
  form: CredentialForm,
  secret: string,
  passphrase: string
): { agentKey?: string; secret?: string; passphrase?: string } {
  if (form.secretIsAgentKey) return { agentKey: cleanAgentKey(secret) }
  return {
    secret: secret.trim(),
    ...(form.needsPassphrase ? { passphrase: passphrase.trim() } : {}),
  }
}

function KindChoice({
  venue,
  kind,
  onChange,
}: {
  venue: string
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
      label: `Real ${venue}`,
      hint: "Your real account there, added by its own credentials.",
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
              : "hover:bg-muted/30"
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

/**
 * The sign-in fields for one exchange, drawn from its own form. Shared by
 * the add window (all fields) and the edit window (replacement secret only).
 */
function CredentialInputs({
  form,
  idPrefix,
  secret,
  passphrase,
  secretPlaceholder,
  onSecret,
  onPassphrase,
}: {
  form: CredentialForm
  idPrefix: string
  secret: string
  passphrase: string
  secretPlaceholder?: string
  onSecret: (value: string) => void
  onPassphrase: (value: string) => void
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-secret`}>{form.secretLabel}</Label>
        <PasswordInput
          id={`${idPrefix}-secret`}
          value={secret}
          placeholder={secretPlaceholder}
          aria-invalid={
            (secret !== "" && secretProblem(form, secret) !== null) || undefined
          }
          onChange={(event) => onSecret(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {form.keyHelp} It is checked with the exchange before saving, stored
          encrypted, and only ever used to sign requests.
        </p>
      </div>
      {form.needsPassphrase ? (
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-passphrase`}>Passphrase</Label>
          <PasswordInput
            id={`${idPrefix}-passphrase`}
            value={passphrase}
            onChange={(event) => onPassphrase(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The passphrase you set when creating the API key — the exchange
            demands all three values together.
          </p>
        </div>
      ) : null}
    </>
  )
}

export function AddWalletDialog({
  protocol,
  open,
  onClose,
  onAdded,
}: {
  /** The dashboard's exchange — the only one a wallet made here can be on. */
  protocol: ProtocolId
  open: boolean
  onClose: () => void
  /** The new wallet, already saved — the caller makes it active and refreshes. */
  onAdded: (wallet: TradeWallet) => void
}) {
  const protocols = useWalletProtocols(open)
  const [kind, setKind] = React.useState<WalletKind>("paper")
  const [label, setLabel] = React.useState("Practice")
  const [labelTouched, setLabelTouched] = React.useState(false)
  const [startingBalance, setStartingBalance] = React.useState("10000")
  const [network, setNetwork] = React.useState<NetworkId>("mainnet")
  const [address, setAddress] = React.useState("")
  const [secret, setSecret] = React.useState("")
  const [passphrase, setPassphrase] = React.useState("")
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
      setSecret("")
      setPassphrase("")
    }
  }

  const chosen = (protocols ?? []).find((one) => one.id === protocol) ?? null
  const form = chosen?.credentialForm ?? null
  const venue = protocolLabel(protocol)

  const pickKind = (next: WalletKind) => {
    setKind(next)
    // The default name follows the kind until the person names it themselves.
    if (!labelTouched) setLabel(next === "paper" ? "Practice" : "Real")
  }

  const dirty =
    labelTouched ||
    kind !== "paper" ||
    startingBalance !== "10000" ||
    address !== "" ||
    secret !== "" ||
    passphrase !== ""

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
        : !chosen || !form
          ? "The exchange list has not loaded — close the window and try again."
          : !new RegExp(form.addressPattern).test(address.trim())
            ? `Enter the ${form.addressLabel.toLowerCase()} the way the exchange shows it.`
            : secret.trim() === ""
              ? `Paste the ${form.secretLabel.toLowerCase()} before saving.`
              : (secretProblem(form, secret) ??
                (form.needsPassphrase && passphrase.trim() === ""
                  ? "This exchange also needs the key's passphrase."
                  : null))

  const handleAdd = async () => {
    if (saving) return
    if (refusal) {
      showErrorToast(refusal)
      return
    }
    dismissErrorToast()
    setSaving(true)
    try {
      const { wallet } = await createWallet(
        kind === "paper" || !chosen || !form
          ? {
              label: label.trim(),
              kind: "paper",
              // A practice wallet belongs to the page it was made on: it
              // prices off this exchange and shows up in this column.
              protocol,
              network: "mainnet",
              startingBalance: balanceNumber,
            }
          : {
              label: label.trim(),
              kind,
              protocol,
              network,
              address: address.trim(),
              ...credentialFields(form, secret, passphrase),
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
              A practice wallet trades pretend cash at {venue} prices. A live
              one is your own {venue} account.
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
                  <KindChoice venue={venue} kind={kind} onChange={pickKind} />
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
                        In dollars. It can be changed or reset later.
                      </p>
                    </div>
                  ) : protocols === null ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2Icon
                        className="size-4 animate-spin"
                        aria-hidden
                      />
                      Asking which exchanges this build carries…
                    </div>
                  ) : !chosen || !form ? (
                    <p className="py-2 text-sm text-muted-foreground">
                      The exchange list would not load. Close this window and
                      open it again.
                    </p>
                  ) : (
                    <>
                      {chosen.networks.length > 1 ? (
                        <div className="grid gap-2">
                          <Label htmlFor="wallet-network">Network</Label>
                          <Select
                            value={network}
                            onValueChange={(value) =>
                              setNetwork(value as NetworkId)
                            }
                          >
                            <SelectTrigger id="wallet-network">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {chosen.networks.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {NETWORK_LABELS[option]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      <div className="grid gap-2">
                        <Label htmlFor="wallet-address">
                          {form.addressLabel}
                        </Label>
                        <Input
                          id="wallet-address"
                          value={address}
                          placeholder={form.addressHint}
                          spellCheck={false}
                          aria-invalid={
                            (address !== "" &&
                              !new RegExp(form.addressPattern).test(
                                address.trim()
                              )) ||
                            undefined
                          }
                          onChange={(event) => setAddress(event.target.value)}
                        />
                      </div>
                      <CredentialInputs
                        form={form}
                        idPrefix="wallet"
                        secret={secret}
                        passphrase={passphrase}
                        onSecret={setSecret}
                        onPassphrase={setPassphrase}
                      />
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
                {saving ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
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
  const protocols = useWalletProtocols(wallet.kind === "live")
  const form =
    protocols?.find((one) => one.id === wallet.protocol)?.credentialForm ?? null
  const [label, setLabel] = React.useState(wallet.label)
  const [startingBalance, setStartingBalance] = React.useState(
    String(wallet.startingBalance)
  )
  const [secret, setSecret] = React.useState("")
  const [passphrase, setPassphrase] = React.useState("")
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
  const replacingKey = secret !== "" || passphrase !== ""
  const dirty =
    label !== wallet.label ||
    balanceDirty ||
    replacingKey ||
    status !== wallet.status ||
    makeActive

  const refusal =
    label.trim().length === 0
      ? "Give the wallet a name."
      : wallet.kind === "paper" &&
          !(balanceNumber > 0 && balanceNumber <= MAX_STARTING_BALANCE)
        ? "Enter the cash a practice wallet starts with."
        : replacingKey && form
          ? (secretProblem(form, secret) ??
            (form.needsPassphrase && passphrase.trim() === ""
              ? "This exchange also needs the key's passphrase."
              : secret.trim() === ""
                ? `Paste the ${form.secretLabel.toLowerCase()} before saving.`
                : null))
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
    dismissErrorToast()
    setSaving(true)
    try {
      if (
        label !== wallet.label ||
        balanceDirty ||
        replacingKey ||
        status !== wallet.status
      ) {
        await updateWallet({
          id: wallet.id,
          ...(label !== wallet.label ? { label: label.trim() } : {}),
          ...(balanceDirty ? { startingBalance: balanceNumber } : {}),
          ...(replacingKey && form
            ? credentialFields(form, secret, passphrase)
            : {}),
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
    dismissErrorToast()
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
      <FormDialog
        open
        dirty={dirty}
        busy={saving || deleting}
        onClose={onClose}
      >
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
                  : `A real ${venueLabel(wallet.protocol, wallet.network)} account.`}
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
                        <Label htmlFor="wallet-edit-balance">
                          Starting cash
                        </Label>
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
                          <Label>{form?.addressLabel ?? "Account"}</Label>
                          <p
                            className="text-sm text-muted-foreground"
                            title={wallet.address ?? undefined}
                          >
                            {wallet.address
                              ? shortenAddress(wallet.address)
                              : "—"}
                          </p>
                        </div>
                        {form ? (
                          <CredentialInputs
                            form={form}
                            idPrefix="wallet-edit"
                            secret={secret}
                            passphrase={passphrase}
                            secretPlaceholder="Leave blank to keep the current key"
                            onSecret={setSecret}
                            onPassphrase={setPassphrase}
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2Icon
                              className="size-4 animate-spin"
                              aria-hidden
                            />
                            Asking the exchange how its key is replaced…
                          </div>
                        )}
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
            : "This removes the wallet and its stored key from this app. The account on the exchange itself is untouched — nothing moves and nothing is closed."
        }
        confirmLabel="Delete wallet"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  )
}
