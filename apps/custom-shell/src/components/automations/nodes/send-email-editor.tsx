import { ArrowLeftIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  EmailBlockEditor,
  type EmailEditableFields,
} from "@/components/broadcasts/email-block-editor"
import { InspectorCard } from "@/components/broadcasts/inspector-fields"
import { Button } from "@/components/ui/button"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import {
  readSendEmailDraftSettings,
  sendEmailAudienceWording,
} from "@/lib/automations/nodes/send-email"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"

export function SendEmailEditor({
  automationName,
  node,
  graph,
  initialBlockDefaults,
  bottomPanel,
  onSave,
  onBack,
}: {
  automationName: string
  node: AutomationNode
  graph: AutomationGraph
  initialBlockDefaults: BroadcastBlockDefaults
  bottomPanel: ReactNode
  onSave: (node: AutomationNode) => Promise<boolean>
  onBack: () => void
}) {
  const settings = readSendEmailDraftSettings(node.settings)
  const fields: EmailEditableFields = {
    subject: settings.subject,
    preheader: settings.preheader,
    fromName: settings.fromName,
    blocks: settings.blocks,
  }

  return (
    <EmailBlockEditor
      title={`${automationName} email`}
      fields={fields}
      initialBlockDefaults={initialBlockDefaults}
      editable
      layout="automationEmail"
      onSave={(next) =>
        onSave({
          ...node,
          settings: {
            subject: next.subject,
            preheader: next.preheader,
            fromName: next.fromName,
            blocks: next.blocks,
          },
        })
      }
      settingsExtra={
        <InspectorCard title="Who gets it">
          <p className="text-[15px] leading-relaxed">
            {sendEmailAudienceWording(graph, node.id)}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Members without a confirmed email address are skipped and counted in
            the run history.
          </p>
        </InspectorCard>
      }
      headerAction={(saveNow) => (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void saveNow().then((saved) => {
              if (saved) onBack()
            })
          }
        >
          <ArrowLeftIcon className="size-4" />
          Back to flow
        </Button>
      )}
      bottomPanel={bottomPanel}
    />
  )
}
