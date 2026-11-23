import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { useSaveAfterTyping } from "@/components/video-editor/use-save-after-typing"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** What a key card may know about its key: never the key, only its last four characters. */
export type KeyStatus = {
  configured: boolean
  maskedKey: string | null
  unreadable: boolean
}

/** One company's key: its words on the card and its four server calls. */
export type ApiKeyCardProps = {
  storageId: string
  title: string
  description: string
  /** The company's name in the card's messages, such as "Pexels". */
  company: string
  /** What a missing key stops, such as "Photo search needs one." */
  notSet: string
  /** What removing the key stops, in the confirm window. */
  removeWarning: string
  load: () => Promise<KeyStatus>
  save: (apiKey: string) => Promise<KeyStatus>
  remove: () => Promise<KeyStatus>
  /** A working key may come back with its own words, such as whose account answered. */
  test: (apiKey?: string) => Promise<{ ok: true; message?: string } | { ok: false; message: string }>
  errorMessage: (error: unknown) => string
}

/** A pasted key saves itself this long after the last edit. */
const SAVE_DELAY_MS = 1200

/** What a saved key's field shows while it is not being edited. */
const SAVED_SENTINEL = "••••••••••••"

/**
 * Each key's status as last read or saved, held for the life of the page, so
 * coming back to its tab draws at once instead of loading again.
 */
const held = new Map<string, KeyStatus>()

/**
 * A company's API key on its own Settings tab, such as Pexels for carousel photos or
 * Sync Labs for lips. Pasting it saves it, scrambled, with no button. The
 * browser only ever sees its last four characters.
 */
export function ApiKeyCard({
  storageId,
  title,
  description,
  company,
  notSet,
  removeWarning,
  load,
  save: saveKey,
  remove: removeKey,
  test: testKey,
  errorMessage,
}: ApiKeyCardProps) {
  const [status, setStatusState] = React.useState<KeyStatus | null>(held.get(storageId) ?? null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [draft, setDraft] = React.useState("")
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [running, setRunning] = React.useState<"test" | "remove" | null>(null)
  const [verdict, setVerdict] = React.useState("")
  const [removing, setRemoving] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const typing = useSaveAfterTyping(SAVE_DELAY_MS)

  function setStatus(next: KeyStatus) {
    held.set(storageId, next)
    setStatusState(next)
  }

  React.useEffect(() => {
    if (held.has(storageId)) return
    let cancelled = false
    load()
      .then((loaded) => {
        held.set(storageId, loaded)
        if (!cancelled) setStatusState(loaded)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(errorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads, storageId, load, errorMessage])

  // `value` rides in as an argument: the timer saves exactly what was typed
  // when it was set.
  async function save(value: string) {
    const key = value.trim()
    if (!key) return
    setSaving(true)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveKey(key))
      // A newer edit stays in the field and saves itself in turn.
      setDraft((current) => (current === value ? "" : current))
      setSaveStatus("saved")
    } catch (error) {
      // What was typed stays, so a refused save loses nothing.
      setSaveStatus("idle")
      showErrorToast(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function flushSave() {
    typing.cancel()
    if (!draft.trim() || saving) return
    void save(draft)
  }

  async function test() {
    setRunning("test")
    setVerdict("")
    dismissErrorToast()
    try {
      const result = await testKey(draft.trim() || undefined)
      setVerdict(result.ok ? (result.message ?? `${company} answered. The key works.`) : result.message)
    } catch (error) {
      showErrorToast(errorMessage(error))
    } finally {
      setRunning(null)
    }
  }

  async function remove() {
    setRunning("remove")
    dismissErrorToast()
    try {
      setStatus(await removeKey())
      setVerdict("")
      setRemoving(false)
    } catch (error) {
      showErrorToast(errorMessage(error))
    } finally {
      setRunning(null)
    }
  }

  const showSentinel = !draft && !editing && Boolean(status?.configured)

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId={storageId}
        title={title}
        description={description}
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
                htmlFor={`${storageId}-input`}
                hint="Pasting a key saves it by itself. It is scrambled before it is stored, and only its last four characters are ever shown again."
              >
                API key
              </FieldLabel>
              <span className="text-sm text-muted-foreground">
                {status.unreadable
                  ? "Saved, but unreadable. Paste it again."
                  : status.configured
                    ? `Set ${status.maskedKey}`
                    : `Not set. ${notSet}`}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={`${storageId}-input`}
                className="sm:flex-1"
                type="password"
                autoComplete="off"
                maxLength={200}
                placeholder={`Paste your ${company} API key`}
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
                  if (value.trim()) typing.later(() => void save(value))
                  else typing.cancel()
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
        title={`Remove the ${company} key?`}
        description={removeWarning}
        confirmLabel="Remove key"
        loading={running === "remove"}
        onConfirm={remove}
      />
    </CardGroup>
  )
}
