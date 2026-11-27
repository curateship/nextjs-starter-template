import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ApiKeyCard } from "@/components/viral/settings/api-key-card"
import {
  getViralErrorMessage,
  loadYoutubeKeyStatus,
  loadYoutubeUnitsToday,
  removeYoutubeKey,
  saveYoutubeKey,
  testYoutubeKey,
} from "@/lib/api/viral/viral"

/**
 * Settings → YouTube (`workspace/docs/finding-content.md`): the one key
 * Viral searches YouTube with, saved scrambled, and the units spent today.
 * Removing the saved key falls back to the VIRAL_YOUTUBE_API_KEY env var, if
 * the deployment sets one.
 */
function YoutubeSettings() {
  const [units, setUnits] = React.useState<{ used: number; allowance: number } | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    loadYoutubeUnitsToday().then(
      (loaded) => {
        if (!cancelled) setUnits(loaded)
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(getViralErrorMessage(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [reloads])

  return (
    <CardGroup>
      <ApiKeyCard
        storageId="viral-youtube-key"
        title="YouTube key"
        description="Keyword searches, YouTube creators and the Outlier figures all use this key. Get one free at console.cloud.google.com by switching on the YouTube Data API v3."
        company="YouTube"
        notSet="Searching YouTube needs one."
        removeWarning="Searching stops unless the deployment's VIRAL_YOUTUBE_API_KEY is set. Everything already found stays."
        load={loadYoutubeKeyStatus}
        save={saveYoutubeKey}
        remove={removeYoutubeKey}
        test={testYoutubeKey}
        errorMessage={getViralErrorMessage}
      />
      <CollapsibleSettingsCard
        storageId="viral-youtube-units"
        title="Today's allowance"
        description="YouTube gives 10,000 free units a day, starting again at midnight Pacific time. A keyword search costs 102, and reading a creator or a channel's usual views costs 2."
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : !units ? (
          <LoadingRow label="Counting today's units…" />
        ) : (
          <p className="text-sm">
            {units.used.toLocaleString()} of {units.allowance.toLocaleString()} units used today, about{" "}
            {Math.floor(Math.max(0, units.allowance - units.used) / 102).toLocaleString()} keyword searches left.
          </p>
        )}
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

export default YoutubeSettings
