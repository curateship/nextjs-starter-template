import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { ApiKeyCard } from "@/components/video-editor/api-key-card"
import { useSaveAfterTyping } from "@/components/video-editor/use-save-after-typing"
import {
  getPromoErrorMessage,
  loadPromoSettings,
  removePromoKey,
  savePromoAddress,
  savePromoKey,
  testPromoKey,
} from "@/lib/api/video/promo"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A typed address saves itself this long after the last letter. */
const SAVE_DELAY_MS = 900

/** The saved address, held for the life of the page so the tab draws at once. */
let heldUrl: string | null = null

const loadKeyStatus = () => loadPromoSettings().then((settings) => settings.key)

/**
 * Settings → Promo (`workspace/docs/send-to-promo.md`): Promo's address and
 * the key made on Promo's Settings → Video. Both save themselves. Test this
 * key tells Promo where this Video is, which Promo needs before it fetches
 * anything, and says whose Promo answered.
 */
function PromoSettings() {
  const [url, setUrl] = React.useState<string | null>(heldUrl)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const typing = useSaveAfterTyping(SAVE_DELAY_MS)

  React.useEffect(() => {
    if (heldUrl !== null) return
    let cancelled = false
    loadPromoSettings().then(
      (settings) => {
        heldUrl = settings.url
        if (!cancelled) setUrl(settings.url)
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(getPromoErrorMessage(error))
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
      const saved = await savePromoAddress(value)
      heldUrl = saved.url
      setInvalid(false)
      setSaveStatus("saved")
    } catch (error) {
      // What was typed stays, so a refused save loses nothing.
      setInvalid(true)
      setSaveStatus("idle")
      showErrorToast(getPromoErrorMessage(error))
    }
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="video-promo-address"
        title="Promo"
        description="Send to Promo, on the Exports page and in the editor, puts videos, carousels and thumbnails into a Promo project's Archive."
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
            <FieldLabel htmlFor="video-promo-url" hint="The address you open Promo at, such as https://promo.example.com.">
              Promo's address
            </FieldLabel>
            <Input
              id="video-promo-url"
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
        storageId="video-promo-key"
        title="Promo key"
        description="Make it on Promo's Settings → Video and paste it here. Things sent land in the projects of the Promo admin who made it."
        company="Promo"
        notSet="Send to Promo needs one."
        removeWarning="Send to Promo stops until a key is pasted again. Everything already in Promo's Archive stays there."
        load={loadKeyStatus}
        save={savePromoKey}
        remove={removePromoKey}
        test={testPromoKey}
        errorMessage={getPromoErrorMessage}
      />
    </CardGroup>
  )
}

export default PromoSettings
