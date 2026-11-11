import * as React from "react"
import { toast } from "sonner"

import { SegmentLiveCount } from "@/components/broadcasts/segment-dialog"
import { SegmentRuleBuilder } from "@/components/broadcasts/segment-rule-builder"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBroadcast, getBroadcastErrorMessage } from "@/lib/api/email/broadcasts"
import { getSegmentErrorMessage, saveSegment } from "@/lib/api/people/contact-segments"
import {
  defaultSegmentRules,
  segmentConditionIsComplete,
  segmentRulesMatch,
  type SegmentCondition,
  type SegmentRuleOptions,
} from "@/lib/contacts/contact-segments"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Add segment and Add broadcast, for the CRM page's + (Tyler, 9 Nov 2026: "in
 * crm. Fix all of these ... they either forward somewhere else or open a
 * modal"). Each is a form inside the + dropdown; making one keeps the admin
 * where they are.
 */

/**
 * A segment from rules: its name, an optional line about it, and the same
 * rules the segment window and Subscribers' Filter use. A hand-picked segment
 * is made on Subscribers, by ticking people and adding them to it.
 */
export function useSegmentForm(options: SegmentRuleOptions | null, onCreated: () => Promise<void>) {
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [conditions, setConditions] = React.useState<SegmentCondition[]>(() => defaultSegmentRules().conditions)
  const [match, setMatch] = React.useState<"all" | "any">(() => segmentRulesMatch(defaultSegmentRules()))
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  /** Saves it; true once it exists. */
  const submit = async (): Promise<boolean> => {
    dismissErrorToast()
    if (!name.trim()) {
      setNameInvalid(true)
      showErrorToast(getSegmentErrorMessage(new Error("SEGMENT_NAME_REQUIRED")))
      return false
    }
    if (conditions.some((condition) => !segmentConditionIsComplete(condition))) {
      showErrorToast(getSegmentErrorMessage(new Error("SEGMENT_RULE_INCOMPLETE")))
      return false
    }
    setSaving(true)
    try {
      await saveSegment(null, {
        name,
        description,
        kind: "rules",
        rules: { ...(match === "any" ? { match } : {}), conditions },
        contactIds: [],
      })
      toast.success("Segment created.")
      setName("")
      setDescription("")
      setConditions(defaultSegmentRules().conditions)
      setMatch(segmentRulesMatch(defaultSegmentRules()))
      setNameInvalid(false)
      await onCreated()
      return true
    } catch (error) {
      showErrorToast(getSegmentErrorMessage(error))
      return false
    } finally {
      setSaving(false)
    }
  }

  const fields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="crm-new-segment-name">Name</Label>
        <Input
          id="crm-new-segment-name"
          autoFocus
          value={name}
          placeholder="Paying customers"
          aria-invalid={nameInvalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            if (event.target.value.trim()) setNameInvalid(false)
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="crm-new-segment-description">Description (optional)</Label>
        <Input
          id="crm-new-segment-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      {options ? (
        <>
        <SegmentRuleBuilder
          idPrefix="crm-new-segment-rule"
          title="Rules"
          description="Who is in it. A rule about being on the list drops somebody the moment they opt out."
          emptyText="No rules yet, so this segment is every contact you have, people who opted out included."
          conditions={conditions}
          onChange={setConditions}
          match={match}
          onMatchChange={setMatch}
          options={options}
        />
        {/* Counted again whenever the rules change, as in the segment window. */}
        <SegmentLiveCount
          key={JSON.stringify({ match, conditions })}
          rules={{ ...(match === "any" ? { match } : {}), conditions }}
        />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Reading the tags and sources…</p>
      )}
    </>
  )

  return { fields, submit, saving: saving || !options }
}

/**
 * A newsletter by its name, made as a draft in Broadcasts and written there.
 * Only admins see the name.
 */
export function useBroadcastForm(onCreated: () => Promise<void>) {
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getBroadcastErrorMessage)

  /** Makes the draft; true once it exists. */
  const submit = async (): Promise<boolean> => {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the newsletter a name first.")
      return false
    }
    let created = false
    await run(async () => {
      await createBroadcast(name.trim())
      setName("")
      setInvalid(false)
      created = true
      await onCreated()
    }, "Newsletter created. It is in Broadcasts as a draft.")
    return created
  }

  const fields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="crm-new-newsletter-name">Name</Label>
        <Input
          id="crm-new-newsletter-name"
          autoFocus
          value={name}
          maxLength={255}
          placeholder="March update"
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            if (event.target.value.trim()) setInvalid(false)
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">Only admins see the name. You write it in Broadcasts.</p>
    </>
  )

  return { fields, submit, saving }
}
