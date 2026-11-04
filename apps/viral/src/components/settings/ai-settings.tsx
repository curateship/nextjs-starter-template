import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SecretKeyField } from "@/components/settings/secret-key-field"
import { useSettingsAutoSave } from "@/components/settings/use-settings-auto-save"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getAiErrorMessage,
  loadAiKeyStatuses,
  removeAiProviderKey,
  saveAiKey,
  testAiProviderKey,
  type AiKeyTestResult,
  type AiProvider,
} from "@/lib/api/ai"
import { useLoad } from "@/lib/hooks/use-load"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

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

/**
 * The AI provider keys card on General settings. One key per provider for the
 * whole app, saved encrypted through server/ai/keys.ts. The browser only ever
 * sees a masked tail.
 *
 * Saving is automatic and reports through the sticky header's Saving…/Saved
 * indicator, like every other auto-save in the app — no Save button, no toast.
 */
export function AiSettings() {
  const loaded = useLoad(loadAiKeyStatuses, getAiErrorMessage)
  const statuses = loaded.data
  // The save's outcome goes to the sticky header. Deliberately NOT part of
  // `busy`: clicking "Test this key" right after typing blurs the field, the
  // blur starts the save, and a save that disabled the buttons would swallow
  // that very click. Testing a pasted key is independent of saving it.
  const autoSave = useSettingsAutoSave(getAiErrorMessage, loaded.setData)

  // What was typed but not yet saved, per provider.
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  // Which button is running, as "provider:action" — the others grey out, the
  // active one spins. Null means nothing is running.
  const [runningId, setRunningId] = React.useState<string | null>(null)
  // The last test's verdict, per provider, already worded for the user.
  const [testResults, setTestResults] = React.useState<Record<string, string>>(
    {}
  )
  // Which provider's Remove is waiting on its confirmation, if any.
  const [removing, setRemoving] = React.useState<AiProvider | null>(null)

  const busy = runningId !== null
  const statusById = new Map(statuses?.map((s) => [s.provider, s]) ?? [])

  // The save of exactly `value`, and the draft cleared after it only if it
  // still holds that value: a newer edit survives and saves itself in turn.
  const saveKey = (provider: AiProvider, value: string) => () =>
    saveAiKey(provider, value.trim())
  const clearDraft = (provider: AiProvider, value: string) => () =>
    setDrafts((prev) =>
      prev[provider] === value ? { ...prev, [provider]: "" } : prev
    )

  const edit = (provider: AiProvider, value: string) => {
    setDrafts((prev) => ({ ...prev, [provider]: value }))
    // A verdict is about one exact key; edited text is another key, so the
    // old verdict comes down.
    setTestResults((prev) => ({ ...prev, [provider]: "" }))
    if (!value.trim()) {
      autoSave.cancel(provider)
      return
    }
    autoSave.schedule(
      provider,
      saveKey(provider, value),
      clearDraft(provider, value)
    )
  }

  const commit = (provider: AiProvider) => {
    const value = drafts[provider] ?? ""
    if (!value.trim()) return
    autoSave.flush(
      provider,
      saveKey(provider, value),
      clearDraft(provider, value)
    )
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
      loaded.setData(await removeAiProviderKey(provider))
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
    <>
      <CollapsibleSettingsCard
        storageId="ai-keys"
        title="AI provider keys"
        description="One key per provider, used by every AI feature in this app. Pasting a key saves it by itself — scrambled, and it never leaves the server."
        contentClassName="space-y-6"
      >
        {loaded.error ? (
          <ErrorRow message={loaded.error} onRetry={loaded.retry} />
        ) : !statuses ? (
          <LoadingRow
            label="Loading AI provider keys…"
            className="min-h-[29.5rem] sm:min-h-[19.5rem]"
          />
        ) : (
          PROVIDERS.map(({ id, name, hint, placeholder }) => {
            const status = statusById.get(id)
            return (
              <SecretKeyField
                key={id}
                id={`ai-key-${id}`}
                label={name}
                hint={hint}
                secret={status}
                saved={Boolean(status?.configured)}
                placeholder={placeholder}
                value={drafts[id] ?? ""}
                onChange={(value) => edit(id, value)}
                onCommit={() => commit(id)}
                actions={
                  // Never disabled while idle — a disabled button fades to
                  // near-invisible and cannot say why. Clicked with nothing
                  // to test, it explains itself in a toast.
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
                        disabled={busy || autoSave.saving !== null}
                        onClick={() => setRemoving(id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                }
              >
                {testResults[id] ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {testResults[id]}
                  </p>
                ) : null}
              </SecretKeyField>
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
    </>
  )
}

/** The test verdict in plain words — each outcome clearly its own message. */
function testMessage(verdict: AiKeyTestResult, name: string) {
  switch (verdict.result) {
    case "ok":
      return `It works — ${name} accepted the key.`
    case "rejected":
      return verdict.reason
        ? `${name} rejected this key: ${verdict.reason}`
        : `${name} rejected this key. Check it was copied in full.`
    case "slow":
      return `${name} took longer than ${verdict.seconds} seconds to answer, so the test stopped waiting. That is usually ${name} being busy, not the key — try again in a few minutes.`
    case "unreachable":
      return `${name} could not be reached. Check the server's internet connection and try again.`
    case "error":
      return verdict.reason
        ? `${name} answered with an error (HTTP ${verdict.status}): ${verdict.reason}`
        : `${name} answered with an error (HTTP ${verdict.status}). The key may still be fine — try again in a minute.`
  }
}
