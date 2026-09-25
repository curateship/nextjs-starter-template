import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  acceptCopyTerms,
  getCopyErrorMessage,
  sendCopyFeeApproval,
  startCopying,
  updateCopying,
} from "@/lib/api/trade/copy-trading"
import {
  BrowserWalletError,
  signBuilderApproval,
} from "@/lib/trade/copy/builder-approval"
import {
  allowanceWords,
  builderFeePercent,
  COPY_PRICE_ALLOWANCE_DEFAULT,
  copySettingsProblem,
  HYPERLIQUID_MAX_BUILDER_FEE,
  type CopyRow,
  type CopySettings,
  type ViewerRelation,
} from "@/lib/trade/copy/copy-rules"
import { formatUsd } from "@/lib/trade/format"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** What the window holds while it is being typed in: text, so a half-typed number stays put. */
type Form = {
  traderWalletId: string
  walletId: string
  dollars: string
  maxOpen: string
  maxLeverage: string
  everyCoin: boolean
  coins: string
  allowance: string
  lossLimit: string
}

function formFor(relation: ViewerRelation, copy: CopyRow | null): Form {
  if (copy) {
    const { settings } = copy
    return {
      traderWalletId: relation.traderWallets[0]?.id ?? "",
      walletId: settings.walletId,
      dollars: String(settings.dollarsPerTrade),
      maxOpen: String(settings.maxOpenUsd),
      maxLeverage: String(settings.maxLeverage),
      everyCoin: settings.coins === null,
      coins: settings.coins?.join(", ") ?? "",
      allowance: String(Number((settings.priceAllowance * 100).toFixed(2))),
      lossLimit:
        settings.lossLimitUsd === null ? "" : String(settings.lossLimitUsd),
    }
  }
  const traderWallet = relation.traderWallets[0]
  const wallet = relation.myWallets.find(
    (one) => one.protocol === traderWallet?.protocol && one.refusal === null
  )
  return {
    traderWalletId: traderWallet?.id ?? "",
    walletId: wallet?.id ?? "",
    dollars: "200",
    maxOpen: "1000",
    maxLeverage: "5",
    everyCoin: true,
    coins: "",
    allowance: String(COPY_PRICE_ALLOWANCE_DEFAULT * 100),
    lossLimit: "",
  }
}

function settingsFrom(form: Form): CopySettings {
  const lossLimit = form.lossLimit.trim()
  return {
    walletId: form.walletId,
    dollarsPerTrade: Number(form.dollars),
    maxOpenUsd: Number(form.maxOpen),
    maxLeverage: Number(form.maxLeverage),
    coins: form.everyCoin
      ? null
      : form.coins
          .split(/[\s,]+/)
          .map((coin) => coin.trim())
          .filter(Boolean),
    priceAllowance: Number(form.allowance) / 100,
    lossLimitUsd: lossLimit === "" ? null : Number(lossLimit),
  }
}

/**
 * The Copy window on a public profile, and the same window for changing a
 * running copy from the Following page.
 *
 * Up to three steps. The member's first copy ever starts on one screen they
 * must accept. Then the form. A real Hyperliquid wallet whose main wallet has
 * not approved Trade's fee gets a last step that asks the browser wallet to
 * sign that approval.
 */
export function CopyDialog({
  open,
  handle,
  relation,
  copy,
  onClose,
  onSaved,
}: {
  open: boolean
  handle: string
  relation: ViewerRelation
  /** The copy being changed, or null to start one. */
  copy: CopyRow | null
  onClose: () => void
  /** Called after a save lands, before the window closes. */
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = React.useState(() => formFor(relation, copy))
  const [start, setStart] = React.useState(() => formFor(relation, copy))
  const [step, setStep] = React.useState<"consent" | "form" | "fee">(
    copy || relation.consented ? "form" : "consent"
  )
  const [invalid, setInvalid] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [lastOpen, setLastOpen] = React.useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      const fresh = formFor(relation, copy)
      setForm(fresh)
      setStart(fresh)
      setStep(copy || relation.consented ? "form" : "consent")
      setInvalid(null)
    }
  }

  const traderWallet = relation.traderWallets.find(
    (one) => one.id === form.traderWalletId
  )
  const wallets = relation.myWallets.filter(
    (one) => one.protocol === traderWallet?.protocol
  )
  const wallet = relation.myWallets.find((one) => one.id === form.walletId)
  const dirty = JSON.stringify(form) !== JSON.stringify(start)
  const feeRate = Math.min(relation.feeRate, HYPERLIQUID_MAX_BUILDER_FEE)

  function update(patch: Partial<Form>) {
    setForm((current) => ({ ...current, ...patch }))
  }

  async function accept() {
    setBusy(true)
    try {
      await acceptCopyTerms()
      setStep("form")
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function save(settings: CopySettings) {
    setBusy(true)
    try {
      if (copy) await updateCopying(copy.id, settings)
      else {
        await startCopying({
          handle,
          traderWalletId: form.traderWalletId,
          settings,
        })
      }
      await onSaved()
      toast.success(
        copy ? "Copy settings saved." : `Copying @${handle} from now on.`
      )
      onClose()
    } catch (error) {
      showErrorToast(getCopyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function submit() {
    const settings = settingsFrom(form)
    const problem = copySettingsProblem(settings)
    if (problem) {
      setInvalid(problem.field)
      showErrorToast(problem.message)
      return
    }
    if (!copy && !wallet) {
      setInvalid("walletId")
      showErrorToast("Pick the wallet the copies go in.")
      return
    }
    if (!copy && wallet?.refusal) {
      setInvalid("walletId")
      showErrorToast(wallet.refusal)
      return
    }
    dismissErrorToast()
    setInvalid(null)
    if (!copy && wallet?.needsFeeApproval) {
      setStep("fee")
      return
    }
    void save(settings)
  }

  async function approveFee() {
    if (!wallet?.address || !relation.builderAddress) return
    setBusy(true)
    try {
      const approval = await signBuilderApproval({
        address: wallet.address,
        builder: relation.builderAddress,
        maxFeeRate: builderFeePercent(feeRate),
      })
      await sendCopyFeeApproval({ walletId: wallet.id, approval })
    } catch (error) {
      showErrorToast(
        error instanceof BrowserWalletError
          ? error.message
          : getCopyErrorMessage(error)
      )
      setBusy(false)
      return
    }
    setBusy(false)
    await save(settingsFrom(form))
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {copy ? `Copy settings for @${handle}` : `Copy @${handle}`}
            </DialogTitle>
            <DialogDescription>
              Every trade @{handle} makes is placed on your wallet too, at the
              size you pick here.
            </DialogDescription>
          </DialogHeader>

          {step === "consent" ? (
            <>
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle as="h3">Before your first copy</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    <p>This is not advice. Nobody at Trade picks traders for you.</p>
                    <p>
                      Copies can lose money, as much as the trader loses and
                      sometimes more.
                    </p>
                    <p>
                      Your copies fill at different prices from the trader&apos;s,
                      a few seconds later, so what you make will not match what
                      they make.
                    </p>
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={requestClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void accept()}
                >
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  I understand
                </Button>
              </DialogFooter>
            </>
          ) : step === "fee" ? (
            <>
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle as="h3">Approve Trade&apos;s fee</CardTitle>
                    <CardDescription>
                      Each copied trade carries a fee of {builderFeePercent(feeRate)}:
                      {" "}
                      {formatUsd(Number(form.dollars) * feeRate)} on a{" "}
                      {formatUsd(Number(form.dollars))} copy. Hyperliquid only
                      takes it once your main wallet approves it, one time.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    <p>
                      Your browser wallet asks you to sign the approval for{" "}
                      <span className="font-mono">{wallet?.address}</span>. It
                      moves no money. Trades you place by hand never carry the
                      fee.
                    </p>
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setStep("form")}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void approveFee()}
                >
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Approve and copy
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              // The body scrolls only as a flex child of the window.
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle as="h3">Where the copies go</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {!copy && relation.traderWallets.length > 1 ? (
                      <div className="grid gap-2">
                        <Label htmlFor="copy-trader-wallet">
                          @{handle}&apos;s wallet to copy
                        </Label>
                        <Select
                          value={form.traderWalletId}
                          onValueChange={(value) => {
                            const next = relation.traderWallets.find(
                              (one) => one.id === value
                            )
                            const mine = relation.myWallets.find(
                              (one) =>
                                one.protocol === next?.protocol &&
                                one.refusal === null
                            )
                            update({
                              traderWalletId: value,
                              walletId: mine?.id ?? "",
                            })
                          }}
                        >
                          <SelectTrigger
                            id="copy-trader-wallet"
                            className="w-full sm:w-fit"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {relation.traderWallets.map((one) => (
                              <SelectItem key={one.id} value={one.id}>
                                {one.venue}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="copy-wallet"
                        hint="A practice wallet copies with pretend money and no fee, so you can try a trader first."
                      >
                        Your wallet
                      </FieldLabel>
                      {copy ? (
                        <p id="copy-wallet" className="text-sm">
                          {copy.walletLabel} ·{" "}
                          {copy.walletKind === "paper" ? "Practice" : "Real money"}
                          <span className="block text-xs text-muted-foreground">
                            A copy keeps its wallet. Stop it and start a new
                            one to use another.
                          </span>
                        </p>
                      ) : wallets.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          You have no wallet on this exchange. Add a practice
                          wallet on its trading page first.
                        </p>
                      ) : (
                        <Select
                          value={form.walletId}
                          onValueChange={(value) => update({ walletId: value })}
                        >
                          <SelectTrigger
                            id="copy-wallet"
                            className="w-full sm:w-fit"
                            aria-invalid={invalid === "walletId" || undefined}
                          >
                            <SelectValue placeholder="Pick a wallet" />
                          </SelectTrigger>
                          <SelectContent>
                            {wallets.map((one) => (
                              <SelectItem key={one.id} value={one.id}>
                                {one.label} ·{" "}
                                {one.kind === "paper" ? "Practice" : "Real money"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {!copy && wallet?.refusal ? (
                        <p className="text-xs text-muted-foreground">
                          {wallet.refusal}
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle as="h3">How much</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <MoneyField
                      id="copy-dollars"
                      label="Dollars per trade"
                      hint="Each trade the trader opens or adds to puts this much into yours."
                      value={form.dollars}
                      invalid={invalid === "dollarsPerTrade"}
                      onChange={(dollars) => update({ dollars })}
                    />
                    <MoneyField
                      id="copy-max-open"
                      label="Most in copied positions at once"
                      hint="A copy that would take your copied positions past this is skipped."
                      value={form.maxOpen}
                      invalid={invalid === "maxOpenUsd"}
                      onChange={(maxOpen) => update({ maxOpen })}
                    />
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="copy-leverage"
                        hint="A trade the trader makes with more leverage than this is skipped."
                      >
                        Highest leverage
                      </FieldLabel>
                      <Input
                        id="copy-leverage"
                        inputMode="numeric"
                        value={form.maxLeverage}
                        aria-invalid={invalid === "maxLeverage" || undefined}
                        onChange={(event) =>
                          update({ maxLeverage: event.target.value })
                        }
                      />
                    </div>
                    <MoneyField
                      id="copy-loss-limit"
                      label="Pause after losing (optional)"
                      hint="Copying pauses once copied trades have lost this many dollars. A pause closes nothing."
                      value={form.lossLimit}
                      invalid={invalid === "lossLimitUsd"}
                      onChange={(lossLimit) => update({ lossLimit })}
                    />
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle as="h3">Which trades</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="copy-every-coin">Copy every coin</Label>
                      <Switch
                        id="copy-every-coin"
                        checked={form.everyCoin}
                        onCheckedChange={(everyCoin) => update({ everyCoin })}
                      />
                    </div>
                    {form.everyCoin ? null : (
                      <div className="grid gap-2">
                        <Label htmlFor="copy-coins">Coins to copy</Label>
                        <Input
                          id="copy-coins"
                          value={form.coins}
                          placeholder="BTC, ETH, SOL"
                          spellCheck={false}
                          autoCapitalize="characters"
                          aria-invalid={invalid === "coins" || undefined}
                          onChange={(event) =>
                            update({ coins: event.target.value })
                          }
                        />
                      </div>
                    )}
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="copy-allowance"
                        hint="If the price has moved further than this past the trader's by the time your copy starts, the copy is skipped. It also stops chasing once the price runs that far."
                      >
                        Price allowance, dollars in every $100
                      </FieldLabel>
                      <Input
                        id="copy-allowance"
                        inputMode="decimal"
                        value={form.allowance}
                        aria-invalid={invalid === "priceAllowance" || undefined}
                        onChange={(event) =>
                          update({ allowance: event.target.value })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {Number(form.allowance) > 0
                          ? `The copy is skipped if the price moved more than ${allowanceWords(Number(form.allowance) / 100)} past the trader's.`
                          : "Type how far the price may move."}
                      </p>
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
                  {copy ? "Save changes" : "Start copying"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      )}
    </FormDialog>
  )
}

function MoneyField({
  id,
  label,
  hint,
  value,
  invalid,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
