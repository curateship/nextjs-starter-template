import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import {
  WEBHOOK_PAYLOAD_PREVIEW,
  WEBHOOK_SECRET_HEADER,
  webhookUrlError,
} from "@/lib/automations/nodes/webhook"

export default function WebhookFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const url = typeof node.settings.url === "string" ? node.settings.url : ""
  const secret =
    typeof node.settings.secret === "string" ? node.settings.secret : ""
  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <>
      <InspectorCard title="Settings">
        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`webhook-${node.id}-url`}
            className="text-xs"
            hint="The HTTPS address that receives a JSON POST. Local and private network addresses are blocked when the flow is saved and when it runs."
          >
            URL
          </FieldLabel>
          <Input
            id={`webhook-${node.id}-url`}
            type="url"
            inputMode="url"
            value={url}
            maxLength={2_000}
            placeholder="https://example.com/hooks/automation"
            aria-invalid={url.length > 0 && Boolean(webhookUrlError(url))}
            onChange={(event) => setSettings({ url: event.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`webhook-${node.id}-secret`}
            className="text-xs"
            hint={`Sent as the ${WEBHOOK_SECRET_HEADER} header so the receiver can confirm the request came from this flow.`}
          >
            Secret header (optional)
          </FieldLabel>
          <Input
            id={`webhook-${node.id}-secret`}
            type="password"
            autoComplete="off"
            value={secret}
            maxLength={500}
            placeholder="A secret shared with the receiver"
            onChange={(event) => setSettings({ secret: event.target.value })}
          />
        </div>

        <InspectorNote>
          This secret is stored as part of the flow. Anyone who can read the
          saved flow can read it too.
        </InspectorNote>
      </InspectorCard>

      <InspectorCard title="Payload preview">
        <InspectorNote>
          <pre className="font-mono text-[11px] break-all whitespace-pre-wrap text-foreground">
            {JSON.stringify(WEBHOOK_PAYLOAD_PREVIEW, null, 2)}
          </pre>
        </InspectorNote>
        <p className="text-xs text-muted-foreground">
          Subject is null for a run started by hand. Event facts depend on what
          started the flow.
        </p>
      </InspectorCard>
    </>
  )
}
