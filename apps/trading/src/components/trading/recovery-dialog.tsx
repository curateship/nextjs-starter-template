import * as React from "react"
import { CheckCircle2Icon, Loader2Icon, ShieldAlertIcon } from "lucide-react"

import { shortAddress } from "@/components/scanner/format"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { connectWallet } from "@/lib/eth-wallet"
import {
  loadRecoveryBalance,
  submitRecoveryWithdrawal,
  validateRecoveryAmount,
  type RecoveryBalance,
  type RecoveryNetwork,
} from "@/lib/hyperliquid-recovery"

export function RecoveryDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen || !busy) setOpen(nextOpen)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        variant="admin"
        className="sm:max-w-xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Recover Hyperliquid funds</DialogTitle>
          <DialogDescription>
            Withdraw available USDC from your connected wallet. Your wallet
            talks directly to Hyperliquid; our server never sees your key or
            withdrawal signature.
          </DialogDescription>
        </DialogHeader>
        <RecoveryForm busy={busy} setBusy={setBusy} />
      </DialogContent>
    </Dialog>
  )
}

function RecoveryForm({
  busy,
  setBusy,
}: {
  busy: boolean
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const [network, setNetwork] = React.useState<RecoveryNetwork>("mainnet")
  const [address, setAddress] = React.useState<string | null>(null)
  const [balance, setBalance] = React.useState<RecoveryBalance | null>(null)
  const [amount, setAmount] = React.useState("")
  const [confirmation, setConfirmation] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<
    "refreshed" | "unrefreshed" | null
  >(null)

  const amountError =
    amount && balance
      ? validateRecoveryAmount(amount, balance.withdrawable)
      : null

  async function loadBalance(nextNetwork: RecoveryNetwork, wallet: string) {
    setBusy(true)
    setError(null)
    try {
      setBalance(await loadRecoveryBalance(nextNetwork, wallet))
    } catch (error) {
      setBalance(null)
      setError(getRecoveryError(error))
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const wallet = await connectWallet()
      setAddress(wallet.address)
      await loadBalance(network, wallet.address)
    } catch (error) {
      setError(getRecoveryError(error))
      setBusy(false)
    }
  }

  async function withdraw(event: React.FormEvent) {
    event.preventDefault()
    if (!address || !balance || amountError) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await submitRecoveryWithdrawal({
        network,
        address,
        amount,
      })
      setBalance(result.balance)
      setAmount("")
      setConfirmation("")
      setSuccess(result.balance ? "refreshed" : "unrefreshed")
    } catch (error) {
      setError(getRecoveryError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form id="recovery-withdrawal" className="contents" onSubmit={withdraw}>
      <DialogBody>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Connect your master wallet</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="recovery-network">Network</Label>
              <Select
                value={network}
                disabled={busy}
                onValueChange={(value) => {
                  const next = value as RecoveryNetwork
                  setNetwork(next)
                  setBalance(null)
                  setSuccess(null)
                  if (address) void loadBalance(next, address)
                }}
              >
                <SelectTrigger
                  id="recovery-network"
                  className="h-8 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mainnet">Mainnet · real funds</SelectItem>
                  <SelectItem value="testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" disabled={busy} onClick={() => void connect()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {address ? "Reconnect wallet" : "Connect wallet"}
            </Button>
            <p className="text-xs text-muted-foreground">
              This cannot bypass a stopped HyperCore network, API, or bridge.
              Funds remain recorded under your wallet until processing resumes.
            </p>
          </CardContent>
        </Card>

        {address && balance ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Available withdrawal</CardTitle>
              <CardDescription>
                {shortAddress(address)} · destination locked to this same wallet
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Account value</dt>
                  <dd className="font-mono">{balance.equity} USDC</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Withdrawable</dt>
                  <dd className="font-mono">{balance.withdrawable} USDC</dd>
                </div>
              </dl>
              <div className="grid gap-2">
                <Label htmlFor="recovery-amount">Amount in USDC</Label>
                <Input
                  id="recovery-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  disabled={busy}
                  placeholder="0.00"
                  onChange={(event) => setAmount(event.target.value.trim())}
                />
                {amountError ? (
                  <p className="text-sm text-destructive">{amountError}</p>
                ) : null}
              </div>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <div className="flex gap-2 font-medium">
                  <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" />
                  This withdraws only available USDC.
                </div>
                <p className="mt-1 text-muted-foreground">
                  Open positions and locked margin remain on Hyperliquid. USDC
                  arrives on Arbitrum. Hyperliquid currently documents a $1 fee
                  and about five minutes to complete.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="recovery-confirmation">
                  Type WITHDRAW to confirm
                </Label>
                <Input
                  id="recovery-confirmation"
                  value={confirmation}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <Card size="sm">
            <CardContent>
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            </CardContent>
          </Card>
        ) : null}
        {success ? (
          <Card size="sm">
            <CardContent>
              <p role="status" className="flex gap-2 text-sm">
                <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
                {success === "unrefreshed"
                  ? "Withdrawal accepted by Hyperliquid, but the balance could not be refreshed. Check Arbitrum or reconnect before trying again."
                  : "Withdrawal accepted by Hyperliquid. Delivery to Arbitrum normally takes about five minutes."}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </DialogBody>

      {address && balance ? (
        <DialogFooter>
          <Button
            type="submit"
            disabled={
              busy ||
              !amount ||
              Boolean(amountError) ||
              confirmation !== "WITHDRAW"
            }
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Sign and withdraw {amount || "USDC"}
          </Button>
        </DialogFooter>
      ) : null}
    </form>
  )
}

function getRecoveryError(error: unknown) {
  return error instanceof Error ? error.message : "The withdrawal failed."
}
