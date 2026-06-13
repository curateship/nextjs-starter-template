import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  BotIcon,
  Loader2Icon,
  PhoneIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TestCallDialog } from "@/components/test-call-dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  getAgentErrorMessage,
  updateAgent,
  type AgentItem,
} from "@/lib/api/agents"

// Curated pickers: values are what the voice provider (Vapi) accepts.
const MODEL_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
]
import { dateTimeFormatter } from "@/lib/format"

const VOICE_OPTIONS = [
  { value: "burt", label: "Burt — deep male" },
  { value: "andrea", label: "Andrea — warm female" },
  { value: "sarah", label: "Sarah — natural female" },
  { value: "phillip", label: "Phillip — calm male" },
  { value: "paula", label: "Paula — friendly female" },
  { value: "ryan", label: "Ryan — energetic male" },
  { value: "matilda", label: "Matilda — clear female" },
  { value: "mark", label: "Mark — neutral male" },
]

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
]

export function AgentEditor({ agent }: { agent: AgentItem }) {
  const [name, setName] = React.useState(agent.name)
  const [systemPrompt, setSystemPrompt] = React.useState(agent.system_prompt)
  const [firstMessage, setFirstMessage] = React.useState(agent.first_message)
  const [model, setModel] = React.useState(agent.model)
  const [voiceId, setVoiceId] = React.useState(agent.voice_id || VOICE_OPTIONS[0].value)
  const [language, setLanguage] = React.useState(agent.transcriber_language)
  const [lastSyncedAt, setLastSyncedAt] = React.useState(agent.last_synced_at)
  const [providerAssistantId, setProviderAssistantId] = React.useState(
    agent.provider_assistant_id
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [testCallOpen, setTestCallOpen] = React.useState(false)

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateAgent({
        agentId: agent.id,
        name,
        systemPrompt,
        firstMessage,
        model,
        voiceId,
        transcriberLanguage: language,
      })
      setLastSyncedAt(updated.last_synced_at)
      setProviderAssistantId(updated.provider_assistant_id)
      setNotice("Agent saved.")
    } catch (saveError) {
      setError(getAgentErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const synced = Boolean(providerAssistantId)

  return (
    <div className="w-full pb-8">
      {/* Header: back to gallery, title, save */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild type="button" variant="ghost" size="icon-sm" aria-label="Back to agents">
          <Link to="/admin/agents">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
          <BotIcon className="size-4 text-muted-foreground" />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
          {name || "Untitled Agent"}
        </h1>
        <Badge variant={synced ? "secondary" : "outline"}>
          {synced ? "Synced" : "Not synced"}
        </Badge>
        <Button
          type="button"
          variant="outline"
          onClick={() => setTestCallOpen(true)}
        >
          <PhoneIcon className="size-4" />
          Test Call
        </Button>
        <Button type="button" disabled={saving || !name} onClick={handleSave}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {saving ? "Saving" : "Save Agent"}
        </Button>
      </div>

      <TestCallDialog
        open={testCallOpen}
        onOpenChange={setTestCallOpen}
        agentId={agent.id}
        agentName={name || "Untitled Agent"}
      />

      {notice ? (
        <div className="mb-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}
      {error ? (
        <ErrorAlert className="mb-4" message={error} />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Left: conversation content */}
        <div className="space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-first-message">First message</Label>
                <Input
                  id="agent-first-message"
                  value={firstMessage}
                  placeholder="Hi {{first_name}}, this is Sarah calling from..."
                  onChange={(event) => setFirstMessage(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  What the agent says when the call connects.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-system-prompt">System prompt</Label>
                <Textarea
                  id="agent-system-prompt"
                  value={systemPrompt}
                  placeholder="You are a friendly appointment-reminder assistant. Keep replies short and conversational..."
                  className="min-h-72 font-mono text-sm"
                  onChange={(event) => setSystemPrompt(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Defines the agent's personality, goals, and rules for the conversation.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right: model / voice / language + reference */}
        <div className="space-y-5">
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Model &amp; Voice</h2>
            <div className="space-y-2">
              <Label htmlFor="agent-model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="agent-model" className="w-full">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-voice">Voice</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger id="agent-voice" className="w-full">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-language">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="agent-language" className="w-full">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Personalization</h2>
            <p className="text-sm text-muted-foreground">
              Use variables in the prompt or first message — they're filled from
              each contact when a call starts:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["{{first_name}}", "{{last_name}}", "{{phone}}", "{{email}}"].map(
                (variable) => (
                  <code
                    key={variable}
                    className="rounded bg-muted px-1.5 py-0.5 text-xs"
                  >
                    {variable}
                  </code>
                )
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Custom fields on contacts are available the same way.
            </p>
          </section>

          <section className="space-y-2 rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Provider sync</h2>
            {synced ? (
              <p className="text-sm text-muted-foreground">
                Synced with the voice provider
                {lastSyncedAt
                  ? ` on ${dateTimeFormatter.format(new Date(lastSyncedAt))}`
                  : ""}
                .
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not synced to the voice provider yet. The agent is pushed
                automatically before its first call.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
