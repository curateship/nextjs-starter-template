import * as React from "react"
import { Link } from "@tanstack/react-router"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
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
  AI_TEXT_PROVIDERS,
  DEFAULT_AI_MODEL,
  isAiTextProvider,
} from "@/lib/ai/ai-models"
import { loadAiKeyStatuses, type AiKeyStatus } from "@/lib/api/ai"
import {
  loadCategories,
  type Category,
} from "@/lib/api/directory/categories"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import { categoryTreeOrder } from "@/lib/directory/category-tree"
import {
  eventSourceUrlError,
  MAX_DRAFT_INSTRUCTIONS,
  MAX_DRAFTS_PER_RUN,
  MAX_SOURCE_URL,
  readDraftEventsSettings,
} from "@/lib/events/draft-events-step"

/** A Select item cannot hold "", so "no category" travels as this. */
const NO_CATEGORY = "none"

/** The Draft events step's settings, drawn in the canvas inspector. */
export default function DraftEventsFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const settings = readDraftEventsSettings(node.settings)
  const { provider, model } = settings
  // The raw typed text, so a half-typed address is not trimmed under the cursor.
  const sourceUrl =
    typeof node.settings.sourceUrl === "string" ? node.settings.sourceUrl : ""
  const instructions =
    typeof node.settings.instructions === "string"
      ? node.settings.instructions
      : ""
  const models = AI_MODEL_OPTIONS[provider]
  const modelKnown = models.some((option) => option.id === model)
  // Judged once the field is left, not on every keystroke, so a half-typed
  // address is not called wrong while it is still being typed.
  const [urlLeft, setUrlLeft] = React.useState(false)
  const urlProblem =
    urlLeft && sourceUrl.trim() ? eventSourceUrlError(sourceUrl.trim()) : null

  // Both advisory: a failed load hides the key note or leaves only "None" in
  // the category list, and the step still saves.
  const [keyStatuses, setKeyStatuses] = React.useState<AiKeyStatus[] | null>(
    null
  )
  const [categories, setCategories] = React.useState<Category[] | null>(null)
  React.useEffect(() => {
    let cancelled = false
    loadAiKeyStatuses()
      .then((statuses) => {
        if (!cancelled) setKeyStatuses(statuses)
      })
      .catch(() => undefined)
    loadCategories()
      .then((rows) => {
        if (!cancelled) setCategories(rows)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  const keyStatus = keyStatuses?.find((status) => status.provider === provider)
  const keyMissing = keyStatuses !== null && !keyStatus?.configured
  const orderedCategories = React.useMemo(
    () => categoryTreeOrder(categories ?? []),
    [categories]
  )
  const categoryGone =
    categories !== null &&
    settings.categoryId !== "" &&
    !categories.some((category) => category.id === settings.categoryId)

  const setSettings = (next: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...next } })

  return (
    <>
      <InspectorCard title="Page to read">
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`draft-events-${node.id}-url`}
            className="text-xs"
            hint="A venue's gigs page, a what's-on page or an RSS feed. Each draft links back to it so you can check the dates."
          >
            Page address
          </FieldLabel>
          <Input
            id={`draft-events-${node.id}-url`}
            type="url"
            inputMode="url"
            value={sourceUrl}
            maxLength={MAX_SOURCE_URL}
            placeholder="https://venue.example/whats-on"
            aria-invalid={Boolean(urlProblem)}
            aria-describedby={
              urlProblem ? `draft-events-${node.id}-url-problem` : undefined
            }
            onBlur={() => setUrlLeft(true)}
            onChange={(event) => setSettings({ sourceUrl: event.target.value })}
          />
          {urlProblem ? (
            <p
              id={`draft-events-${node.id}-url-problem`}
              className="text-xs text-destructive"
            >
              {urlProblem}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`draft-events-${node.id}-category`}
            className="text-xs"
            hint="Every draft from this page is filed under it. You can change it on each event before publishing."
          >
            Category
          </FieldLabel>
          <Select
            value={settings.categoryId || NO_CATEGORY}
            onValueChange={(value) =>
              setSettings({ categoryId: value === NO_CATEGORY ? "" : value })
            }
          >
            <SelectTrigger
              id={`draft-events-${node.id}-category`}
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>None</SelectItem>
              {orderedCategories.map(({ category, depth }) => (
                <SelectItem
                  key={category.id}
                  value={category.id}
                  style={
                    depth ? { paddingLeft: `${0.5 + depth * 1.25}rem` } : undefined
                  }
                >
                  {category.name}
                </SelectItem>
              ))}
              {/* Kept selectable while the list loads, or after the category
                  is deleted, so the saved choice is never shown as blank. */}
              {settings.categoryId &&
              !orderedCategories.some(
                ({ category }) => category.id === settings.categoryId
              ) ? (
                <SelectItem value={settings.categoryId}>
                  {categories === null ? "Loading…" : "Deleted category"}
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          {categoryGone ? (
            <InspectorNote className="mt-1">
              This category was deleted, so the step will stop until you pick
              another or None.
            </InspectorNote>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`draft-events-${node.id}-instructions`}
            className="text-xs"
            hint="Optional. Anything the AI should know about this page, in plain words."
          >
            Notes for the AI
          </FieldLabel>
          <Textarea
            id={`draft-events-${node.id}-instructions`}
            value={instructions}
            rows={1}
            maxLength={MAX_DRAFT_INSTRUCTIONS}
            placeholder="e.g. Skip the private bookings. Every show is at The Horseshoe."
            className="text-xs"
            onChange={(event) =>
              setSettings({ instructions: event.target.value })
            }
          />
        </div>

        <InspectorNote>
          Every event comes in as a draft, and nothing is public until you
          publish it. Events already on the site with the same title and day
          are skipped, and one run drafts at most {MAX_DRAFTS_PER_RUN}.
        </InspectorNote>
      </InspectorCard>

      <InspectorCard title="Which AI reads it">
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`draft-events-${node.id}-provider`}
            className="text-xs"
            hint="It runs with the key saved for that provider in Settings → AI, and each run shows on the AI usage page."
          >
            Provider
          </FieldLabel>
          <Select
            value={provider}
            onValueChange={(value) => {
              if (!isAiTextProvider(value)) return
              // A model belongs to its provider, so switching provider moves
              // the step onto that provider's default model.
              setSettings({ provider: value, model: DEFAULT_AI_MODEL[value] })
            }}
          >
            <SelectTrigger
              id={`draft-events-${node.id}-provider`}
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_TEXT_PROVIDERS.map((id) => (
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
            htmlFor={`draft-events-${node.id}-model`}
            className="text-xs"
            hint="Bigger models misread fewer dates and cost more per run."
          >
            Model
          </FieldLabel>
          <Select
            value={model || undefined}
            onValueChange={(value) => setSettings({ model: value })}
          >
            <SelectTrigger
              id={`draft-events-${node.id}-model`}
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
              {model && !modelKnown ? (
                <SelectItem value={model}>{model}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
      </InspectorCard>
    </>
  )
}
