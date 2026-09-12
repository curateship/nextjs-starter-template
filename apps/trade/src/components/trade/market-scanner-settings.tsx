import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { CANDLE_INTERVALS, type ProtocolId } from "@/lib/protocols/contracts"
import { getLiveAdapter } from "@/lib/protocols/live-registry"
import { saveMarketScannerSettings } from "@/lib/api/trade/market-scanner"
import {
  scannerSettingsSchema,
  type ScannerSettings,
} from "@/lib/trade/market-scanner"
import { showErrorToast } from "@/lib/toast/error-toast"

export function MarketScannerSettings({
  settings: savedSettings,
  venues,
  onSave,
  onClose,
  triggerRef,
}: {
  settings: ScannerSettings
  venues: { protocol: ProtocolId; label: string }[]
  onSave: (next: ScannerSettings) => void
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}) {
  const settings = React.useMemo(
    () => scannerSettingsSchema.parse(savedSettings),
    [savedSettings]
  )
  const [draft, setDraft] = React.useState(settings)
  const [numbers, setNumbers] = React.useState({
    priceIncreasePct: String(settings.priceIncreasePct),
    volumeMultiple: String(settings.volumeMultiple),
    minimumVolumeUsd: String(settings.minimumVolumeUsd),
    atrPeriod: String(settings.atrPeriod),
    volatilityMultiple: String(settings.volatilityMultiple),
  })
  const [invalid, setInvalid] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const candidate = {
    ...draft,
    ...Object.fromEntries(
      Object.entries(numbers).map(([key, value]) => [
        key,
        value.trim() === "" ? NaN : Number(value),
      ])
    ),
  }
  const parsedCandidate = scannerSettingsSchema.safeParse(candidate)
  const dirty =
    !parsedCandidate.success ||
    JSON.stringify(parsedCandidate.data) !== JSON.stringify(settings)
  async function save() {
    const parsed = scannerSettingsSchema.safeParse(candidate)
    if (!parsed.success) {
      setInvalid(parsed.error.issues.map((issue) => String(issue.path[0])))
      showErrorToast(
        draft.mode === "price"
          ? "Choose at least one exchange and enter a price increase between 0.1% and 1,000%."
          : "Choose at least one exchange and enter valid positive thresholds. ATR lookback must be 2 to 100 candles."
      )
      return
    }
    setBusy(true)
    try {
      const saved = await saveMarketScannerSettings(parsed.data)
      onSave(saved)
      toast.success("Market scanner settings saved")
    } catch {
      showErrorToast(
        "Could not save Market scanner settings. Your edits are still here. Try again."
      )
    } finally {
      setBusy(false)
    }
  }
  const numberField = (
    key: keyof typeof numbers,
    label: string,
    hint: string,
    min: number,
    max: number,
    step = "any"
  ) => (
    <div className="grid gap-2">
      <FieldLabel htmlFor={`scanner-${key}`} hint={hint}>
        {label}
      </FieldLabel>
      <Input
        id={`scanner-${key}`}
        type="number"
        min={min}
        max={max}
        step={step}
        value={numbers[key]}
        aria-invalid={invalid.includes(key)}
        onChange={(event) =>
          setNumbers({ ...numbers, [key]: event.target.value })
        }
      />
    </div>
  )
  return (
    <FormDialog open dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Market scanner settings</DialogTitle>
            <DialogDescription>
              Choose the move you want to find. Matches stay in your list until
              you delete them.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Scan conditions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="scanner-enabled">
                    Enable scanner
                  </FieldLabel>
                  <Switch
                    id="scanner-enabled"
                    checked={draft.enabled}
                    onCheckedChange={(enabled) =>
                      setDraft({ ...draft, enabled })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="scanner-mode">
                    Find markets by
                  </FieldLabel>
                  <Select
                    value={draft.mode}
                    onValueChange={(mode: ScannerSettings["mode"]) =>
                      setDraft({ ...draft, mode })
                    }
                  >
                    <SelectTrigger id="scanner-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="price">Price increase</SelectItem>
                      <SelectItem value="volume">
                        Unusual trading volume
                      </SelectItem>
                      <SelectItem value="volatility">
                        Unusually large candle movement
                      </SelectItem>
                      <SelectItem value="both">
                        Volume and candle movement
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft({
                      ...draft,
                      enabled: true,
                      mode: "price",
                      priceWindowSeconds: 60,
                    })
                    setNumbers({ ...numbers, priceIncreasePct: "5" })
                  }}
                >
                  Use 5% rise in 1 minute
                </Button>
                <fieldset
                  className="grid gap-4"
                  aria-invalid={invalid.includes("exchanges")}
                >
                  <legend className="mb-2 text-sm font-medium">
                    Exchanges
                  </legend>
                  {venues.map((venue) => (
                    <div
                      key={venue.protocol}
                      className="flex items-center gap-2"
                    >
                      <Checkbox
                        id={`scanner-${venue.protocol}`}
                        checked={draft.exchanges.includes(venue.protocol)}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            exchanges: checked
                              ? [...draft.exchanges, venue.protocol]
                              : draft.exchanges.filter(
                                  (id) => id !== venue.protocol
                                ),
                          })
                        }
                      />
                      <FieldLabel htmlFor={`scanner-${venue.protocol}`}>
                        {venue.label}
                        {!getLiveAdapter(venue.protocol)?.watchFigures
                          ? " · live scanning unavailable"
                          : ""}
                      </FieldLabel>
                    </div>
                  ))}
                </fieldset>
              </CardContent>
            </Card>
            {draft.mode === "price" ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Price increase</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {numberField(
                    "priceIncreasePct",
                    "Price rises at least (%)",
                    "5 means a market moving from $100 to $105 qualifies.",
                    0.1,
                    1000
                  )}
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="scanner-price-window">
                      Within the last
                    </FieldLabel>
                    <Select
                      value={String(draft.priceWindowSeconds)}
                      onValueChange={(value) =>
                        setDraft({
                          ...draft,
                          priceWindowSeconds: value === "60" ? 60 : 300,
                        })
                      }
                    >
                      <SelectTrigger id="scanner-price-window">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">1 minute</SelectItem>
                        <SelectItem value="300">5 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Show a market when its price is at least{" "}
                    {numbers.priceIncreasePct}% higher than{" "}
                    {draft.priceWindowSeconds / 60} minute
                    {draft.priceWindowSeconds === 60 ? "" : "s"} ago. The
                    percentage shown is saved when the market is found. Scanning
                    needs that much price history before finding matches.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Volume</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {numberField(
                      "volumeMultiple",
                      "At least N times usual volume",
                      "Estimated last-minute volume divided by daily volume / 1,440.",
                      0.1,
                      1000
                    )}
                    {numberField(
                      "minimumVolumeUsd",
                      "Minimum estimated dollars per minute",
                      "Markets below your account's minimum daily volume are also excluded.",
                      0,
                      1e12
                    )}
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Volatility and price change</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="scanner-interval"
                        hint="Candle measurements follow the 20 busiest supported markets across selected exchanges. Other volume matches show a dash for price change. Candles are live and still forming."
                      >
                        Candle timeframe
                      </FieldLabel>
                      <Select
                        value={draft.interval}
                        onValueChange={(
                          interval: ScannerSettings["interval"]
                        ) => setDraft({ ...draft, interval })}
                      >
                        <SelectTrigger id="scanner-interval">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CANDLE_INTERVALS.map((interval) => (
                            <SelectItem key={interval} value={interval}>
                              {interval}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {numberField(
                      "atrPeriod",
                      "Average true range lookback",
                      "Average movement including price gaps across preceding finished candles. The current candle is excluded.",
                      2,
                      100,
                      "1"
                    )}
                    {numberField(
                      "volatilityMultiple",
                      "At least N times normal movement",
                      "Current candle high minus low, divided by preceding average true range. Compares a forming candle with whole finished candles.",
                      0.1,
                      1000
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={requestClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
