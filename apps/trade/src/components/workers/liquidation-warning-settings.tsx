import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getLiquidationWarningLoadErrorMessage,
  getLiquidationWarningSaveErrorMessage,
  loadLiquidationWarningSettings,
  saveLiquidationWarningSettings,
} from "@/lib/api/liquidation-warning-settings"
import type { LiquidationWarning } from "@/lib/trade/liquidation-warning"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

function optionalNumber(value: string): number | null | undefined {
  if (value.trim() === "") return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

export function LiquidationWarningSettings({
  initialValue,
}: {
  initialValue?: LiquidationWarning
}) {
  const mounted = React.useRef(false)
  const [usd, setUsd] = React.useState(
    initialValue?.usd === null || initialValue === undefined
      ? ""
      : String(initialValue.usd)
  )
  const [pct, setPct] = React.useState(
    initialValue?.pct === null || initialValue === undefined
      ? ""
      : String(initialValue.pct)
  )
  const [loaded, setLoaded] = React.useState(initialValue !== undefined)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const usdValue = optionalNumber(usd)
  const pctValue = optionalNumber(pct)
  const invalidUsd =
    usdValue === undefined || (usdValue !== null && usdValue > 1_000_000_000)
  const invalidPct =
    pctValue === undefined || (pctValue !== null && pctValue > 100)

  const load = React.useCallback(() => {
    void loadLiquidationWarningSettings()
      .then((warning) => {
        if (!mounted.current) return
        setUsd(warning.usd === null ? "" : String(warning.usd))
        setPct(warning.pct === null ? "" : String(warning.pct))
        setLoaded(true)
        setLoadFailed(false)
      })
      .catch((error) => {
        if (!mounted.current) return
        setLoadFailed(true)
        showErrorToast(getLiquidationWarningLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(() => {
    mounted.current = true
    if (initialValue === undefined) load()
    return () => {
      mounted.current = false
    }
  }, [initialValue, load])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (invalidUsd || invalidPct) {
      showErrorToast("Enter positive amounts. Out of 100 cannot be above 100.")
      return
    }
    dismissErrorToast()
    setBusy(true)
    try {
      const warning = await saveLiquidationWarningSettings({
        usd: usdValue ?? null,
        pct: pctValue ?? null,
      })
      setUsd(warning.usd === null ? "" : String(warning.usd))
      setPct(warning.pct === null ? "" : String(warning.pct))
      toast.success("Liquidation warning saved.")
    } catch (error) {
      showErrorToast(getLiquidationWarningSaveErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-between gap-3 border-t p-4">
        <p className="text-sm text-muted-foreground">
          {loadFailed
            ? "The liquidation warning could not be loaded."
            : "Loading liquidation warning…"}
        </p>
        {loadFailed ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoadFailed(false)
              load()
            }}
          >
            Try again
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <form
      className="grid gap-4 border-t p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      onSubmit={(event) => void save(event)}
    >
      <div>
        <h3 className="font-medium">Warn before liquidation</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Send one notice when a worked position crosses either distance. Leave
          both blank to switch it off.
        </p>
      </div>
      <fieldset
        className="flex flex-wrap items-end gap-2"
        disabled={!loaded || busy}
      >
        <legend className="sr-only">Liquidation warning distances</legend>
        <div className="grid gap-1">
          <Label htmlFor="liquidation-warning-usd">Dollars away</Label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="liquidation-warning-usd"
              className="w-32 pl-7"
              type="number"
              inputMode="decimal"
              min={0.01}
              max={1_000_000_000}
              step="any"
              placeholder="Off"
              value={usd}
              aria-invalid={invalidUsd}
              onChange={(event) => setUsd(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="liquidation-warning-pct">Out of 100 away</Label>
          <div className="relative">
            <Input
              id="liquidation-warning-pct"
              className="w-36 pr-12"
              type="number"
              inputMode="decimal"
              min={0.01}
              max={100}
              step="any"
              placeholder="Off"
              value={pct}
              aria-invalid={invalidPct}
              onChange={(event) => setPct(event.target.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
              /100
            </span>
          </div>
        </div>
        <Button type="submit">{busy ? "Saving…" : "Save"}</Button>
      </fieldset>
    </form>
  )
}
