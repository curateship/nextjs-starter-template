import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  getAiErrorMessage,
  loadAiKeyStatuses,
  removeAiProviderKey,
  saveAiKey,
  testAiProviderKey,
  type AiKeyStatus,
  type AiKeyTestResult,
  type AiProvider,
} from "@/lib/api/ai"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"

const PROVIDERS: {
  id: AiProvider
  name: string
  hint: string
  placeholder: string
}[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    hint: "The key from console.anthropic.com → API keys. It is scrambled before it is stored, and only its last four characters are ever shown again.",
    placeholder: "Paste your Anthropic API key",
  },
  {
    id: "openai",
    name: "OpenAI",
    hint: "The key from platform.openai.com → API keys. It is scrambled before it is stored, and only its last four characters are ever shown again.",
    placeholder: "Paste your OpenAI API key",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    hint: "The key from aistudio.google.com → API keys. It is scrambled before it is stored, and only its last four characters are ever shown again.",
    placeholder: "Paste your Gemini API key",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    hint: "The key from elevenlabs.io → your profile → API keys. This one reads text aloud rather than writing it. It is scrambled before it is stored, and only its last four characters are ever shown again.",
    placeholder: "Paste your ElevenLabs API key",
  },
]

// A pasted key saves itself this long after the last edit; leaving the field
// (or pressing Enter) saves straight away.
const SAVE_DELAY_MS = 1200

// What a saved key's field displays while it is not being edited. Any string
// renders as dots in a password field; the length just makes it look like one.
const SAVED_SENTINEL = "••••••••••••"

/**
 * Settings → AI. One key per provider for the whole app, saved encrypted
 * through server/ai/keys.ts. The browser only ever sees a masked tail.
 * Saving is automatic and reports through the sticky header's Saving…/Saved
 * indicator, like every other auto-save in the app — no Save button, no toast.
 */
export function AiSettings() {
  const { reportSaveStatus } = useShellRuntime()
  const [statuses, setStatuses] = React.useState<AiKeyStatus[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  // What was typed but not yet saved, per provider.
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  // The provider whose field is focused: its saved-key dots make way for typing.
  const [editing, setEditing] = React.useState<AiProvider | null>(null)
  // Which button is running, as "provider:action" — the others grey out, the
  // active one spins. Null means nothing is running.
  const [runningId, setRunningId] = React.useState<string | null>(null)
  // The provider whose auto-save is in flight. Deliberately NOT part of
  // `busy`: clicking "Test this key" right after typing blurs the field,
  // the blur starts the save, and a save that disabled the buttons would
  // swallow that very click. Testing a pasted key is independent of saving
  // it, so the two may run side by side.
  const [savingId, setSavingId] = React.useState<AiProvider | null>(null)
  // The last test's verdict, per provider, already worded for the user.
  const [testResults, setTestResults] = React.useState<Record<string, string>>(
    {}
  )
  // Which provider's Remove is waiting on its confirmation, if any.
  const [removing, setRemoving] = React.useState<AiProvider | null>(null)

  // The auto-save's outcome, shown in the shared sticky header like every
  // other settings save. Mirrors how the automation editor reports.
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  React.useEffect(() => {
    reportSaveStatus(saveStatus)
  }, [reportSaveStatus, saveStatus])
  React.useEffect(() => {
    return () => reportSaveStatus(null)
  }, [reportSaveStatus])
  // The "Saved" badge clears itself the way the shared header's does.
  React.useEffect(() => {
    if (saveStatus !== "saved") return
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // One pending auto-save timer per provider.
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  )
  React.useEffect(() => {
    const pending = timers.current
    return () => {
      for (const id of Object.keys(pending)) clearTimeout(pending[id])
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    loadAiKeyStatuses()
      .then((next) => {
        if (cancelled) return
        setStatuses(next)
        setLoadError(null)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getAiErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  const busy = runningId !== null
  const statusById = new Map(statuses?.map((s) => [s.provider, s]) ?? [])

  // `value` rides in as an argument, not read from state: the timer's closure
  // must save exactly what was typed when it was scheduled.
  const save = async (provider: AiProvider, value: string) => {
    const key = value.trim()
    if (!key) return
    setSavingId(provider)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatuses(await saveAiKey(provider, key))
      // Clear the field only if it still holds what was saved — a newer edit
      // must survive and will save itself in turn.
      setDrafts((prev) =>
        prev[provider] === value ? { ...prev, [provider]: "" } : prev
      )
      setSaveStatus("saved")
    } catch (error) {
      // The draft stays in the field so a failed save loses nothing.
      setSaveStatus("idle")
      showErrorToast(getAiErrorMessage(error))
    } finally {
      setSavingId(null)
    }
  }

  const scheduleSave = (provider: AiProvider, value: string) => {
    clearTimeout(timers.current[provider])
    if (!value.trim()) return
    timers.current[provider] = setTimeout(
      () => void save(provider, value),
      SAVE_DELAY_MS
    )
  }

  const flushSave = (provider: AiProvider) => {
    clearTimeout(timers.current[provider])
    const value = drafts[provider] ?? ""
    if (!value.trim() || savingId !== null) return
    void save(provider, value)
  }

  const test = async (provider: AiProvider, name: string) => {
    setRunningId(`${provider}:test`)
    dismissErrorToast()
    setTestResults((prev) => ({ ...prev, [provider]: "" }))
    try {
      const verdict = await testAiProviderKey(provider, drafts[provider])
      setTestResults((prev) => ({
        ...prev,
        [provider]: testMessage(verdict, name),
      }))
    } catch (error) {
      showErrorToast(getAiErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  const remove = async (provider: AiProvider, name: string) => {
    setRunningId(`${provider}:remove`)
    dismissErrorToast()
    setTestResults((prev) => ({ ...prev, [provider]: "" }))
    try {
      setStatuses(await removeAiProviderKey(provider))
      setRemoving(null)
      toast.success(`${name} key removed.`)
    } catch (error) {
      showErrorToast(getAiErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  const removingName =
    PROVIDERS.find((provider) => provider.id === removing)?.name ?? ""

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="ai-keys"
        title="AI provider keys"
        description="One key per provider, used by every AI feature in this app. Pasting a key saves it by itself — scrambled, and it never leaves the server."
        contentClassName="space-y-6"
      >
        {loadError ? (
          <ErrorBanner
            message={loadError}
            onRetry={() => setReloads((count) => count + 1)}
          />
        ) : !statuses ? (
          <div className="flex justify-center p-6">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          PROVIDERS.map(({ id, name, hint, placeholder }) => {
            const status = statusById.get(id)
            const draft = drafts[id] ?? ""
            // A saved key shows as dots until the field is focused or typed
            // in, so a filled field means a key is there.
            const showSentinel =
              !draft && editing !== id && Boolean(status?.configured)
            return (
              <div key={id} className="grid gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <FieldLabel htmlFor={`ai-key-${id}`} hint={hint}>
                    {name}
                  </FieldLabel>
                  <span className="text-sm text-muted-foreground">
                    {statusLabel(status)}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={`ai-key-${id}`}
                    className="sm:flex-1"
                    type="password"
                    autoComplete="off"
                    placeholder={placeholder}
                    value={showSentinel ? SAVED_SENTINEL : draft}
                    onFocus={() => setEditing(id)}
                    onBlur={() => {
                      setEditing(null)
                      flushSave(id)
                    }}
                    onChange={(event) => {
                      const value = event.target.value
                      setDrafts((prev) => ({ ...prev, [id]: value }))
                      // A verdict is about one exact key; edited text is
                      // another key, so the old verdict comes down.
                      setTestResults((prev) => ({ ...prev, [id]: "" }))
                      scheduleSave(id, value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") flushSave(id)
                    }}
                  />
                  {/* Never disabled while idle — a disabled button fades to
                      near-invisible and cannot say why. Clicked with nothing
                      to test, it explains itself in a toast. */}
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void test(id, name)}
                    >
                      {runningId === `${id}:test` ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : null}
                      Test this key
                    </Button>
                    {status?.source === "settings" ? (
                      // Unlike Test, Remove waits out an in-flight save: a
                      // delete racing the save's upsert could resurrect the
                      // key that was just removed.
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || savingId !== null}
                        onClick={() => setRemoving(id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                {testResults[id] ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {testResults[id]}
                  </p>
                ) : null}
              </div>
            )
          })
        )}
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`Remove the ${removingName} key?`}
        description="The saved key is deleted. If the server has its own key, that one takes over; otherwise AI features stop working until a new key is saved."
        confirmLabel="Remove key"
        loading={runningId === `${removing}:remove`}
        onConfirm={() => {
          if (removing) void remove(removing, removingName)
        }}
      />
    </CardGroup>
  )
}

/** One short line saying whether a key exists and where it lives. */
function statusLabel(status: AiKeyStatus | undefined) {
  if (!status) return "Not set"
  if (status.unreadable) return "Set, but unreadable — paste it again"
  if (!status.configured) return "Not set"
  if (status.source === "env") {
    return `Using the server's own key ${status.maskedKey}`
  }
  return `Set ${status.maskedKey}`
}

/** The test verdict in plain words — each outcome clearly its own message. */
function testMessage(verdict: AiKeyTestResult, name: string) {
  switch (verdict.result) {
    case "ok":
      return `It works — ${name} accepted the key.`
    case "rejected":
      return `${name} rejected this key. Check it was copied in full.`
    case "unreachable":
      return `${name} could not be reached. Check the server's internet connection and try again.`
    case "error":
      return `${name} answered with an error (HTTP ${verdict.status}). The key may still be fine — try again in a minute.`
  }
}
