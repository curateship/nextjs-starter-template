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
  loadVideoConnection,
  removeVideoKeyFn,
  saveVideoKeyFn,
  saveVideoUrlFn,
  testVideoConnection,
} from "@/lib/api/viral/viral-video-link"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A typed address saves itself this long after the last letter. */
const SAVE_DELAY_MS = 900

/** The saved address, held for the life of the page so the tab draws at once. */
let heldUrl: string | null = null

const loadKeyStatus = () => loadVideoConnection().then((settings) => settings.key)

/**
 * Settings → Video connection (`workspace/docs/send-to-video.md`): the Video
 * app's address and the key made on Video's Settings → Viral. Both save
 * themselves. Test tells Video where this Viral is, which Video needs before
 * it fetches any file, and says whose Video answered. Copied from Video's
 * own Settings → Promo.
 */
function VideoConnectionSettings() {
  const [url, setUrl] = React.useState<string | null>(heldUrl)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const typing = useSaveAfterTyping(SAVE_DELAY_MS)

  React.useEffect(() => {
    if (heldUrl !== null) return
    let cancelled = false
    loadVideoConnection().then(
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
      const saved = await saveVideoUrlFn(value)
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
        storageId="viral-video-address"
        title="Video"
        description="Send to Video, under a script and on vault ideas, makes a draft video in a Video project with the script and the original video."
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
          <LoadingRow label="Reading Video's address…" />
        ) : (
          <>
            <FieldLabel htmlFor="viral-video-url" hint="The address you open Video at, such as https://video.example.com.">
              Video's address
            </FieldLabel>
            <Input
              id="viral-video-url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://video.example.com"
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
        storageId="viral-video-key"
        title="Video key"
        description="Make it on Video's Settings → Viral and paste it here. Drafts land in the projects of the Video admin who made it."
        company="Video"
        notSet="Send to Video needs one."
        removeWarning="Send to Video stops until a key is pasted again. Drafts already in Video stay there."
        load={loadKeyStatus}
        save={saveVideoKeyFn}
        remove={removeVideoKeyFn}
        test={testVideoConnection}
        errorMessage={getViralErrorMessage}
      />
    </CardGroup>
  )
}

export default VideoConnectionSettings
