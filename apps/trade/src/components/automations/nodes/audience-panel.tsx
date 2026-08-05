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
import { loadAdminPlans, type AdminPlan } from "@/lib/api/admin-plans"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import {
  AUDIENCE_HINTS,
  AUDIENCE_KINDS,
  AUDIENCE_LABELS,
  isAudienceKind,
} from "@/lib/automations/nodes/audience"

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
            // A plan only means anything for the "one plan" choice, so moving
            // away from it drops the plan rather than leaving it lying there.
            setSettings({
              audience: value,
              planSlug: value === "plan" ? planSlug : "",
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

      {/* One note rather than a helper line under each field, matching the
          other node panels: what this choice means, then the rule that holds
          whatever you choose. */}
      <InspectorNote>
        {AUDIENCE_HINTS[audience]} Suspended accounts and accounts being closed
        are never included, whichever choice you make.
      </InspectorNote>
    </InspectorCard>
  )
}
