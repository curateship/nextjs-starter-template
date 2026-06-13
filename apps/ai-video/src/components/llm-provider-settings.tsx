import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getLlmKeyErrorMessage,
  getLlmKeyStatus,
  setLlmKey,
  type LlmKeyStatus,
  type LlmProvider,
} from "@/lib/api/llm-keys"

// Display metadata per provider (order = display order).
const PROVIDERS: {
  id: LlmProvider
  name: string
  placeholder: string
}[] = [
  { id: "openai", name: "OpenAI", placeholder: "Your OpenAI API key" },
  { id: "claude", name: "Claude (Anthropic)", placeholder: "Your Anthropic API key" },
  { id: "gemini", name: "Google Gemini", placeholder: "Your Google AI key" },
]

// `saveRef` lets the Settings page's top "Save" button save this tab — the
// component publishes its save function there instead of owning a button.
export function LlmProviderSettings({
  saveRef,
}: {
  saveRef: React.RefObject<(() => Promise<void>) | null>
}) {
  const [statuses, setStatuses] = React.useState<LlmKeyStatus[] | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Load the current per-provider status on mount.
  React.useEffect(() => {
    let active = true
    getLlmKeyStatus()
      .then((result) => active && setStatuses(result))
      .catch(() => active && setError(getLlmKeyErrorMessage()))
    return () => {
      active = false
    }
  }, [])

  // Persists every provider that has a non-empty draft, then refreshes the
  // masked statuses and clears the inputs.
  async function saveDrafts() {
    const pending = PROVIDERS.filter((p) => (drafts[p.id] ?? "").trim())
    if (pending.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await Promise.all(pending.map((p) => setLlmKey(p.id, drafts[p.id])))
      setStatuses(await getLlmKeyStatus())
      setDrafts({})
    } catch {
      setError(getLlmKeyErrorMessage())
    } finally {
      setBusy(false)
    }
  }

  // Publish the save function so the page's top Save button can call it; this
  // runs every render so it always closes over the latest drafts.
  React.useEffect(() => {
    saveRef.current = saveDrafts
    return () => {
      saveRef.current = null
    }
  })

  // Clears a saved key (falls the provider back to its env var, if any).
  async function removeKey(provider: LlmProvider) {
    setBusy(true)
    setError(null)
    try {
      await setLlmKey(provider, "")
      setStatuses(await getLlmKeyStatus())
    } catch {
      setError(getLlmKeyErrorMessage())
    } finally {
      setBusy(false)
    }
  }

  const statusById = new Map(statuses?.map((s) => [s.provider, s]) ?? [])

  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>AI Providers</CardTitle>
          <CardDescription>
            API keys for the LLM providers this workspace uses. Enter a key and
            click Save above. Keys are stored on the server and never shown
            again — only a masked tail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {statuses == null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading…
            </div>
          ) : (
            PROVIDERS.map((provider) => {
              const status = statusById.get(provider.id)
              const draft = drafts[provider.id] ?? ""
              return (
                <div key={provider.id} className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`key-${provider.id}`}>{provider.name}</Label>
                    <ProviderStatus status={status} />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id={`key-${provider.id}`}
                      type="password"
                      autoComplete="off"
                      placeholder={
                        status?.configured
                          ? "Enter a new key to replace"
                          : provider.placeholder
                      }
                      value={draft}
                      disabled={busy}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [provider.id]: event.target.value,
                        }))
                      }
                    />
                    {status?.source === "settings" ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => removeKey(provider.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </CardGroup>
  )
}

// Badge describing where a provider's key comes from.
function ProviderStatus({ status }: { status: LlmKeyStatus | undefined }) {
  if (!status?.configured) {
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        Not configured
      </Badge>
    )
  }
  const label = status.source === "env" ? "Environment variable" : "Saved"
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="secondary">{label}</Badge>
      <span className="font-mono">{status.maskedKey}</span>
    </span>
  )
}
