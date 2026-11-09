import * as React from "react"
import { ArrowLeftIcon, MailIcon } from "lucide-react"

import { TextPickRow } from "@/components/crm/crm-record-menu"
import { EmailPage, useEmailDraft, type EmailEditableFields } from "@/components/crm/email-page"
import { RecordFrame } from "@/components/crm/record-frame"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import {
  readSendEmailDraftSettings,
  sendEmailAudienceWording,
} from "@/lib/automations/nodes/send-email"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"

/**
 * An automation's Send email step, written on the same email page as a
 * newsletter and the app's own emails (Tyler, 7 Nov 2026, asked whether the
 * old editor should go: "2", move it over).
 *
 * - **Header:** Back to flow, which saves first, then the email's ⋮.
 * - **⋮:** General (the subject, the preview line, the From name), Who gets
 *   it, and Runs, the history the old editor kept along its bottom.
 * - **Body:** the email (`EmailPage`): the subject, the preview line and Rich
 *   text typed in place, each block's options behind the cog in its bar, a
 *   right-click for the block list.
 *
 * It saves 700ms after the last change, into the step's own settings, the
 * same fields as before, so a flow already running sends the same email.
 */
export function SendEmailEditor({
  automationName,
  node,
  graph,
  initialBlockDefaults,
  runsPanel,
  onSave,
  onBack,
}: {
  automationName: string
  node: AutomationNode
  graph: AutomationGraph
  initialBlockDefaults: BroadcastBlockDefaults
  /** The flow's run history, drawn in the ⋮'s Runs tab; null for a template. */
  runsPanel: ((active: boolean) => React.ReactNode) | null
  onSave: (node: AutomationNode) => Promise<boolean>
  onBack: () => void
}) {
  const settings = readSendEmailDraftSettings(node.settings)
  const [incoming] = React.useState<EmailEditableFields>(() => ({
    subject: settings.subject,
    preheader: settings.preheader,
    fromName: settings.fromName,
    blocks: settings.blocks,
  }))
  const [menuOpen, setMenuOpen] = React.useState(false)

  const save = React.useCallback(
    async (next: EmailEditableFields) =>
      onSave({
        ...node,
        settings: {
          subject: next.subject,
          preheader: next.preheader,
          fromName: next.fromName,
          blocks: next.blocks,
        },
      }),
    [node, onSave]
  )
  const { fields, change, saveNow } = useEmailDraft({ incoming, version: 0, onSave: save })

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <RecordFrame
        avatar={<MailIcon aria-hidden />}
        title={`${automationName} email`}
        line="Sent by this automation"
        hideLabel="Hide the email"
        bare
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void saveNow().then((saved) => {
                  if (saved) onBack()
                })
              }
            >
              <ArrowLeftIcon className="size-4" />
              Back to flow
            </Button>
            <TabbedMenu
              label="Email menu"
              align="end"
              width="20.4rem"
              open={menuOpen}
              onOpenChange={setMenuOpen}
              tabs={[
                {
                  value: "general",
                  label: "General",
                  content: (
                    <div className="grid gap-4 p-3">
                      <PickGroup title="Email">
                        <TextPickRow
                          label="Subject"
                          value={fields.subject}
                          placeholder="What this email is about"
                          onCommit={(subject) => change((current) => ({ ...current, subject }))}
                        />
                        <TextPickRow
                          label="Preview line"
                          value={fields.preheader}
                          placeholder="The grey line the inbox shows next to it"
                          onCommit={(preheader) => change((current) => ({ ...current, preheader }))}
                        />
                        <TextPickRow
                          label="From name"
                          value={fields.fromName}
                          placeholder="Blank uses the site's"
                          onCommit={(fromName) => change((current) => ({ ...current, fromName }))}
                        />
                      </PickGroup>
                    </div>
                  ),
                },
                {
                  value: "audience",
                  label: "Who gets it",
                  content: (
                    <div className="grid gap-3 p-4 text-sm">
                      <p className="text-[15px] leading-relaxed">{sendEmailAudienceWording(graph, node.id)}</p>
                      <p className="text-muted-foreground">
                        Members without a confirmed email address are skipped and counted in the run history.
                      </p>
                    </div>
                  ),
                },
                ...(runsPanel
                  ? [{ value: "runs", label: "Runs", content: <div className="min-h-64">{runsPanel(true)}</div> }]
                  : []),
              ]}
            />
          </>
        }
        body={
          <EmailPage
            fields={fields}
            change={change}
            blockDefaults={initialBlockDefaults}
            editable
            onOpenSettings={() => setMenuOpen(true)}
          />
        }
      />
    </div>
  )
}
