import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AI_PROVIDER_NAMES } from "@/lib/ai/ai-models"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadWriterSettings, saveWriterFn, type WriterSettings } from "@/lib/api/viral/viral-writer"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { canUseWriter, keyPhrase, WRITERS, writerById, type WriterId } from "@/lib/viral/writers"

/** The settings as last read, held for the life of the page, so coming back to the tab draws at once. */
let held: WriterSettings | null = null

/**
 * Settings → AI writer (`workspace/docs/ai-analysis.md`): which AI writes
 * Viral's words, picked once for every project (Tyler, 6 Nov 2026: "Once in
 * Settings"). It saves the moment it is picked. A writer whose key is missing
 * is listed greyed out with the key to add, as Video's writer choice does.
 */
function WriterSettingsPanel() {
  const [settings, setSettingsState] = React.useState<WriterSettings | null>(held)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const setSaveStatus = useReportedSaveStatus()

  function setSettings(next: WriterSettings) {
    held = next
    setSettingsState(next)
  }

  React.useEffect(() => {
    let cancelled = false
    loadWriterSettings().then(
      (loaded) => {
        held = loaded
        if (!cancelled) setSettingsState(loaded)
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(getViralErrorMessage(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [reloads])

  async function pick(next: WriterId) {
    if (!settings) return
    const before = settings
    // Shown at once; put back if the save is refused.
    setSettings({ ...settings, saved: next, using: next })
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setSettings(await saveWriterFn(next))
      setSaveStatus("saved")
    } catch (error) {
      setSettings(before)
      setSaveStatus("idle")
      showErrorToast(getViralErrorMessage(error))
    }
  }

  const lost = settings?.saved && settings.using !== settings.saved ? writerById(settings.saved) : null
  const using = settings?.using ? writerById(settings.using) : null

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="viral-writer"
        title="Who writes"
        description="The AI that writes every analysis, script, post, search line and keyword idea, in every project. Gemini Flash still watches each video for its breakdown, whoever writes."
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : !settings ? (
          <LoadingRow label="Reading the writer…" />
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="viral-writer">Writer</Label>
            <Select value={settings.using ?? ""} onValueChange={(value) => void pick(value as WriterId)}>
              <SelectTrigger id="viral-writer">
                <SelectValue placeholder="No AI key is saved" />
              </SelectTrigger>
              <SelectContent>
                {WRITERS.map((writer) => {
                  const usable = canUseWriter(writer, settings.keys)
                  return (
                    <SelectItem key={writer.id} value={writer.id} disabled={!usable}>
                      {usable ? writer.label : `${writer.label}. Needs ${keyPhrase(writer.provider)} in Settings → AI.`}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {!using
                ? "No AI key is saved. Add a Google Gemini, OpenAI or Anthropic key in Settings → AI."
                : lost
                  ? `${lost.label} was chosen, but no ${AI_PROVIDER_NAMES[lost.provider]} key is saved any more, so ${using.label} is writing. Add the key in Settings → AI to switch back.`
                  : "Every price shown before the AI runs names this writer and uses its price."}
            </p>
          </div>
        )}
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

export default WriterSettingsPanel
