import * as React from "react"
import {
  FlaskConicalIcon,
  KeyRoundIcon,
  Loader2Icon,
  WalletIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { createPaperWallet, getPaperErrorMessage } from "@/lib/api/paper"
import { createWallet, getWalletErrorMessage } from "@/lib/api/wallets"
import {
  ConnectWalletFlow,
  MainnetConfirmField,
} from "@/components/trading/connect-wallet-flow"

type WalletKind = "connect" | "import" | "paper"
type Step = "type" | WalletKind

type ImportForm = {
  label: string
  network: "testnet" | "mainnet"
  accountAddress: string
  agentAddress: string
  vaultAddress: string
  privateKey: string
}

const emptyImportForm: ImportForm = {
  label: "",
  network: "testnet",
  accountAddress: "",
  agentAddress: "",
  vaultAddress: "",
  privateKey: "",
}

/**
 * The guided "New Wallet" flow: pick a wallet type first, then walk through
 * just that type's steps — connect a real wallet, import an approved API
 * wallet key, or create a paper (simulated) wallet.
 */
export function NewWalletDialog({
  open,
  mainnetEnabled,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  mainnetEnabled: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => Promise<void> | void
}) {
  const [step, setStep] = React.useState<Step>("type")
  const [importForm, setImportForm] =
    React.useState<ImportForm>(emptyImportForm)
  const [mainnetConfirm, setMainnetConfirm] = React.useState("")
  const [paperLabel, setPaperLabel] = React.useState("")
  const [paperEquity, setPaperEquity] = React.useState("10000")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function reset() {
    setStep("type")
    setImportForm(emptyImportForm)
    setMainnetConfirm("")
    setPaperLabel("")
    setPaperEquity("10000")
    setError(null)
  }

  function close() {
    onOpenChange(false)
    reset()
  }

  function backToType() {
    setError(null)
    setMainnetConfirm("")
    setStep("type")
  }

  async function finishCreated() {
    await onCreated()
    close()
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
      await finishCreated()
    } catch (error) {
      setError(getWalletErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function savePaper() {
    setBusy(true)
    setError(null)
    try {
      await createPaperWallet(paperLabel.trim(), Number(paperEquity) || 10_000)
      await finishCreated()
    } catch (error) {
      setError(getPaperErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const importIsMainnet = importForm.network === "mainnet"
  const importConfirmed =
    !importIsMainnet || mainnetConfirm.trim() === "MAINNET"

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
        else onOpenChange(next)
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{titleFor(step)}</DialogTitle>
          <DialogDescription>{descriptionFor(step)}</DialogDescription>
        </DialogHeader>

        {step === "type" ? (
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Wallet type</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <WalletTypeOption
                  icon={<WalletIcon className="size-5" />}
                  title="Connect real wallet"
                  badge="Recommended"
                  description="Connect MetaMask (or another browser wallet) and approve a trading key with one signature. The key can trade but can never withdraw."
                  onClick={() => setStep("connect")}
                />
                <WalletTypeOption
                  icon={<KeyRoundIcon className="size-5" />}
                  title="Import API wallet key"
                  description="Paste the private key of an API wallet you already created and approved on Hyperliquid."
                  onClick={() => setStep("import")}
                />
                <WalletTypeOption
                  icon={<FlaskConicalIcon className="size-5" />}
                  title="Paper wallet"
                  description="Simulated money, real market data. No exchange account needed — the safest way to practice."
                  onClick={() => setStep("paper")}
                />
              </CardContent>
            </Card>
          </DialogBody>
        ) : null}

        {step === "connect" ? (
          <ConnectWalletFlow
            mode={{ kind: "create" }}
            mainnetEnabled={mainnetEnabled}
            onDone={() => void finishCreated()}
            onBack={backToType}
          />
        ) : null}

        {step === "import" ? (
          <>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Identity</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="wallet-label">Label</Label>
                    <Input
                      id="wallet-label"
                      value={importForm.label}
                      placeholder="Main account"
                      disabled={busy}
                      onChange={(event) =>
                        setImportForm({
                          ...importForm,
                          label: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="wallet-network">Network</Label>
                    <Select
                      value={importForm.network}
                      disabled={busy}
                      onValueChange={(value) =>
                        setImportForm({
                          ...importForm,
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
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Addresses and key</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="wallet-account">Account address</Label>
                    <Input
                      id="wallet-account"
                      value={importForm.accountAddress}
                      placeholder="0x… (the account that holds funds)"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={busy}
                      onChange={(event) =>
                        setImportForm({
                          ...importForm,
                          accountAddress: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="wallet-agent">Agent address</Label>
                    <Input
                      id="wallet-agent"
                      value={importForm.agentAddress}
                      placeholder="0x… (the API wallet address)"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={busy}
                      onChange={(event) =>
                        setImportForm({
                          ...importForm,
                          agentAddress: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="wallet-vault">
                      Vault / subaccount address (optional)
                    </Label>
                    <Input
                      id="wallet-vault"
                      value={importForm.vaultAddress}
                      placeholder="0x…"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={busy}
                      onChange={(event) =>
                        setImportForm({
                          ...importForm,
                          vaultAddress: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="wallet-key">Agent private key</Label>
                    <Input
                      id="wallet-key"
                      type="password"
                      value={importForm.privateKey}
                      placeholder="0x…"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={busy}
                      onChange={(event) =>
                        setImportForm({
                          ...importForm,
                          privateKey: event.target.value,
                        })
                      }
                    />
                  </div>
                  {importIsMainnet ? (
                    <div className="sm:col-span-2">
                      <MainnetConfirmField
                        value={mainnetConfirm}
                        disabled={busy}
                        onChange={setMainnetConfirm}
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              {error ? <ErrorMessage>{error}</ErrorMessage> : null}
            </DialogBody>
            <DialogFooter variant="plain">
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={backToType}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={busy || !importConfirmed}
                  onClick={() => void saveImport()}
                >
                  {busy ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  {busy ? "Importing..." : "Import"}
                </Button>
              </>
            </DialogFooter>
          </>
        ) : null}

        {step === "paper" ? (
          <>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Paper wallet details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="paper-label">Label</Label>
                    <Input
                      id="paper-label"
                      value={paperLabel}
                      placeholder="Practice account"
                      disabled={busy}
                      onChange={(event) => setPaperLabel(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="paper-equity">Starting equity (USD)</Label>
                    <Input
                      id="paper-equity"
                      value={paperEquity}
                      inputMode="decimal"
                      disabled={busy}
                      onChange={(event) =>
                        setPaperEquity(event.target.value.trim())
                      }
                    />
                  </div>
                </CardContent>
              </Card>
              {error ? <ErrorMessage>{error}</ErrorMessage> : null}
            </DialogBody>
            <DialogFooter variant="plain">
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={backToType}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={busy || !paperLabel.trim()}
                  onClick={() => void savePaper()}
                >
                  {busy ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  Create
                </Button>
              </>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function WalletTypeOption({
  icon,
  title,
  badge,
  description,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  badge?: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-muted/50"
      onClick={onClick}
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {badge ? (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  )
}

function titleFor(step: Step): string {
  switch (step) {
    case "type":
      return "New Wallet"
    case "connect":
      return "Connect Real Wallet"
    case "import":
      return "Import API Wallet"
    case "paper":
      return "Create Paper Wallet"
  }
}

function descriptionFor(step: Step): string {
  switch (step) {
    case "type":
      return "Choose what kind of wallet to add."
    case "connect":
      return "Your browser wallet approves a dedicated trading key with one signature. Keys are encrypted at rest and never sent back to the browser."
    case "import":
      return "Import an approved Hyperliquid API wallet. The private key is encrypted at rest and never sent back to the browser."
    case "paper":
      return "An in-house simulated account. Orders fill against live market data; balances live only in this app."
  }
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  )
}
