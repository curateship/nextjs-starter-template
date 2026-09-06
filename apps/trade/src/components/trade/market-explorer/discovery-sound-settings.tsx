import * as React from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  loadDiscoverySound,
  saveDiscoverySound,
} from "@/lib/api/trade/explorer-sound"
import {
  playDiscoverySound,
  primeDiscoverySound,
} from "@/lib/trade/discovery-sound"
import { showErrorToast } from "@/lib/toast/error-toast"

export function DiscoverySoundSettings() {
  const [enabled, setEnabled] = React.useState<boolean | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const load = React.useCallback(() => {
    void loadDiscoverySound()
      .then((value) => {
        setEnabled(value)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])
  React.useEffect(load, [load])
  async function change(next: boolean) {
    if (busy) return
    const previous = enabled
    if (next)
      void primeDiscoverySound().then((ready) => {
        if (ready) playDiscoverySound()
        else
          showErrorToast(
            "The discovery preview could not play. Check this site's sound permission."
          )
      })
    setEnabled(next)
    setBusy(true)
    try {
      await saveDiscoverySound(next)
      window.dispatchEvent(
        new CustomEvent("trade-discovery-sound", { detail: next })
      )
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("trade-discovery-sound")
        channel.postMessage(next)
        channel.close()
      }
    } catch {
      setEnabled(previous)
      showErrorToast("Discovery sounds could not be saved. Try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Market discovery sounds</CardTitle>
      </CardHeader>
      <CardContent>
        {failed ? (
          <Button variant="outline" onClick={load}>
            Retry discovery sound settings
          </Button>
        ) : enabled === null ? (
          <span>Loading discovery sound settings…</span>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={enabled}
              disabled={busy}
              onCheckedChange={(next) => void change(next)}
            />
            Discovery sounds. Only while the Markets page is open.
          </label>
        )}
      </CardContent>
    </Card>
  )
}
