import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  getLineAlertsPausedLoadErrorMessage,
  getLineAlertsPausedSaveErrorMessage,
  loadLineAlertsPausedSetting,
  saveLineAlertsPausedSetting,
} from "@/lib/api/trade/line-alert-settings"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The master switch for alerts on drawn lines. Off pauses every one on the
 * account without switching any of them off, so a week away does not mean
 * re-arming twenty lines on the way back. The switch reads on when alerts
 * are watched; what is saved is the pause.
 */
export function LineAlertSettings() {
  const mounted = React.useRef(false)
  const [paused, setPaused] = React.useState<boolean | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(() => {
    loadLineAlertsPausedSetting()
      .then((answer) => {
        if (!mounted.current) return
        setPaused(answer)
        setLoadFailed(false)
      })
      .catch((error: unknown) => {
        if (!mounted.current) return
        setLoadFailed(true)
        showErrorToast(getLineAlertsPausedLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
    }
  }, [load])

  const change = async (on: boolean) => {
    if (busy || paused === null) return
    const previous = paused
    setPaused(!on)
    setBusy(true)
    try {
      const saved = await saveLineAlertsPausedSetting(!on)
      if (mounted.current) setPaused(saved)
      toast.success(
        saved
          ? "Line alerts are paused. Every line keeps its alert, and none rings until this is back on."
          : "Line alerts are on."
      )
    } catch (error) {
      if (mounted.current) setPaused(previous)
      showErrorToast(getLineAlertsPausedSaveErrorMessage(error))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Line alerts</CardTitle>
        <CardDescription>
          Alerts set on drawn trendlines and levels.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {paused === null ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {loadFailed
                ? "The line alerts setting could not be loaded."
                : "Loading the line alerts setting…"}
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
            <label htmlFor="line-alerts" className="min-w-0">
              <span className="block text-sm font-medium">Line alerts</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Off pauses every line alert on the account without switching
                any of them off. They start watching again when this goes back
                on, and a cross that happened while paused does not ring.
              </span>
            </label>
            <Switch
              id="line-alerts"
              checked={!paused}
              disabled={busy}
              onCheckedChange={(checked) => void change(checked)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
