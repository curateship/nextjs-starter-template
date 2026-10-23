import { CalendarPlusIcon } from "lucide-react"
import { z } from "zod"

import {
  AI_TEXT_PROVIDERS,
  DEFAULT_AI_MODEL,
  isAiTextProvider,
  type AiTextProvider,
} from "@/lib/ai/ai-models"
import { defineNode } from "@/lib/automations/node-descriptor"
import { isPrivateWebhookHostname } from "@/lib/automations/nodes/webhook"

/**
 * The Draft events step: it reads one web page or feed, asks an AI which
 * events are on it, and writes each new one as a draft event on the flow's
 * site. What it does lives in `server/events/ai-drafts.ts`; this file is how
 * it draws and what a valid setting is, and the browser reads it.
 *
 * **It only ever writes drafts.** No setting changes that. An AI-written event
 * must never reach a visitor before a person has looked at it.
 */

export const DRAFT_EVENTS_KIND = "draftEvents"

/** At most this many drafts from one run. The rest wait for the next run. */
export const MAX_DRAFTS_PER_RUN = 25

export const MAX_SOURCE_URL = 600
export const MAX_DRAFT_INSTRUCTIONS = 4_000

export type DraftEventsSettings = {
  provider: AiTextProvider
  model: string
  sourceUrl: string
  /** A category on the site, or "" for none. */
  categoryId: string
  instructions: string
}

/**
 * Why a source address cannot be read, or null when it can. The server
 * repeats the private-address check against every DNS answer before it
 * connects, because a name can point anywhere.
 */
export function eventSourceUrlError(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return "Enter the page's full address, starting with https://."
  }
  if (url.protocol !== "https:") {
    return "The page's address must start with https://."
  }
  if (url.username || url.password) {
    return "Take the name and password out of the address."
  }
  if (isPrivateWebhookHostname(url.hostname)) {
    return "The address points to a private or internal address, which this step cannot read."
  }
  return null
}

/** The saved settings, with anything unreadable put back to its default. */
export function readDraftEventsSettings(
  settings: Record<string, unknown>
): DraftEventsSettings {
  const provider = isAiTextProvider(settings.provider)
    ? settings.provider
    : "anthropic"
  const text = (value: unknown) => (typeof value === "string" ? value : "")
  return {
    provider,
    model: text(settings.model).trim() || DEFAULT_AI_MODEL[provider],
    sourceUrl: text(settings.sourceUrl).trim(),
    categoryId: text(settings.categoryId).trim(),
    instructions: text(settings.instructions).trim(),
  }
}

export const draftEventsNode = defineNode({
  kind: DRAFT_EVENTS_KIND,
  palette: {
    key: "step-draft-events",
    group: "AI",
    description: "Read a web page or feed and draft the events on it",
  },
  createSettings: () => ({
    provider: "anthropic",
    model: DEFAULT_AI_MODEL.anthropic,
    sourceUrl: "",
    categoryId: "",
    instructions: "",
  }),
  // Strict at compile time only, like the AI step: a half-filled step still
  // saves. Model is a bounded string rather than today's list, so a saved flow
  // outlives a change to that list.
  settingsSchema: z.object({
    provider: z.enum(AI_TEXT_PROVIDERS),
    model: z.string().trim().min(1, "Choose a model.").max(120),
    sourceUrl: z
      .string()
      .trim()
      .min(1, "Give the address of the page to read.")
      .max(MAX_SOURCE_URL, "That address is too long.")
      .superRefine((value, context) => {
        const problem = eventSourceUrlError(value)
        if (problem) context.addIssue({ code: "custom", message: problem })
      }),
    categoryId: z.string().trim().max(36),
    instructions: z.string().trim().max(MAX_DRAFT_INSTRUCTIONS),
  }),
  name: () => "Draft events",
  description: (settings) => {
    const { sourceUrl } = readDraftEventsSettings(settings)
    if (!sourceUrl) return "Reads a page and drafts the events on it."
    try {
      return `Drafts the events on ${new URL(sourceUrl).hostname}.`
    } catch {
      return "Reads a page and drafts the events on it."
    }
  },
  icon: CalendarPlusIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/events/draft-events-step-panel"),
  runResult: () => import("@/components/events/draft-events-step-result"),
})
