import * as React from "react"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Switch } from "@/components/ui/switch"
import {
  loadDirectorySettings,
  saveBadgeSettings,
} from "@/lib/api/directory/settings"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

export function ListingBadgeSettings() {
  const [enabled, setEnabled] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [save, saving] = useAsyncAction((error) => {
    const message = error instanceof Error ? error.message : ""
    return message || "The badge setting could not be saved."
  })

  React.useEffect(() => {
    void loadDirectorySettings()
      .then((settings) => {
        setEnabled(settings.badgesEnabled)
        setLoaded(true)
      })
      .catch(() => showErrorToast("The badge setting could not be loaded."))
  }, [])

  return (
    <CollapsibleSettingsCard
      storageId="listing-badges"
      title="Listing badges"
      description="Let listing owners copy a badge for their own website."
      contentClassName="space-y-4"
    >
      <div className="flex items-center gap-2">
        <Switch
          id="listing-badges-enabled"
          checked={enabled}
          disabled={!loaded || saving}
          onCheckedChange={(next) => {
            const previous = enabled
            setEnabled(next)
            void save(() => saveBadgeSettings(next)).then((saved) => {
              if (!saved) setEnabled(previous)
            })
          }}
        />
        <FieldLabel htmlFor="listing-badges-enabled">
          Let owners share listing badges
        </FieldLabel>
      </div>
    </CollapsibleSettingsCard>
  )
}
