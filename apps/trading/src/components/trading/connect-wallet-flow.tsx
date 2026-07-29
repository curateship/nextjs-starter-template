import * as React from "react"
import { CheckCircle2Icon, Loader2Icon } from "lucide-react"

import { shortAddress } from "@/components/scanner/format"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DialogBody, DialogFooter } from "@/components/ui/dialog"
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
  beginAgentOnboarding,
  beginAgentRenewal,
  completeAgentOnboarding,
  getOnboardingErrorMessage,
  type ApproveAgentTypedData,
} from "@/lib/api/agent-onboarding"
import type { WalletItem } from "@/lib/api/wallets"
import { connectWallet, hasInjectedWallet, signApproveAgentTypedData } from "@/lib/eth-wallet"

/**
 * The Connect Wallet state machine: form → review → sign → verifying → done.
 * `create` starts a brand-new wallet; `existing` re-signs the approval for a
 * pending or expiring wallet, keeping its agent address and key so running
 * bots are unaffected.
 */
export type ConnectFlowMode =
  | { kind: "create" }
  | { kind: "existing"; wallet: WalletItem }

type FlowStep = "form" | "review" | "verifying" | "done"

type FlowState = {
  step: FlowStep
  walletId: string | null
  masterAddress: string | null
  agentAddress: string | null
  typedData: ApproveAgentTypedData | null
  validUntil: string | null
}

const initialFlowState: FlowState = {
  step: "form",
  walletId: null,
  masterAddress: null,
  agentAddress: null,
  typedData: null,
  validUntil: null,
}

export function ConnectWalletFlow({
  mode,
  mainnetEnabled,
  onDone,
  onBack,
}: {
  mode: ConnectFlowMode
  mainnetEnabled: boolean
  onDone: () => void
  /** Return to the wallet-type chooser; omitted for standalone (renew) use. */
  onBack?: () => void
}) {
  const existing = mode.kind === "existing" ? mode.wallet : null
  const [label, setLabel] = React.useState(existing?.label ?? "")
  const [network, setNetwork] = React.useState<"testnet" | "mainnet">(
    existing?.network ?? "testnet"
  )
  const [vaultAddress, setVaultAddress] = React.useState(
    existing?.vault_address ?? ""
  )
  const [mainnetConfirm, setMainnetConfirm] = React.useState("")
  const [flow, setFlow] = React.useState<FlowState>(initialFlowState)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const walletAvailable = hasInjectedWallet()
  const isMainnet = network === "mainnet"
  const mainnetConfirmed = !isMainnet || mainnetConfirm.trim() === "MAINNET"

  async function connectAndBegin() {
    setBusy(true)
    setError(null)
    try {
      const connected = await connectWallet()
      if (
        existing &&
        connected.address.toLowerCase() !== existing.account_address
      ) {
        throw new Error(
          `Wrong account. Switch your wallet to ${shortAddress(existing.account_address)} — the account this wallet was created for — and try again.`
        )
      }
      const begun = existing
        ? await beginAgentRenewal(existing.id, connected.chainId)
        : await beginAgentOnboarding({
            label: label.trim(),
            network,
            masterAddress: connected.address,
            chainId: connected.chainId,
            vaultAddress: vaultAddress.trim() || undefined,
          })
      setFlow({
        step: "review",
        walletId: begun.walletId,
        masterAddress: connected.address,
        agentAddress: begun.agentAddress,
        typedData: begun.typedData,
        validUntil: null,
      })
    } catch (error) {
      setError(getOnboardingErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function signAndComplete() {
    if (!flow.walletId || !flow.masterAddress || !flow.typedData) return
    setBusy(true)
    setError(null)
    try {
      const signature = await signApproveAgentTypedData(
        flow.masterAddress,
        flow.typedData
      )
      setFlow((current) => ({ ...current, step: "verifying" }))
      const result = await completeAgentOnboarding(flow.walletId, signature)
      setFlow((current) => ({
        ...current,
        step: "done",
        validUntil: result.approvalValidUntil,
      }))
    } catch (error) {
      setError(getOnboardingErrorMessage(error))
      setFlow((current) => ({ ...current, step: "review" }))
    } finally {
      setBusy(false)
    }
  }

  if (flow.step === "done") {
    return (
      <>
        <DialogBody className="grid gap-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2Icon className="size-5 text-emerald-600" />
            Wallet approved and ready to trade.
          </div>
          <SummaryRow label="Agent address" value={flow.agentAddress ?? ""} mono />
          {flow.validUntil ? (
            <SummaryRow
              label="Approval valid until"
              value={new Date(flow.validUntil).toLocaleDateString()}
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            This trading key can place and cancel orders but can never withdraw
            funds. You can revoke it any time from Hyperliquid&apos;s API settings.
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </>
    )
  }

  if (flow.step === "review" || flow.step === "verifying") {
    const verifying = flow.step === "verifying"
    return (
      <>
        <DialogBody className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Your wallet will be asked for one signature. It authorizes a
            dedicated trading key that can place and cancel orders but can{" "}
            <span className="font-medium text-foreground">
              never withdraw funds
            </span>
            . No transaction is sent and no gas is paid.
          </p>
          <div className="grid gap-2">
            <SummaryRow
              label="Your account"
              value={shortAddress(flow.masterAddress ?? "")}
              mono
            />
            <SummaryRow
              label="Trading key"
              value={shortAddress(flow.agentAddress ?? "")}
              mono
            />
            <SummaryRow
              label="Network"
              value={
                <Badge variant={isMainnet ? "default" : "secondary"}>
                  {network}
                </Badge>
              }
            />
          </div>
          {isMainnet ? (
            <MainnetConfirmField
              value={mainnetConfirm}
              disabled={busy}
              onChange={setMainnetConfirm}
            />
          ) : null}
          {error ? <Message>{error}</Message> : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setError(null)
                setFlow(initialFlowState)
              }}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={busy || verifying || !mainnetConfirmed}
              onClick={() => void signAndComplete()}
            >
              {busy || verifying ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {verifying ? "Verifying approval..." : "Sign in wallet"}
            </Button>
          </>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogBody>
        {!walletAvailable ? (
          <Message>
            No browser wallet found. Install MetaMask (or another wallet
            extension), then come back — or go back and import an API wallet
            key instead.
          </Message>
        ) : null}
        <Card size="sm">
          <CardHeader>
            <CardTitle>Wallet details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {existing ? (
              <p className="text-sm text-muted-foreground">
                Re-approve{" "}
                <span className="font-medium text-foreground">
                  {existing.label}
                </span>{" "}
                with the account {shortAddress(existing.account_address)}. The
                existing trading key is kept, so bots using this wallet keep
                running.
              </p>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="connect-label">Label</Label>
                  <Input
                    id="connect-label"
                    value={label}
                    placeholder="Main account"
                    disabled={busy}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="connect-network">Network</Label>
                  <Select
                    value={network}
                    disabled={busy}
                    onValueChange={(value) =>
                      setNetwork(value as "testnet" | "mainnet")
                    }
                  >
                    <SelectTrigger id="connect-network" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="testnet">Testnet</SelectItem>
                      <SelectItem value="mainnet" disabled={!mainnetEnabled}>
                        Mainnet{mainnetEnabled ? "" : " (disabled)"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {!mainnetEnabled ? (
                    <p className="text-xs text-muted-foreground">
                      Mainnet is switched off until TRADING_ENABLE_MAINNET is
                      set — run the testnet checklist first.
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="connect-vault">
                    Vault / subaccount address (optional)
                  </Label>
                  <Input
                    id="connect-vault"
                    value={vaultAddress}
                    placeholder="0x…"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    onChange={(event) => setVaultAddress(event.target.value)}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
        {error ? <Message>{error}</Message> : null}
      </DialogBody>
      <DialogFooter variant="plain">
        <>
          {onBack ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onBack}
            >
              Back
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={busy || !walletAvailable || (!existing && !label.trim())}
            onClick={() => void connectAndBegin()}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Connect wallet
          </Button>
        </>
      </DialogFooter>
    </>
  )
}

export function MainnetConfirmField({
  value,
  disabled,
  onChange,
  message = "This is real money. Type MAINNET to confirm.",
  id = "mainnet-confirm",
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  message?: string
  id?: string
}) {
  return (
    <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
      <Label htmlFor={id} className="text-destructive">
        {message}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder="MAINNET"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : undefined}>{value}</span>
    </div>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  )
}
