import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  DIRECTORY_EMAIL_BODY_MAX,
  DIRECTORY_EMAIL_PLACEHOLDERS,
  DIRECTORY_EMAIL_SUBJECT_MAX,
  readDirectoryEmailSettings,
} from "@/lib/directory/automation-nodes"

/** The "Email about the listing" step's subject, body and fill-in words. */
export default function DirectoryEmailFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const { subject, body } = readDirectoryEmailSettings(node.settings)
  const set = (patch: Partial<{ subject: string; body: string }>) =>
    onChange({ ...node, settings: { ...node.settings, ...patch } })

  return (
    <>
      <InspectorCard title="Email">
        <div className="grid gap-1.5">
          <FieldLabel htmlFor={`directory-email-${node.id}-subject`} className="text-xs">
            Subject
          </FieldLabel>
          <Input
            id={`directory-email-${node.id}-subject`}
            maxLength={DIRECTORY_EMAIL_SUBJECT_MAX}
            value={subject}
            onChange={(event) => set({ subject: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`directory-email-${node.id}-body`}
            className="text-xs"
            hint="Plain text. Each line becomes a paragraph."
          >
            Message
          </FieldLabel>
          <Textarea
            id={`directory-email-${node.id}-body`}
            rows={1}
            maxLength={DIRECTORY_EMAIL_BODY_MAX}
            value={body}
            onChange={(event) => set({ body: event.target.value })}
          />
        </div>
        <InspectorNote>
          Goes to the person the trigger is about: the submitter, the new
          owner, or whoever bought the featured spot. Anybody who has opted out
          in People is skipped, and every email ends with a link to opt out.
        </InspectorNote>
      </InspectorCard>

      <InspectorCard title="Words it fills in">
        <ul className="grid gap-1.5 text-xs">
          {DIRECTORY_EMAIL_PLACEHOLDERS.map((placeholder) => (
            <li key={placeholder.token} className="grid gap-0.5">
              <code className="font-mono">{placeholder.token}</code>
              <span className="text-muted-foreground">
                {placeholder.meaning}
              </span>
            </li>
          ))}
        </ul>
      </InspectorCard>
    </>
  )
}
