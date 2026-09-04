import * as React from "react"
import { toast } from "sonner"

import { useTradePageTitle } from "@/app/page-title"
import { LineAlertSettings } from "@/components/trade/line-alert-settings"
import { useRememberedTradeSoundSetting } from "@/components/trade/trade-sounds"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  getTradeSoundSettingsLoadErrorMessage,
  getTradeSoundSettingsSaveErrorMessage,
  loadTradeSoundSettings,
  saveTradeSoundSettings,
} from "@/lib/api/trade/trade-sound-settings"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  ensureTradeSoundSetting,
  primeTradeSounds,
  previewPriceAlertSound,
  rememberTradeSoundSetting,
  TRADE_SOUND_SETTINGS_CHANNEL,
  TRADE_SOUNDS_OFF,
  type TradeSoundSettings,
} from "@/lib/trade/trade-sounds"

/**
 * The Sounds tab: the two sound switches, and under them the master switch
 * for alerts on drawn lines, which sits beside them because a sound and an
 * alert are the two things this app can do to interrupt somebody.
 */
export default function TradeSoundSettings() {
  useTradePageTitle("Settings")
  return (
    <CardGroup>
      <TradeSoundSettingsCard />
      <LineAlertSettings />
    </CardGroup>
  )
}

function TradeSoundSettingsCard() {
  const mounted = React.useRef(false)
  const rememberedSetting = useRememberedTradeSoundSetting()
  const settings = rememberedSetting ?? TRADE_SOUNDS_OFF
  const loaded = rememberedSetting !== undefined
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [busy, setBusy] = React.useState<keyof TradeSoundSettings | null>(null)

  const load = React.useCallback(() => {
    void ensureTradeSoundSetting(loadTradeSoundSettings)
      .then(() => {
        if (!mounted.current) return
        setLoadFailed(false)
      })
      .catch((error) => {
        if (!mounted.current) return
        setLoadFailed(true)
        showErrorToast(getTradeSoundSettingsLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
    }
  }, [load])

  const change = async (kind: keyof TradeSoundSettings, next: boolean) => {
    if (busy) return
    const previous = settings
    const changed = { ...settings, [kind]: next }
    // Start the relevant audio elements inside the switch click, when the
    // browser is allowed to grant playback permission.
    const preview = next
      ? kind === "alerts"
        ? previewPriceAlertSound()
        : primeTradeSounds()
      : null
    rememberTradeSoundSetting(changed)
    setBusy(kind)
    try {
      const answer = await saveTradeSoundSettings(changed)
      rememberTradeSoundSetting(answer)
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(TRADE_SOUND_SETTINGS_CHANNEL)
        channel.postMessage(answer)
        channel.close()
      }
      const previewPlayed = preview ? await preview : true
      if (next && !previewPlayed) {
        toast.warning(
          "Trade sounds are on, but the test sound could not play. Allow sound for this site, then switch sounds off and on again."
        )
      } else {
        toast.success(
          next
            ? kind === "alerts"
              ? "Price alert sounds are on. That was the alert sound."
              : "Fill and stop sounds are on. That was the fill sound."
            : kind === "alerts"
              ? "Price alert sounds are off."
              : "Fill and stop sounds are off."
        )
      }
    } catch (error) {
      rememberTradeSoundSetting(previous)
      showErrorToast(getTradeSoundSettingsSaveErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade sounds</CardTitle>
        <CardDescription>
          Choose which events an open trading screen plays out loud.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {loadFailed
                ? "The sound setting could not be loaded."
                : "Loading sound settings…"}
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
        ) : (
          <div className="grid gap-4">
            <SoundSettingRow
              id="trade-sounds"
              label="Fills and stops"
              description="Fills use a short high sound. Stops and targets use a lower warning sound. Turning this on plays the fill sound once."
              checked={settings.fillsAndStops}
              disabled={!loaded || busy !== null}
              onChange={(checked) => void change("fillsAndStops", checked)}
            />
            <SoundSettingRow
              id="price-alert-sounds"
              label="Price alerts"
              description="A crossed price line uses its own alert sound. Turning this on plays that sound once."
              checked={settings.alerts}
              disabled={!loaded || busy !== null}
              onChange={(checked) => void change("alerts", checked)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SoundSettingRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {description}
        </span>
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  )
}
