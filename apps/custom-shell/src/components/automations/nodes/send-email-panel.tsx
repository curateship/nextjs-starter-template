import * as React from "react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import { sendEmailAudienceWording } from "@/lib/automations/nodes/send-email"

export default function SendEmailFields({
  node,
  graph,
  onChange,
}: AutomationNodeFieldsProps) {
  const subject =
    typeof node.settings.subject === "string" ? node.settings.subject : ""
  const body = typeof node.settings.body === "string" ? node.settings.body : ""
  const [subjectTouched, setSubjectTouched] = React.useState(false)
  const [bodyTouched, setBodyTouched] = React.useState(false)
  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-2">
        <FieldLabel htmlFor={`send-email-${node.id}-subject`} className="text-xs">
          Subject
        </FieldLabel>
        <Input
          id={`send-email-${node.id}-subject`}
          value={subject}
          maxLength={200}
          placeholder="e.g. Your weekly update"
          className="text-xs"
          aria-invalid={(subjectTouched && !subject.trim()) || undefined}
          onChange={(event) => setSettings({ subject: event.target.value })}
          onBlur={() => setSubjectTouched(true)}
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`send-email-${node.id}-body`}
          className="text-xs"
          hint="Plain text with paragraph breaks. Email branding and images are added by their own steps later."
        >
          Message
        </FieldLabel>
        <Textarea
          id={`send-email-${node.id}-body`}
          value={body}
          rows={1}
          maxLength={100_000}
          placeholder="Write the email…"
          className="text-xs"
          aria-invalid={(bodyTouched && !body.trim()) || undefined}
          onChange={(event) => setSettings({ body: event.target.value })}
          onBlur={() => setBodyTouched(true)}
        />
      </div>

      <InspectorNote>
        <span className="font-medium text-foreground">Who this goes to: </span>
        {sendEmailAudienceWording(graph, node.id)} Members without a confirmed
        email address are skipped and counted in the run history.
      </InspectorNote>
    </InspectorCard>
  )
}
