import { SparklesIcon } from "lucide-react"
import { z } from "zod"

import { AI_PROVIDERS, DEFAULT_AI_MODEL } from "@/lib/ai-models"

import { defineNode } from "../node-descriptor"

/**
 * An AI step: the flow hands the AI some instructions and the step produces
 * what it wrote or decided. Provider and model come from the fixed lists in
 * `src/lib/ai-models.ts`, and the key it runs with is whatever Settings → AI
 * holds for that provider.
 *
 * Drawing and compiling only for now. When the run engine lands
 * (workspace/tasks/features/automations/automation-engine-scheduler.md), its
 * executor for this kind must call the provider through `runAiCall()` from
 * the AI usage-recording task, so every run lands on the usage dashboard.
 */
export const aiStepNode = defineNode({
  kind: "aiStep",
  palette: {
    key: "step-ai",
    group: "AI",
    description: "Ask an AI to write or decide something",
  },
  createSettings: () => ({
    provider: "anthropic",
    model: DEFAULT_AI_MODEL.anthropic,
    instructions: "",
  }),
  // Strict at compile time only — the draft schema stays lenient so a
  // half-filled step always saves. Model is a bounded string rather than an
  // enum of today's list, so a saved flow outlives a model list change; the
  // dropdown keeps new flows on the list.
  settingsSchema: z.object({
    provider: z.enum(AI_PROVIDERS),
    model: z.string().trim().min(1, "Choose a model.").max(120),
    instructions: z
      .string()
      .trim()
      .min(1, "Write what this step should do.")
      .max(12_000),
  }),
  name: () => "AI step",
  description: (settings) => {
    const instructions =
      typeof settings.instructions === "string"
        ? settings.instructions.trim()
        : ""
    return instructions || "Asks an AI to write or decide something."
  },
  icon: SparklesIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/ai-step-panel"),
})
