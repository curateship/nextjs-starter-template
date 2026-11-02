import { SettingsIcon } from "lucide-react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { Button } from "@/components/ui/button"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  sendEmailAudienceWording,
  sendEmailDraftSettingsSchema,
} from "@/lib/automations/nodes/send-email"
import { plural } from "@/lib/format/plural"

export default function SendEmailFields({
  node,
  graph,
  onOpenEditor,
}: AutomationNodeFieldsProps) {
  const parsed = sendEmailDraftSettingsSchema.safeParse(node.settings)

  return (
    <InspectorCard title="Email">
      {parsed.success ? (
        <>
          <div className="grid gap-1">
            <p className="text-xs font-medium text-foreground">
              {parsed.data.subject.trim() || "No subject yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {parsed.data.blocks.length}{" "}
              {plural(parsed.data.blocks.length, "block", "blocks")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onOpenEditor}
          >
            <SettingsIcon className="size-4" />
            Open email builder
          </Button>
        </>
      ) : (
        <InspectorNote>
          This step uses an older email format. Remove it and add a new Send
          Email step to use the builder.
        </InspectorNote>
      )}

      <InspectorNote>
        <span className="font-medium text-foreground">Who this goes to: </span>
        {sendEmailAudienceWording(graph, node.id)} Members without a confirmed
        email address are skipped and counted in the run history.
      </InspectorNote>
    </InspectorCard>
  )
}
