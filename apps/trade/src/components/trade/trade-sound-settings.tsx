import * as React from "react"
import { toast } from "sonner"

import { useTradePageTitle } from "@/app/page-title"
import { useRememberedTradeSoundSetting } from "@/components/trade/trade-sounds"
import {
  Card,
  CardContent,
  CardDescription,
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
} from "@/lib/api/trade-sound-settings"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  ensureTradeSoundSetting,
  rememberTradeSoundSetting,
  TRADE_SOUND_SETTINGS_CHANNEL,
} from "@/lib/trade/trade-sounds"

export default function TradeSoundSettings() {
  useTradePageTitle("Settings")
  const mounted = React.useRef(false)
  const rememberedSetting = useRememberedTradeSoundSetting()
  const enabled = rememberedSetting ?? false
  const loaded = rememberedSetting !== undefined
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

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

  const change = async (next: boolean) => {
    if (busy) return
    const previous = enabled
    rememberTradeSoundSetting(next)
    setBusy(true)
    try {
      const answer = await saveTradeSoundSettings(next)
      rememberTradeSoundSetting(answer.enabled)
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(TRADE_SOUND_SETTINGS_CHANNEL)
        channel.postMessage(answer.enabled)
        channel.close()
      }
      toast.success(
        answer.enabled ? "Trade sounds are on." : "Trade sounds are off."
      )
    } catch (error) {
      rememberTradeSoundSetting(previous)
      showErrorToast(getTradeSoundSettingsSaveErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade sounds</CardTitle>
        <CardDescription>
          Hear an open trading screen when money moves.
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
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="trade-sounds" className="min-w-0">
              <span className="block text-sm font-medium">Fills and stops</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Fills use a short high sound. Stops and targets use a lower
                warning sound.
              </span>
            </label>
            <Switch
              id="trade-sounds"
              checked={enabled}
              disabled={!loaded || busy}
              onCheckedChange={(checked) => void change(checked)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
