import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { ApiKeyCard } from "@/components/viral/settings/api-key-card"
import { useSaveAfterTyping } from "@/components/viral/settings/use-save-after-typing"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  loadPromoConnection,
  removePromoKeyFn,
  savePromoKeyFn,
  savePromoUrlFn,
  testPromoConnection,
} from "@/lib/api/viral/viral-promo"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A typed address saves itself this long after the last letter. */
const SAVE_DELAY_MS = 900

/** The saved address, held for the life of the page so the tab draws at once. */
let heldUrl: string | null = null

const loadKeyStatus = () => loadPromoConnection().then((settings) => settings.key)

/**
 * Settings → Promo connection (`workspace/docs/promo-connection.md`): the
 * Promo app's address and the key made on Promo's Settings → Viral. Both
 * save themselves. Test tells Promo where this Viral is, which Promo needs
 * before it calls back, and says whose Promo answered. Copied from
 * Settings → Video connection.
 */
function PromoConnectionSettings() {
  const [url, setUrl] = React.useState<string | null>(heldUrl)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const typing = useSaveAfterTyping(SAVE_DELAY_MS)

  React.useEffect(() => {
    if (heldUrl !== null) return
    let cancelled = false
    loadPromoConnection().then(
      (settings) => {
        heldUrl = settings.url
        if (!cancelled) setUrl(settings.url)
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(getViralErrorMessage(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [reloads])

  async function save(value: string) {
    typing.cancel()
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const saved = await savePromoUrlFn(value)
      heldUrl = saved.url
      setInvalid(false)
      setSaveStatus("saved")
    } catch (error) {
      // What was typed stays, so a refused save loses nothing.
      setInvalid(true)
      setSaveStatus("idle")
      showErrorToast(getViralErrorMessage(error))
    }
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="viral-promo-address"
        title="Promo"
        description="Promo reads X, LinkedIn and Reddit for Viral with its own search accounts, and keeps the posts Write a post for Promo makes as drafts."
        contentClassName="grid gap-2"
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : url === null ? (
          <LoadingRow label="Reading Promo's address…" />
        ) : (
          <>
            <FieldLabel htmlFor="viral-promo-url" hint="The address you open Promo at, such as https://promo.example.com.">
              Promo's address
            </FieldLabel>
            <Input
              id="viral-promo-url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://promo.example.com"
              maxLength={500}
              value={url}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                const value = event.target.value
                setUrl(value)
                typing.later(() => void save(value))
              }}
              onBlur={() => {
                if (url !== heldUrl) void save(url)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save(url)
              }}
            />
          </>
        )}
      </CollapsibleSettingsCard>
      <ApiKeyCard
        storageId="viral-promo-key"
        title="Promo key"
        description="Make it on Promo's Settings → Viral and paste it here. Reads run on that Promo admin's search accounts, and posts land in their projects."
        company="Promo"
        notSet="Reading X, LinkedIn and Reddit, and Write a post for Promo, need one."
        removeWarning="Reads through Promo and Write a post for Promo stop until a key is pasted again. Drafts already in Promo stay there."
        load={loadKeyStatus}
        save={savePromoKeyFn}
        remove={removePromoKeyFn}
        test={testPromoConnection}
        errorMessage={getViralErrorMessage}
      />
    </CardGroup>
  )
}

export default PromoConnectionSettings
