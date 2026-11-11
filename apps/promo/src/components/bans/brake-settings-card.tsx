import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { getBansErrorMessage, loadAppBrakes, releaseAppBrake } from "@/lib/api/bans"
import { appName } from "@/lib/bans/options"
import { formatDateTime } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Release on Settings → Phones (Bans task, part 11): two bans of one app in a
 * day paused every account on it, and nothing restarts until a person
 * presses Release. Shown only while an app is paused; the Bans dashboard has
 * the same button.
 */
export function BrakeSettingsCard() {
  const [brakes, setBrakes] = React.useState<Array<{ app: string; at: Date }>>([])
  const [busy, setBusy] = React.useState<string | null>(null)

  const read = React.useCallback(() => {
    loadAppBrakes().then(setBrakes, (failure: unknown) => showErrorToast(getBansErrorMessage(failure)))
  }, [])
  React.useEffect(read, [read])

  if (!brakes.length) return null
  return (
    <CollapsibleSettingsCard
      storageId="promo-phones-brake"
      title="Paused after two bans in a day"
      description="Every account on these apps is paused, on phones and in browsers. Their jobs wait."
      contentClassName="grid gap-3"
    >
      {brakes.map((brake) => (
        <div key={brake.app} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">
            {appName(brake.app)}, since {formatDateTime(brake.at)}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(brake.app)
              try {
                await releaseAppBrake(brake.app)
                read()
              } catch (failure) {
                showErrorToast(getBansErrorMessage(failure))
              } finally {
                setBusy(null)
              }
            }}
          >
            {busy === brake.app ? <Loader2Icon className="animate-spin" /> : null}
            Release {appName(brake.app)}
          </Button>
        </div>
      ))}
    </CollapsibleSettingsCard>
  )
}
