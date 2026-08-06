import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getAudiencePreviewErrorMessage,
  loadAudiencePreview,
  type AudiencePreview,
} from "@/lib/api/automations/audience-preview"
import { loadAdminPlans, type AdminPlan } from "@/lib/api/billing/admin-plans"
import {
  loadSegmentChoices,
  type SegmentChoice,
} from "@/lib/api/people/contact-segments"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import {
  AUDIENCE_HINTS,
  AUDIENCE_KINDS,
  AUDIENCE_LABELS,
  audienceIsMostOfTheList,
  isAudienceKind,
  type AutomationAudienceKind,
} from "@/lib/automations/nodes/audience"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast } from "@/lib/toast/error-toast"

/**
 * Who the rest of the flow is about.
 *
 * The panel stores the choice, never the people — the step counts them up again
 * every time it runs, so a member who cancels between two runs drops out of the
 * second one on their own.
 */
export default function AudienceFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const audience = isAudienceKind(node.settings.audience)
    ? node.settings.audience
    : "everyone"
  const planSlug =
    typeof node.settings.planSlug === "string" ? node.settings.planSlug : ""
  const segmentId =
    typeof node.settings.segmentId === "string" ? node.settings.segmentId : ""
  const segmentName =
    typeof node.settings.segmentName === "string"
      ? node.settings.segmentName
      : ""

  // The plans to choose between. Advisory only, like the AI step's key check —
  // a failed load leaves the saved plan showing rather than blocking the panel.
  const [plans, setPlans] = React.useState<AdminPlan[] | null>(null)
  React.useEffect(() => {
    if (audience !== "plan") return
    let cancelled = false
    loadAdminPlans()
      .then((rows) => {
        if (!cancelled) setPlans(rows)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [audience])

  // The default plan is deliberately left out: it is what somebody falls back
  // to when they are *not* paying, so "members on the free plan" would read as
  // almost everybody and match almost nobody.
  const choices = (plans ?? []).filter((plan) => plan.active && !plan.isDefault)
  const slugKnown = choices.some((plan) => plan.slug === planSlug)
  const noPlans = plans !== null && choices.length === 0

  // The segments to choose between, loaded the same advisory way as the plans.
  const [segments, setSegments] = React.useState<SegmentChoice[] | null>(null)
  React.useEffect(() => {
    if (audience !== "segment") return
    let cancelled = false
    loadSegmentChoices()
      .then((rows) => {
        if (!cancelled) setSegments(rows)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [audience])

  const segmentKnown = (segments ?? []).some(
    (segment) => segment.id === segmentId
  )
  const noSegments = segments !== null && segments.length === 0

  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`audience-${node.id}-kind`}
          className="text-xs"
          hint="Worked out again every time the flow runs, so it is never a list somebody has to keep up to date."
        >
          Who this flow is about
        </FieldLabel>
        <Select
          value={audience}
          onValueChange={(value) => {
            if (!isAudienceKind(value)) return
            // A plan only means anything for the "one plan" choice, and a
            // segment only for the segment one, so moving away drops them
            // rather than leaving them lying there.
            setSettings({
              audience: value,
              planSlug: value === "plan" ? planSlug : "",
              segmentId: value === "segment" ? segmentId : "",
              segmentName: value === "segment" ? segmentName : "",
            })
          }}
        >
          <SelectTrigger
            id={`audience-${node.id}-kind`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUDIENCE_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {AUDIENCE_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {audience === "plan" ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`audience-${node.id}-plan`}
            className="text-xs"
            hint="Only paid plans appear here. The free plan everyone starts on is what people fall back to when they are not paying, so it is not an audience."
          >
            Plan
          </FieldLabel>
          <Select
            value={planSlug || undefined}
            onValueChange={(value) => setSettings({ planSlug: value })}
          >
            <SelectTrigger
              id={`audience-${node.id}-plan`}
              className="w-full sm:w-fit"
            >
              <SelectValue placeholder="Choose a plan" />
            </SelectTrigger>
            <SelectContent>
              {choices.map((plan) => (
                <SelectItem key={plan.id} value={plan.slug}>
                  {plan.name}
                </SelectItem>
              ))}
              {/* A flow can name a plan that has since been archived. Keep it
                  selectable so opening the node cannot silently change who the
                  flow means; the run says plainly if the plan has gone. */}
              {planSlug && !slugKnown ? (
                <SelectItem value={planSlug}>{planSlug}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          {noPlans ? (
            <InspectorNote className="mt-1">
              There are no paid plans yet. Add one in{" "}
              <Link
                to="/admin/plans"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Plans
              </Link>{" "}
              before this flow runs.
            </InspectorNote>
          ) : null}
        </div>
      ) : null}

      {audience === "segment" ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`audience-${node.id}-segment`}
            className="text-xs"
            hint="Who is in the segment is worked out when the flow runs, not when you save it, so the segment can keep changing underneath."
          >
            Segment
          </FieldLabel>
          <Select
            value={segmentId || undefined}
            onValueChange={(value) => {
              const picked = (segments ?? []).find(
                (segment) => segment.id === value
              )
              // The name rides along for the node card's wording only — the
              // run always looks the segment up by id.
              setSettings({
                segmentId: value,
                segmentName: picked?.name ?? segmentName,
              })
            }}
          >
            <SelectTrigger
              id={`audience-${node.id}-segment`}
              className="w-full sm:w-fit"
            >
              <SelectValue placeholder="Choose a segment" />
            </SelectTrigger>
            <SelectContent>
              {(segments ?? []).map((segment) => (
                <SelectItem key={segment.id} value={segment.id}>
                  {segment.name}
                </SelectItem>
              ))}
              {/* A flow can point at a segment that has since been deleted.
                  Keep it selectable so opening the node cannot silently change
                  who the flow means; the run says plainly if the segment has
                  gone. */}
              {segmentId && !segmentKnown ? (
                <SelectItem value={segmentId}>
                  {segmentName || "A segment that no longer exists"}
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          {noSegments ? (
            <InspectorNote className="mt-1">
              There are no segments yet. Make one in{" "}
              <Link
                to="/admin/segments"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Segments
              </Link>{" "}
              before this flow runs.
            </InspectorNote>
          ) : null}
        </div>
      ) : null}

      <AudiencePreviewNote
        audience={audience}
        planSlug={planSlug}
        segmentId={segmentId}
      />

      {/* One note rather than a helper line under each field, matching the
          other node panels: what this choice means, then the rule that holds
          whatever you choose. */}
      <InspectorNote>
        {AUDIENCE_HINTS[audience]} People who unsubscribed are never included,
        and neither are suspended accounts or accounts being closed, whichever
        choice you make.
      </InspectorNote>
    </InspectorCard>
  )
}

/**
 * Long enough that flicking down the dropdown does not fire a count for every
 * choice it passes, short enough that stopping on one answers straight away.
 */
const PREVIEW_DEBOUNCE_MS = 400

/**
 * An answer, and the exact choice it is an answer to.
 *
 * Held together on purpose: the moment the choice changes the answer stops
 * matching and the panel goes back to counting, so a number that belongs to the
 * previous setting can never sit there looking like this one's. It is also what
 * makes a slow reply that lands after a newer one harmless.
 */
type PreviewAnswer = {
  key: string
  preview: AudiencePreview | null
  /** The failure in words, and "" when it worked. */
  error: string
}

/**
 * How many people this choice matches right now, counted while the flow is
 * still a draft.
 *
 * The number is thrown away the moment the choice changes rather than being
 * left on screen while the next one is worked out: a count that belongs to the
 * previous setting is worse than no count at all, because it looks like an
 * answer.
 */
function AudiencePreviewNote({
  audience,
  planSlug,
  segmentId,
}: {
  audience: AutomationAudienceKind
  planSlug: string
  segmentId: string
}) {
  // A choice that has not been finished has nothing to count yet — asking would
  // only get the refusal the run gives, which is not news while somebody is
  // still halfway through picking.
  const ready =
    audience === "plan"
      ? planSlug !== ""
      : audience === "segment"
        ? segmentId !== ""
        : true

  const [attempt, setAttempt] = React.useState(0)
  const [answer, setAnswer] = React.useState<PreviewAnswer | null>(null)
  // `attempt` is part of the choice so that pressing "Try again" makes the
  // answer on screen stale and asks once more.
  const key = `${audience}|${planSlug}|${segmentId}|${attempt}`

  React.useEffect(() => {
    if (!ready) return

    let cancelled = false
    const timer = setTimeout(() => {
      loadAudiencePreview({ audience, planSlug, segmentId })
        .then((preview) => {
          if (!cancelled) setAnswer({ key, preview, error: "" })
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setAnswer({
            key,
            preview: null,
            error: getAudiencePreviewErrorMessage(error),
          })
        })
    }, PREVIEW_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ready, key, audience, planSlug, segmentId])

  const current = answer?.key === key ? answer : null
  const preview = current?.preview ?? null
  const error = current?.error ?? ""
  const loading = ready && current === null

  // A failure that has been overtaken by a fresh count is not a live failure,
  // so it must not still be sitting there next to a good number. Only a
  // failure this panel raised is cleared: the error toast is one shared slot,
  // and clearing it blind would take down somebody else's message.
  const raisedError = React.useRef(false)
  React.useEffect(() => {
    if (error) {
      raisedError.current = true
      return
    }
    if (raisedError.current) {
      raisedError.current = false
      dismissErrorToast()
    }
  }, [error])

  if (!ready) return null

  return (
    <InspectorNote>
      {loading ? (
        <span className="flex items-center gap-2" role="status">
          <Loader2Icon className="size-3.5 animate-spin" />
          Counting who this matches…
        </span>
      ) : null}

      {error ? (
        <>
          {/* The sentence itself is carried by the shared error toast, which
              also offers the retry. This line is here so the panel does not sit
              blank and silent where a number used to be. */}
          <span role="status">Not counted just now.</span>
          <ErrorBanner
            message={error}
            onRetry={() => setAttempt((value) => value + 1)}
          />
        </>
      ) : null}

      {preview ? (
        <div className="grid gap-2">
          <p className="font-medium text-foreground">
            {preview.total === 0
              ? "Nobody matches right now."
              : `Matches ${preview.total} ${plural(preview.total, "person", "people")} right now.`}
          </p>

          {preview.sample.length > 0 ? (
            <ul className="grid gap-0.5">
              {preview.sample.map((contact) => (
                <li
                  key={contact.id}
                  className="truncate"
                  title={
                    contact.name
                      ? `${contact.name} — ${contact.email}`
                      : contact.email
                  }
                >
                  {contact.name ? `${contact.name} — ` : ""}
                  {contact.email}
                </li>
              ))}
              {preview.total > preview.sample.length ? (
                <li>
                  and {preview.total - preview.sample.length} more
                </li>
              ) : null}
            </ul>
          ) : null}

          {audienceIsMostOfTheList(audience, preview.total, preview.everyone) ? (
            <p>
              That is most of your contact list — {preview.everyone}{" "}
              {plural(preview.everyone, "person", "people")} in all.
            </p>
          ) : null}

          <p>
            Counted just now. A run works it out again every time it goes, so
            this is what it would match if it went this moment.{" "}
            <Link
              to="/admin/contacts"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Look people up in Contacts
            </Link>
            .
          </p>
        </div>
      ) : null}
    </InspectorNote>
  )
}
