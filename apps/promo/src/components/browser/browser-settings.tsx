import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NumberField } from "@/components/ui/number-field"
import { IDLE_MINUTES_RANGE, MAX_OPEN_RANGE } from "@/lib/browser/limits"
import {
  getBrowserSettingsErrorMessage,
  loadBrowserSettings,
  saveBrowserSettingsFn,
  type BrowserSettings,
} from "@/lib/api/browser/settings"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Browsers tab in Settings: how many browsers this machine may have open
 * at once, and how long an unused one stays open.
 *
 * Both are the machine's, not a profile's, because the memory they protect is
 * the machine's. Each browser holds about 1.5GB at most.
 */
function BrowserSettingsPanel() {
  const [maxOpen, setMaxOpen] = React.useState(3)
  const [idleMinutes, setIdleMinutes] = React.useState(60)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const fill = React.useCallback((next: BrowserSettings) => {
    setMaxOpen(next.maxOpen)
    setIdleMinutes(next.idleMinutes)
  }, [])

  React.useEffect(() => {
    loadBrowserSettings().then(
      (next) => {
        fill(next)
        setLoading(false)
      },
      (error: unknown) => {
        showErrorToast(getBrowserSettingsErrorMessage(error))
        setLoading(false)
      }
    )
  }, [fill])

  async function save() {
    setSaving(true)
    try {
      fill(await saveBrowserSettingsFn({ maxOpen, idleMinutes }))
      toast.success("Browser settings saved.")
    } catch (error) {
      showErrorToast(getBrowserSettingsErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading the browser settings
      </p>
    )
  }

  return (
    <div className="grid gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>How many browsers run at once</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <NumberField
            id="promo-max-open"
            label="Browsers open at once"
            value={maxOpen}
            min={MAX_OPEN_RANGE.min}
            max={MAX_OPEN_RANGE.max}
            inputClassName="w-full sm:w-32"
            onChange={setMaxOpen}
          />
          <p className="text-sm text-muted-foreground">
            Each browser takes up to 1.5GB of memory and one processor, so {maxOpen}{" "}
            {maxOpen === 1 ? "browser takes" : "browsers take"} up to {formatGigabytes(maxOpen * 1.5)}.
            Opening one more is refused and says why. Profiles also work side by side up to
            this many, so a comment on one profile does not hold up a search on another.
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>When an unused browser closes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <NumberField
            id="promo-idle-minutes"
            label="Minutes unused before it closes"
            value={idleMinutes}
            min={IDLE_MINUTES_RANGE.min}
            max={IDLE_MINUTES_RANGE.max}
            inputClassName="w-full sm:w-32"
            onChange={setIdleMinutes}
          />
          <p className="text-sm text-muted-foreground">
            A browser nobody has searched, posted or watched in this long is closed to give its
            memory back. Its sign-ins stay, and it opens again when it is next needed.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  )
}

/** "4.5GB", "3GB": one decimal only when there is one. */
function formatGigabytes(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}GB`
}

export default BrowserSettingsPanel
