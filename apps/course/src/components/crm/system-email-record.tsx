import * as React from "react"
import { Loader2Icon, RotateCcwIcon, SendIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { ActionRow, TextPickRow } from "@/components/crm/crm-record-menu"
import { EmailPage, useEmailDraft, type EmailEditableFields } from "@/components/crm/email-page"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { SystemEmailSendsPanel } from "@/components/system-emails/system-email-sends-panel"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  getSystemEmail,
  getSystemEmailErrorMessage,
  resetSystemEmail,
  sendSystemEmailTest,
  updateSystemEmail,
  type SystemEmailDetail,
} from "@/lib/api/email/system-emails"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import { SYSTEM_EMAIL_META, type SystemEmailKind } from "@/lib/system-emails/kinds"
import { showErrorToast } from "@/lib/toast/error-toast"

function fieldsOf(email: { subject: string; preheader: string; fromName: string | null; blocks: SystemEmailDetail["blocks"] }): EmailEditableFields {
  return { subject: email.subject, preheader: email.preheader, fromName: email.fromName ?? "", blocks: email.blocks }
}

/**
 * One of the app's own emails on the CRM's right panel (Part C5; Tyler,
 * 7 Nov 2026: system emails are "a tab in the CRM settings ⋮. Opening a kind
 * puts its editor in the right panel"). The same email page as a newsletter.
 *
 * - **⋮, General:** the subject, the preview line and the From name, when it
 *   goes out, then Reset to the built-in wording.
 * - **⋮, Sends:** who it went to lately.
 * - **Footer:** Send myself a test.
 *
 * Nobody sends this one by hand, so there is nobody to pick and nothing to
 * schedule.
 */
export function SystemEmailRecord({
  kind,
  blockDefaults,
}: {
  kind: SystemEmailKind
  blockDefaults: BroadcastBlockDefaults
}) {
  const [email, setEmail] = React.useState<SystemEmailDetail | null>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    getSystemEmail(kind)
      .then((read) => {
        if (!cancelled) setEmail(read)
      })
      .catch((error) => {
        if (cancelled) return
        setFailed(true)
        showErrorToast(getSystemEmailErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [kind])

  const meta = SYSTEM_EMAIL_META[kind]
  if (!email) {
    return failed ? (
      <EmptyRecord title={meta.name} icon={<SettingsIcon aria-hidden />} line="This email could not be opened." hideLabel="Hide the email" />
    ) : (
      <EmptyRecord title={meta.name} icon={null} line="" loading hideLabel="Hide the email" />
    )
  }
  return <OpenSystemEmail initial={email} blockDefaults={blockDefaults} />
}

function OpenSystemEmail({
  initial,
  blockDefaults,
}: {
  initial: SystemEmailDetail
  blockDefaults: BroadcastBlockDefaults
}) {
  const meta = SYSTEM_EMAIL_META[initial.kind]
  const [incoming, setIncoming] = React.useState(() => fieldsOf(initial))
  const [version, setVersion] = React.useState(0)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [resetOpen, setResetOpen] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [sendsVersion, setSendsVersion] = React.useState(0)

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
  const { fields, change, saveNow } = useEmailDraft({ incoming, version, onSave: save })

  const sendTest = async () => {
    setTesting(true)
    try {
      if (!(await saveNow())) return
      const { delivered } = await sendSystemEmailTest(initial.kind)
      toast.success(delivered ? "Sent. Check your inbox." : "Email is not set up on this server, so it was only written to the log.")
    } catch (error) {
      showErrorToast(getSystemEmailErrorMessage(error))
    } finally {
      setSendsVersion((current) => current + 1)
      setTesting(false)
    }
  }

  const reset = async () => {
    setResetting(true)
    try {
      if (!(await saveNow())) return
      const restored = await resetSystemEmail(initial.kind)
      setIncoming(fieldsOf(restored))
      setVersion((current) => current + 1)
      setResetOpen(false)
      toast.success(`${meta.name} is back to its built-in wording.`)
    } catch (error) {
      showErrorToast(getSystemEmailErrorMessage(error))
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <RecordFrame
        avatar={<SettingsIcon aria-hidden />}
        title={meta.name}
        line="Sent by the app"
        hideLabel="Hide the email"
        bare
        actions={
          <TabbedMenu
            label="System email menu"
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
                    <PickGroup
                      title="Email"
                      after={<p className="px-0.5 text-xs text-muted-foreground">{meta.whenSent}</p>}
                    >
                      <TextPickRow
                        label="Subject"
                        value={fields.subject}
                        onCommit={(subject) => change((current) => ({ ...current, subject }))}
                      />
                      <TextPickRow
                        label="Preview line"
                        value={fields.preheader}
                        onCommit={(preheader) => change((current) => ({ ...current, preheader }))}
                      />
                      <TextPickRow
                        label="From name"
                        value={fields.fromName}
                        placeholder="Blank uses the site's"
                        onCommit={(fromName) => change((current) => ({ ...current, fromName }))}
                      />
                    </PickGroup>
                    <div className="grid">
                      <div aria-hidden className="-mx-3 mb-1.5 border-t" />
                      <ActionRow
                        destructive
                        icon={<RotateCcwIcon className="size-4" />}
                        onClick={() => {
                          setMenuOpen(false)
                          setResetOpen(true)
                        }}
                      >
                        Reset to the built-in wording
                      </ActionRow>
                    </div>
                  </div>
                ),
              },
              {
                value: "sends",
                label: "Sends",
                content: (
                  <div className="min-h-64">
                    <SystemEmailSendsPanel kind={initial.kind} refreshToken={sendsVersion} />
                  </div>
                ),
              },
            ]}
          />
        }
        body={
          <EmailPage
            fields={fields}
            change={change}
            blockDefaults={blockDefaults}
            editable
            lockedButtonUrl
            renderStyle="system"
            onOpenSettings={() => setMenuOpen(true)}
          />
        }
        footer={
          <>
            <FooterState>
              <span className="truncate text-muted-foreground">Nobody sends this by hand.</span>
            </FooterState>
            <Button type="button" size="sm" variant="outline" disabled={testing || resetting} onClick={() => void sendTest()}>
              {testing ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
              {testing ? "Sending…" : "Send myself a test"}
            </Button>
          </>
        }
      />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={`Reset ${meta.name}?`}
        description="Your saved wording and layout are deleted. This email goes back to the wording built into the app and your current default email styling."
        confirmLabel="Reset"
        loading={resetting}
        onConfirm={() => void reset()}
      />
    </>
  )
}
