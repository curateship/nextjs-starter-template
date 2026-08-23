import * as React from "react"
import { AlertTriangleIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  getLiquidationWarningLoadErrorMessage,
  getLiquidationWarningSaveErrorMessage,
  loadLiquidationWarningSettings,
  saveLiquidationWarningSettings,
} from "@/lib/api/liquidation-warning-settings"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

function optionalNumber(value: string): number | null | undefined {
  if (value.trim() === "") return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

export function LiquidationWarningSettings() {
  const mounted = React.useRef(false)
  const [usd, setUsd] = React.useState("")
  const [pct, setPct] = React.useState("")
  const [loaded, setLoaded] = React.useState(false)
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
    load()
    return () => {
      mounted.current = false
    }
  }, [load])

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
      <Card>
        <CardContent className="flex items-center justify-between gap-3">
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
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangleIcon className="size-4" />
          Liquidation warning
        </CardTitle>
        <CardDescription>
          Send one notice when a worked position crosses either distance. Leave
          both blank to switch it off.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(event) => void save(event)}>
          <fieldset className="grid gap-3" disabled={!loaded || busy}>
            <legend className="text-sm font-medium">
              Warn before liquidation
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="liquidation-warning-usd"
                  hint="The dollar gap between the current price and liquidation price."
                >
                  Dollars away
                </FieldLabel>
                <Input
                  id="liquidation-warning-usd"
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
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="liquidation-warning-pct"
                  hint="For example, 5 means five out of 100 of the current price."
                >
                  Out of 100 away
                </FieldLabel>
                <Input
                  id="liquidation-warning-pct"
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
              </div>
            </div>
          </fieldset>
          <div>
            <Button type="submit" disabled={!loaded || busy}>
              {busy ? "Saving…" : "Save warning"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
