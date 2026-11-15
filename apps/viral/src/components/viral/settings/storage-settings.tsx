import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { cleanUpStorageFn, loadStorageSummary, type StorageSummary } from "@/lib/api/viral/viral-storage"
import { formatFileSize } from "@/lib/format/format-bytes"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { STORAGE_UNOPENED_DAYS } from "@/lib/viral/storage"

/** The figures as last read, held for the life of the page, so coming back to the tab draws at once. */
let held: StorageSummary | null = null

/**
 * Settings → Storage (`workspace/docs/storage.md`): the space Viral's
 * downloaded copies use, and the one button that deletes the copies nobody
 * has opened for 30 days (Tyler, 4 Nov 2026: "Button only"). Vault copies are
 * never touched, and each saved video keeps its breakdown and analyses.
 */
function StorageSettings() {
  const [summary, setSummaryState] = React.useState<StorageSummary | null>(held)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [asking, setAsking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  function setSummary(next: StorageSummary) {
    held = next
    setSummaryState(next)
  }

  React.useEffect(() => {
    let cancelled = false
    loadStorageSummary().then(
      (loaded) => {
        held = loaded
        if (!cancelled) setSummaryState(loaded)
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(getViralErrorMessage(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [reloads])

  async function cleanUp() {
    setBusy(true)
    try {
      const done = await cleanUpStorageFn()
      setSummary(done.summary)
      setAsking(false)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="viral-storage"
        title="Downloaded videos"
        description={`Analyse with AI and Save to vault keep a full copy of each video. The button deletes copies nobody has opened for ${STORAGE_UNOPENED_DAYS} days. Copies a vault idea keeps are never deleted.`}
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : !summary ? (
          <LoadingRow label="Adding up the copies…" />
        ) : (
          <div className="grid gap-4">
            <dl className="grid gap-2 text-sm">
              <Figure
                label="Every copy"
                value={`${summary.copies} ${plural(summary.copies, "video")}, ${formatFileSize(summary.bytes)}`}
              />
              <Figure
                label="Kept by the vault"
                value={`${summary.vaultCopies} ${plural(summary.vaultCopies, "video")}, ${formatFileSize(summary.vaultBytes)}`}
              />
              <Figure
                label={`Not opened for ${STORAGE_UNOPENED_DAYS} days`}
                value={`${summary.freeableCopies} ${plural(summary.freeableCopies, "video")}, ${formatFileSize(summary.freeableBytes)}`}
              />
            </dl>
            <div>
              <Button type="button" variant="outline" onClick={() => setAsking(true)}>
                {busy ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                Delete unopened copies
              </Button>
            </div>
          </div>
        )}
      </CollapsibleSettingsCard>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Delete copies nobody opened?"
        description={
          summary && summary.freeableCopies
            ? `${summary.freeableCopies} downloaded ${plural(summary.freeableCopies, "copy", "copies")} go, freeing ${formatFileSize(summary.freeableBytes)}. The videos stay in their projects with their breakdowns and analyses, and play from the platform. Vault copies stay.`
            : "No copy has gone unopened for 30 days, so nothing would go. Vault copies are never deleted."
        }
        confirmLabel="Delete copies"
        loading={busy}
        onConfirm={() => void cleanUp()}
      />
    </CardGroup>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  )
}

export default StorageSettings
