import * as React from "react"
import { Link } from "@tanstack/react-router"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  AI_MODEL_OPTIONS,
  AI_PROVIDER_NAMES,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  isAiProvider,
} from "@/lib/ai/ai-models"
import { loadAiKeyStatuses, type AiKeyStatus } from "@/lib/api/ai"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"

export default function AiStepFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const provider = isAiProvider(node.settings.provider)
    ? node.settings.provider
    : "anthropic"
  const model =
    typeof node.settings.model === "string" ? node.settings.model : ""
  const instructions =
    typeof node.settings.instructions === "string"
      ? node.settings.instructions
      : ""
  const models = AI_MODEL_OPTIONS[provider]
  const modelKnown = models.some((option) => option.id === model)

  // Which providers have a key, so a step whose provider has none can say so
  // here instead of the flow failing quietly at run time. Advisory only — a
  // failed load just hides the note rather than blocking the panel.
  const [keyStatuses, setKeyStatuses] = React.useState<AiKeyStatus[] | null>(
    null
  )
  React.useEffect(() => {
    let cancelled = false
    loadAiKeyStatuses()
      .then((statuses) => {
        if (!cancelled) setKeyStatuses(statuses)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  const keyStatus = keyStatuses?.find((status) => status.provider === provider)
  const keyMissing = keyStatuses !== null && !keyStatus?.configured

  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`ai-step-${node.id}-provider`}
          className="text-xs"
          hint="Whose AI answers this step. It runs with the key saved for that provider in Settings → AI."
        >
          Provider
        </FieldLabel>
        <Select
          value={provider}
          onValueChange={(value) => {
            if (!isAiProvider(value)) return
            // A model belongs to its provider, so switching provider moves
            // the step onto that provider's default model.
            setSettings({ provider: value, model: DEFAULT_AI_MODEL[value] })
          }}
        >
          <SelectTrigger
            id={`ai-step-${node.id}-provider`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS.map((id) => (
              <SelectItem key={id} value={id}>
                {AI_PROVIDER_NAMES[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {keyMissing ? (
          <InspectorNote className="mt-1">
            No {AI_PROVIDER_NAMES[provider]} key is saved yet. Add one in{" "}
            <Link
              to="/admin/settings/$tab"
              params={{ tab: "ai" }}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Settings → AI
            </Link>{" "}
            before this flow runs.
          </InspectorNote>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`ai-step-${node.id}-model`}
          className="text-xs"
          hint="Which of the provider's models to use. Bigger models write better and cost more per run."
        >
          Model
        </FieldLabel>
        <Select
          value={model || undefined}
          onValueChange={(value) => setSettings({ model: value })}
        >
          <SelectTrigger
            id={`ai-step-${node.id}-model`}
            className="w-full sm:w-fit"
          >
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
            {/* A saved flow can hold a model this app no longer offers; keep
                it selectable so the flow still compiles until it is changed. */}
            {model && !modelKnown ? (
              <SelectItem value={model}>{model}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`ai-step-${node.id}-instructions`}
          className="text-xs"
          hint="What the AI is asked to do when the flow reaches this step. Plain words work best."
        >
          Instructions
        </FieldLabel>
        <Textarea
          id={`ai-step-${node.id}-instructions`}
          value={instructions}
          rows={1}
          maxLength={12_000}
          placeholder="e.g. Summarise this feedback in two sentences."
          className="text-xs"
          onChange={(event) => setSettings({ instructions: event.target.value })}
        />
      </div>
    </InspectorCard>
  )
}
