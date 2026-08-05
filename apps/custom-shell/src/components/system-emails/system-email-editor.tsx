import * as React from "react"
import { SendIcon } from "lucide-react"
import { toast } from "sonner"
import { showErrorToast } from "@/lib/error-toast"

import {
  EmailBlockEditor,
  type EmailEditableFields,
} from "@/components/broadcasts/email-block-editor"
import { InspectorCard } from "@/components/broadcasts/inspector-fields"
import { SystemEmailSendsPanel } from "@/components/system-emails/system-email-sends-panel"
import { Button } from "@/components/ui/button"
import {
  getSystemEmailErrorMessage,
  sendSystemEmailTest,
  updateSystemEmail,
  type SystemEmailDetail,
} from "@/lib/api/system-emails"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import { SYSTEM_EMAIL_META } from "@/lib/system-emails/kinds"

/**
 * The editor for one of the app's own emails.
 *
 * The same editor as a newsletter — that is `EmailBlockEditor`, which both use.
 * What is different is everything a newsletter needs and this does not: there
 * is nobody to pick, no time to schedule and no Send button, because the app
 * sends this one itself the moment somebody registers or forgets a password.
 * In its place: send yourself one, and the record of who has had it.
 */
export function SystemEmailEditor({
  initial,
  initialBlockDefaults,
}: {
  initial: SystemEmailDetail
  initialBlockDefaults: BroadcastBlockDefaults
}) {
  const [fields] = React.useState<EmailEditableFields>({
    subject: initial.subject,
    preheader: initial.preheader,
    fromName: initial.fromName ?? "",
    blocks: initial.blocks,
  })
  const [testing, setTesting] = React.useState(false)
  // Bumped after a test send so the panel below picks the new attempt up.
  const [sendsVersion, setSendsVersion] = React.useState(0)

  const meta = SYSTEM_EMAIL_META[initial.kind]

  const save = React.useCallback(
    async (next: EmailEditableFields) => {
      await updateSystemEmail({
        kind: initial.kind,
        subject: next.subject,
        preheader: next.preheader,
        fromName: next.fromName.trim() || null,
        blocks: next.blocks,
      })
    },
    [initial.kind]
  )

  const sendTest = async (saveNow: () => Promise<void>) => {
    setTesting(true)
    try {
      // Saved first, or the test would show the version before the last thing
      // that was typed — the send reads the email out of the database.
      await saveNow()
      const { delivered } = await sendSystemEmailTest(initial.kind)
      toast.success(
        delivered
          ? "Sent. Check your inbox."
          : "Email is not set up on this server, so it was only written to the log."
      )
    } catch (error) {
      showErrorToast(getSystemEmailErrorMessage(error))
    } finally {
      setSendsVersion((current) => current + 1)
      setTesting(false)
    }
  }

  return (
    <EmailBlockEditor
      title={meta.name}
      fields={fields}
      initialBlockDefaults={initialBlockDefaults}
      editable
      lockedButtonUrl
      layout="systemEmail"
      onSave={save}
      settingsExtra={
        <InspectorCard title="When it goes out">
          <p className="text-[15px] leading-relaxed">{meta.whenSent}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Nobody sends this one — the app does. There is nobody to pick and
            nothing to schedule.
          </p>
        </InspectorCard>
      }
      headerAction={(saveNow) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={testing}
          onClick={() => void sendTest(saveNow)}
        >
          <SendIcon className="size-3.5" />
          {testing ? "Sending…" : "Send myself a test"}
        </Button>
      )}
      bottomPanel={
        <SystemEmailSendsPanel
          kind={initial.kind}
          refreshToken={sendsVersion}
        />
      }
    />
  )
}
