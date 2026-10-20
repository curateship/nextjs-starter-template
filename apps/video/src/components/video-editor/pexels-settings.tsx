import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getPexelsKeyErrorMessage,
  loadPexelsKeyStatus,
  removePexelsKey,
  savePexelsKey,
  testPexelsKey,
  type PexelsKeyStatus,
} from "@/lib/api/video/b-roll"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A pasted key saves itself this long after the last edit. */
const SAVE_DELAY_MS = 1200

/** What a saved key's field shows while it is not being edited. */
const SAVED_SENTINEL = "••••••••••••"

/**
 * The key's status as last read or saved, held for the life of the page, so
 * coming back to this tab draws at once instead of loading again.
 */
let held: PexelsKeyStatus | null = null

/**
 * Settings → Pexels: the key the editor's B-roll tool searches free stock
 * video with. Pasting it saves it, scrambled, with no button. The browser
 * only ever sees its last four characters.
 */
export default function PexelsSettings() {
  const [status, setStatusState] = React.useState<PexelsKeyStatus | null>(held)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [draft, setDraft] = React.useState("")
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [running, setRunning] = React.useState<"test" | "remove" | null>(null)
  const [verdict, setVerdict] = React.useState("")
  const [removing, setRemoving] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  function setStatus(next: PexelsKeyStatus) {
    held = next
    setStatusState(next)
  }

  React.useEffect(() => () => clearTimeout(timer.current), [])

  React.useEffect(() => {
    if (held) return
    let cancelled = false
    loadPexelsKeyStatus()
      .then((loaded) => {
        held = loaded
        if (!cancelled) setStatusState(loaded)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getPexelsKeyErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  // `value` rides in as an argument: the timer saves exactly what was typed
  // when it was set.
  async function save(value: string) {
    const key = value.trim()
    if (!key) return
    setSaving(true)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await savePexelsKey(key))
      // A newer edit stays in the field and saves itself in turn.
      setDraft((current) => (current === value ? "" : current))
      setSaveStatus("saved")
    } catch (error) {
      // What was typed stays, so a refused save loses nothing.
      setSaveStatus("idle")
      showErrorToast(getPexelsKeyErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function flushSave() {
    clearTimeout(timer.current)
    if (!draft.trim() || saving) return
    void save(draft)
  }

  async function test() {
    setRunning("test")
    setVerdict("")
    dismissErrorToast()
    try {
      const result = await testPexelsKey(draft.trim() || undefined)
      setVerdict(
        result.ok ? "Pexels answered. The key works." : result.message
      )
    } catch (error) {
      showErrorToast(getPexelsKeyErrorMessage(error))
    } finally {
      setRunning(null)
    }
  }

  async function remove() {
    setRunning("remove")
    dismissErrorToast()
    try {
      setStatus(await removePexelsKey())
      setVerdict("")
      setRemoving(false)
      toast.success("Pexels key removed.")
    } catch (error) {
      showErrorToast(getPexelsKeyErrorMessage(error))
    } finally {
      setRunning(null)
    }
  }

  const showSentinel = !draft && !editing && Boolean(status?.configured)

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="video-pexels-key"
        title="Pexels"
        description="The editor's B-roll tool searches Pexels, a free stock video library, with this key. Get one free at pexels.com/api. It allows 200 searches an hour and 20,000 a month."
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : !status ? (
          <LoadingRow label="Checking for a saved key…" />
        ) : (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <FieldLabel
                htmlFor="pexels-api-key"
                hint="Pasting a key saves it by itself. It is scrambled before it is stored, and only its last four characters are ever shown again."
              >
                API key
              </FieldLabel>
              <span className="text-sm text-muted-foreground">
                {status.unreadable
                  ? "Saved, but unreadable. Paste it again."
                  : status.configured
                    ? `Set ${status.maskedKey}`
                    : "Not set. B-roll needs one."}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="pexels-api-key"
                className="sm:flex-1"
                type="password"
                autoComplete="off"
                maxLength={200}
                placeholder="Paste your Pexels API key"
                value={showSentinel ? SAVED_SENTINEL : draft}
                onFocus={() => setEditing(true)}
                onBlur={() => {
                  setEditing(false)
                  flushSave()
                }}
                onChange={(event) => {
                  const value = event.target.value
                  setDraft(value)
                  setVerdict("")
                  clearTimeout(timer.current)
                  if (value.trim()) {
                    timer.current = setTimeout(() => void save(value), SAVE_DELAY_MS)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") flushSave()
                }}
              />
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={running !== null}
                  onClick={() => void test()}
                >
                  {running === "test" ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Test this key
                </Button>
                {status.configured || status.unreadable ? (
                  // Remove waits out a save in flight, so the two never race.
                  <Button
                    type="button"
                    variant="outline"
                    disabled={running !== null || saving}
                    onClick={() => setRemoving(true)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            {verdict ? (
              <p role="status" className="text-sm text-muted-foreground">
                {verdict}
              </p>
            ) : null}
          </div>
        )}
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(false)
        }}
        title="Remove the Pexels key?"
        description="B-roll stops searching until a key is pasted again. Clips already placed stay in the library and on the timeline."
        confirmLabel="Remove key"
        loading={running === "remove"}
        onConfirm={remove}
      />
    </CardGroup>
  )
}
