import * as React from "react"
import { useRouter } from "@tanstack/react-router"
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
  getMarketSettingsLoadErrorMessage,
  getMarketSettingsSaveErrorMessage,
  loadMarketSettings,
  saveMarketSettings,
} from "@/lib/api/market-settings"
import { MAXIMUM_MARKET_VOLUME_USD } from "@/lib/trade/market-volume"
import {
  dismissErrorToast,
  showErrorToast,
} from "@/lib/toast/error-toast"

const FIELD_ID = "minimum-market-volume"

export default function MarketSettings() {
  const [value, setValue] = React.useState("")
  const [loaded, setLoaded] = React.useState(false)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)

  const load = React.useCallback(() => {
    void loadMarketSettings()
      .then(({ minimumVolumeUsd }) => {
        setValue(String(minimumVolumeUsd))
        setLoaded(true)
      })
      .catch((error) => {
        setLoadFailed(true)
        showErrorToast(getMarketSettingsLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(load, [load])

  const parsedValue = () => {
    const number = value.trim() === "" ? 0 : Number(value)
    return Number.isFinite(number) &&
      number >= 0 &&
      number <= MAXIMUM_MARKET_VOLUME_USD
      ? number
      : null
  }

  const validate = () => {
    const nextInvalid = parsedValue() === null
    setInvalid(nextInvalid)
    if (nextInvalid) {
      showErrorToast("Enter a dollar amount of zero or more.")
    }
    return !nextInvalid
  }

  const router = useRouter()
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    const minimumVolumeUsd = parsedValue()
    if (minimumVolumeUsd === null) return
    dismissErrorToast()
    setBusy(true)
    try {
      const answer = await saveMarketSettings(minimumVolumeUsd)
      setValue(String(answer.minimumVolumeUsd))
      setInvalid(false)
      toast.success("Market filter saved.")
      // The dashboards keep their market list for a minute. A new cutoff
      // must show on the next visit, not a minute later.
      void router.invalidate()
    } catch (error) {
      showErrorToast(getMarketSettingsSaveErrorMessage(error))
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
              ? "The market setting could not be loaded."
              : "Loading market settings…"}
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
        <CardTitle>Market visibility</CardTitle>
        <CardDescription>
          Hide thinly traded markets from every protocol.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(event) => void save(event)}>
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={FIELD_ID}
              hint="Markets below this daily dollar volume disappear everywhere, including Favorites and a market already open. Zero keeps only markets with reported volume."
            >
              Minimum daily volume, USD
            </FieldLabel>
            <Input
              id={FIELD_ID}
              type="number"
              inputMode="decimal"
              min={0}
              max={MAXIMUM_MARKET_VOLUME_USD}
              step={1}
              value={value}
              aria-invalid={invalid}
              onChange={(event) => {
                setValue(event.target.value)
                if (invalid) setInvalid(false)
              }}
              onBlur={validate}
            />
          </div>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
