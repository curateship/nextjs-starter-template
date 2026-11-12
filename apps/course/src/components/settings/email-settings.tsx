import * as React from "react"
import { InfoIcon, Loader2Icon } from "lucide-react"

import { BlockedSendersCard } from "@/components/settings/blocked-senders-card"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { DripSettingsFields } from "@/components/shared/drip-settings-fields"
import { Button } from "@/components/ui/button"
import { Card, CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { NumberField } from "@/components/ui/number-field"
import {
  QUIET_AFTER_EMAILS_MAX,
  QUIET_AFTER_EMAILS_MIN,
} from "@/lib/contacts/gone-quiet"
import { SecretKeyField } from "@/components/settings/secret-key-field"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { useSettingsAutoSave } from "@/components/settings/use-settings-auto-save"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getEmailSettingsErrorMessage,
  loadEmailSettings,
  removeEmailApiKey,
  removeResendWebhookSecret,
  saveEmailApiKey,
  saveAuthLinkExpirySetting,
  saveEmailSenderSettings,
  saveCrmQuoteRepliesSetting,
  saveQuietAfterEmailsSetting,
  saveCrmReplyNameSetting,
  saveCrmReplySignatureSetting,
  saveInboundAddressSetting,
  saveNewsletterDripDefaults,
  saveResendWebhookSecret,
  saveSystemEmailSenderSetting,
  testEmailKey,
  type EmailKeyTestResult,
  type EmailSettingsStatus,
} from "@/lib/api/email/email-settings"
import { validateDripConfig, type DripConfig } from "@/lib/broadcasts/drip"
import type { AuthLinkExpiry } from "@/lib/email/auth-token-expiry"
import {
  emailLinkStatusLine,
  emailStatusLine,
} from "@/lib/email/email-delivery"
import { focusRing } from "@/lib/layout/focus-ring"
import { useLoad } from "@/lib/hooks/use-load"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Sender = {
  systemFromEmail: string
  fromEmail: string
  fromName: string
  inboundAddress: string
  crmReplyName: string
  crmReplySignature: string
  crmQuoteReplies: boolean
}
type SenderBox = Exclude<keyof Sender, "crmQuoteReplies">

// Each sender box's save, and the timer it shares. The newsletter name and
// address are one sender, so they save together under one timer.
const SENDER_SAVES: Record<
  SenderBox,
  { timer: string; save: (sender: Sender) => Promise<EmailSettingsStatus> }
> = {
  systemFromEmail: {
    timer: "systemSender",
    save: (sender) => saveSystemEmailSenderSetting(sender.systemFromEmail),
  },
  fromName: {
    timer: "sender",
    save: (sender) => saveEmailSenderSettings(sender.fromEmail, sender.fromName),
  },
  fromEmail: {
    timer: "sender",
    save: (sender) => saveEmailSenderSettings(sender.fromEmail, sender.fromName),
  },
  inboundAddress: {
    timer: "inbound",
    save: (sender) => saveInboundAddressSetting(sender.inboundAddress),
  },
  crmReplyName: {
    timer: "crmReplyName",
    save: (sender) => saveCrmReplyNameSetting(sender.crmReplyName),
  },
  crmReplySignature: {
    timer: "crmReplySignature",
    save: (sender) => saveCrmReplySignatureSetting(sender.crmReplySignature),
  },
}

const SECRET_SAVES = {
  key: saveEmailApiKey,
  webhook: saveResendWebhookSecret,
}
type Secret = keyof typeof SECRET_SAVES

/**
 * Settings → Email. The Resend key every email in the app sends with, the
 * system sender, and this workspace's newsletter sender. The key is saved
 * encrypted and the browser only ever sees a masked tail.
 * Saving is automatic and reports through the sticky header's Saving…/Saved
 * indicator, like every other auto-save in the app — no Save button.
 */
export function EmailSettings() {
  // The sender fields as typed; null until the load fills them in.
  const [sender, setSender] = React.useState<Sender | null>(null)
  // The pace a new newsletter starts from, as edited; null until the load.
  const [drip, setDrip] = React.useState<DripConfig | null>(null)
  // The run of unopened sends that marks somebody quiet; null until the load.
  const [quietAfter, setQuietAfter] = React.useState<number | null>(null)
  const [linkExpiry, setLinkExpiry] = React.useState<AuthLinkExpiry | null>(null)
  const loaded = useLoad(loadEmailSettings, getEmailSettingsErrorMessage, {
    onLoad: (next) => {
      setSender(
        (prev) =>
          prev ?? {
            systemFromEmail: next.systemFromEmail,
            fromEmail: next.fromEmail,
            fromName: next.fromName,
            inboundAddress: next.inboundAddress,
            crmReplyName: next.crmReplyName,
            crmReplySignature: next.crmReplySignature,
            crmQuoteReplies: next.crmQuoteReplies,
          }
      )
      setDrip((prev) => prev ?? next.dripDefaults)
      setQuietAfter((prev) => prev ?? next.quietAfterEmails)
      setLinkExpiry((prev) => prev ?? next.authLinkExpiry)
    },
  })
  const status = loaded.data
  // What is auto-saving right now. Deliberately NOT part of `busy`: clicking
  // "Test this key" right after typing blurs the field, the blur starts the
  // save, and a save that disabled the buttons would swallow that very click.
  const autoSave = useSettingsAutoSave(
    getEmailSettingsErrorMessage,
    loaded.setData
  )

  // The key and webhook secret as typed but not yet saved.
  const [drafts, setDrafts] = React.useState<Record<Secret, string>>({
    key: "",
    webhook: "",
  })
  // Which button is running — the others grey out, the active one spins.
  const [runningId, setRunningId] = React.useState<"test" | "remove" | null>(
    null
  )
  // Which secret's Remove is waiting on its confirmation, if any.
  const [removing, setRemoving] = React.useState<Secret | null>(null)

  const busy = runningId !== null

  // A sender box saves the whole sender as it stood after this keystroke.
  const editSender = (box: SenderBox, value: string) => {
    if (!sender) return
    const next = { ...sender, [box]: value }
    setSender(next)
    const { timer, save } = SENDER_SAVES[box]
    autoSave.schedule(timer, () => save(next))
  }
  const flushSender = (box: SenderBox) => {
    if (!sender) return
    const { timer, save } = SENDER_SAVES[box]
    autoSave.flush(timer, () => save(sender))
  }
  // What every sender box shares: its value, and saving as it is typed in
  // and when it is left. Enter saves too, except in the signature, where it
  // starts a new line.
  const senderBox = (box: SenderBox) => ({
    value: sender?.[box] ?? "",
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => editSender(box, event.target.value),
    onBlur: () => flushSender(box),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && box !== "crmReplySignature") flushSender(box)
    },
  })

  // No debounce: a switch takes effect when it is flipped, and there is no
  // half-typed state to wait for the way there is in a text box.
  const saveQuoteReplies = async (crmQuoteReplies: boolean) => {
    setSender((prev) => (prev ? { ...prev, crmQuoteReplies } : prev))
    const saved = await autoSave.run("crmQuoteReplies", () =>
      saveCrmQuoteRepliesSetting(crmQuoteReplies)
    )
    // Put the switch back: it never took, so it must not look as if it did.
    if (!saved) {
      setSender((prev) =>
        prev ? { ...prev, crmQuoteReplies: !crmQuoteReplies } : prev
      )
    }
  }

  // The save of exactly `value`, and the box cleared after it only if it
  // still holds that value: a newer edit survives and saves itself in turn.
  const saveSecret = (which: Secret, value: string) => () =>
    SECRET_SAVES[which](value.trim())
  const clearDraft = (which: Secret, value: string) => () =>
    setDrafts((prev) =>
      prev[which] === value ? { ...prev, [which]: "" } : prev
    )
  const editSecret = (which: Secret, value: string) => {
    setDrafts((prev) => ({ ...prev, [which]: value }))
    if (!value.trim()) {
      autoSave.cancel(which)
      return
    }
    autoSave.schedule(which, saveSecret(which, value), clearDraft(which, value))
  }
  const flushSecret = (which: Secret) => {
    const value = drafts[which]
    if (!value.trim()) return
    autoSave.flush(which, saveSecret(which, value), clearDraft(which, value))
  }

  const editLinkExpiry = (next: AuthLinkExpiry) => {
    setLinkExpiry(next)
    autoSave.schedule("linkExpiry", () => saveAuthLinkExpirySetting(next))
  }
  const flushLinkExpiry = () => {
    if (!linkExpiry) return
    autoSave.flush("linkExpiry", () => saveAuthLinkExpirySetting(linkExpiry))
  }

  const editQuiet = (next: number) => {
    setQuietAfter(next)
    autoSave.schedule("quietAfter", () => saveQuietAfterEmailsSetting(next))
  }
  const flushQuiet = () => {
    if (quietAfter === null) return
    autoSave.flush("quietAfter", () => saveQuietAfterEmailsSetting(quietAfter))
  }

  const editDrip = (next: DripConfig) => {
    setDrip(next)
    // Settings that contradict each other are simply not sent. The blur below
    // is what says so out loud — complaining 1.2 seconds after every keystroke
    // would fire halfway through typing a two-digit number.
    if (validateDripConfig(next)) {
      autoSave.cancel("drip")
      return
    }
    autoSave.schedule("drip", () => saveNewsletterDripDefaults(next))
  }
  // Fires when focus leaves the card, which is when a half-typed number has
  // become a finished answer worth judging.
  const flushDrip = () => {
    if (!drip) return
    const invalid = validateDripConfig(drip)
    if (invalid) {
      autoSave.cancel("drip")
      showErrorToast(`Not saved. ${invalid}`)
      return
    }
    autoSave.flush("drip", () => saveNewsletterDripDefaults(drip))
  }

  const test = async () => {
    setRunningId("test")
    dismissErrorToast()
    try {
      const verdict = await testEmailKey(drafts.key)
      if (verdict.result !== "ok") showErrorToast(testMessage(verdict))
    } catch (error) {
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  const remove = async (what: Secret) => {
    setRunningId("remove")
    dismissErrorToast()
    try {
      loaded.setData(
        await (what === "key" ? removeEmailApiKey() : removeResendWebhookSecret())
      )
      setRemoving(null)
    } catch (error) {
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  if (loaded.error) {
    return (
      <CardGroup>
        <Card>
          <ErrorRow
            className="min-h-32"
            message={loaded.error}
            onRetry={loaded.retry}
          />
        </Card>
      </CardGroup>
    )
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="email-sending"
        title="Sending emails"
        description="Every email goes through Resend with this key. Choose one sender for sign-in, reset, and security emails, and another for this workspace's newsletters and automation emails."
        contentClassName="space-y-6"
      >
        {!status || !sender ? (
          <LoadingRow
            label="Loading email sending settings…"
            className="min-h-[29rem] sm:min-h-[26.5rem]"
          />
        ) : (
          <>
            <EmailStatusHeader status={status} />

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="email-system-from-address"
                hint="Used for this workspace's sign-in, verification, password-reset, and security emails. It must be on a domain verified inside Resend."
              >
                System email address
              </FieldLabel>
              <Input
                id="email-system-from-address"
                type="email"
                autoComplete="off"
                placeholder="e.g. notifications@yourdomain.com"
                {...senderBox("systemFromEmail")}
              />
            </div>

            <SecretKeyField
              id="email-resend-key"
              label="Resend API key"
              hint="The key from resend.com → API keys. It is scrambled before it is stored, and only its last four characters are ever shown again."
              secret={{
                configured: status.keyConfigured,
                unreadable: status.keyUnreadable,
                maskedKey: status.maskedKey,
              }}
              saved={status.keyConfigured}
              placeholder="Paste your Resend API key"
              value={drafts.key}
              onChange={(value) => editSecret("key", value)}
              onCommit={() => flushSecret("key")}
              actions={
                // Never disabled while idle — a disabled button fades to
                // near-invisible and cannot say why. Clicked with nothing to
                // test, it explains itself in a toast.
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void test()}
                  >
                    {runningId === "test" ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : null}
                    Test this key
                  </Button>
                  {status.keyConfigured || status.keyUnreadable ? (
                    // Unlike Test, Remove waits out an in-flight save: a
                    // delete racing the save's upsert could resurrect the
                    // key that was just removed.
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || autoSave.saving !== null}
                      onClick={() => setRemoving("key")}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              }
            />

            <SecretKeyField
              id="email-webhook-secret"
              label="Webhook secret"
              hint="In Resend → Webhooks, point an endpoint at this app's /api/webhooks/resend and select delivered, opened, clicked, bounced, and complained. Paste its signing secret here."
              secret={{
                configured: status.webhookConfigured,
                unreadable: status.webhookUnreadable,
                maskedKey: status.maskedWebhookSecret,
              }}
              saved={status.webhookConfigured}
              placeholder="Paste the webhook signing secret"
              value={drafts.webhook}
              onChange={(value) => editSecret("webhook", value)}
              onCommit={() => flushSecret("webhook")}
              actions={
                status.webhookConfigured || status.webhookUnreadable ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 self-start"
                    disabled={busy || autoSave.saving !== null}
                    onClick={() => setRemoving("webhook")}
                  >
                    Remove
                  </Button>
                ) : null
              }
            />

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="email-from-name"
                hint="The name this workspace's newsletters and automation emails show in the recipient's inbox."
              >
                Newsletter from name
              </FieldLabel>
              <Input
                id="email-from-name"
                autoComplete="off"
                placeholder="e.g. The Custom Shell team"
                {...senderBox("fromName")}
              />
            </div>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="email-from-address"
                hint="Used only by this workspace's newsletters and automation emails. It must be on a domain verified inside Resend."
              >
                Newsletter from address
              </FieldLabel>
              <Input
                id="email-from-address"
                type="email"
                autoComplete="off"
                placeholder="e.g. hello@yourdomain.com"
                {...senderBox("fromEmail")}
              />
            </div>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="email-inbound-address"
                hint="A Resend inbound address, such as leads@inbox.yourdomain.com. It needs MX records pointing at Resend, and the email.received event ticked on the webhook. The CRM reads mail here and replies from it, so answers come back."
              >
                Address mail arrives at
              </FieldLabel>
              <Input
                id="email-inbound-address"
                type="email"
                autoComplete="off"
                placeholder="e.g. leads@inbox.yourdomain.com"
                {...senderBox("inboundAddress")}
              />
              <p className="text-xs text-muted-foreground">
                Empty means the CRM has no mailbox, so it cannot reply.
              </p>
            </div>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="email-crm-reply-name"
                hint="Goes in front of the address mail arrives at, so a CRM reply shows a person instead of a bare inbox. The address itself does not change, so answers still come back here."
              >
                Name replies come from
              </FieldLabel>
              <Input
                id="email-crm-reply-name"
                autoComplete="off"
                maxLength={255}
                placeholder="e.g. Tyler"
                {...senderBox("crmReplyName")}
              />
              <p className="text-xs text-muted-foreground">
                Empty sends replies under the app name.
              </p>
            </div>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="email-crm-reply-signature"
                hint="Goes under every reply the CRM sends, below a thin line, and under nothing else in the app. Plain words only: typed brackets arrive as brackets, not as formatting."
              >
                Signature on CRM replies
              </FieldLabel>
              <Textarea
                id="email-crm-reply-signature"
                rows={1}
                maxLength={2000}
                placeholder="e.g. your name, your business, your phone number"
                {...senderBox("crmReplySignature")}
              />
              <p className="text-xs text-muted-foreground">
                Empty adds nothing to a reply.
              </p>
            </div>

            <SettingsSwitchRow
              id="email-crm-quote-replies"
              checked={sender.crmQuoteReplies}
              onCheckedChange={(checked) => void saveQuoteReplies(checked)}
              label="Put their message under your reply"
              hint="The way every mail client does it: your words, then the line saying who wrote and when, then their message indented. Turn it off if you answer short questions all day."
            />
          </>
        )}
      </CollapsibleSettingsCard>

      {/* Next to the address mail arrives at, because that card is where the
          inbound side of email is set up. It fetches its own list. */}
      <BlockedSendersCard />

      <CollapsibleSettingsCard
        storageId="system-email-link-expiry"
        title="System email link expiry"
        description="Choose how long each sign-in or account link remains usable. The email wording updates from these same values automatically."
      >
        {status && linkExpiry ? (
          <div
            className="grid gap-4 sm:grid-cols-2"
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return
              flushLinkExpiry()
            }}
          >
            <NumberField
              id="verification-link-expiry"
              label="Email verification (hours)"
              hint="From 1 hour to 7 days. This also controls verification reminder links."
              value={linkExpiry.verificationHours}
              min={1}
              max={168}
              onChange={(verificationHours) =>
                editLinkExpiry({ ...linkExpiry, verificationHours })
              }
              onCommit={flushLinkExpiry}
            />
            <NumberField
              id="password-reset-link-expiry"
              label="Password reset (minutes)"
              hint="From 5 minutes to 24 hours. This also controls links for accounts created by an admin."
              value={linkExpiry.passwordResetMinutes}
              min={5}
              max={1440}
              onChange={(passwordResetMinutes) =>
                editLinkExpiry({ ...linkExpiry, passwordResetMinutes })
              }
              onCommit={flushLinkExpiry}
            />
            <NumberField
              id="sign-in-link-expiry"
              label="Sign-in link (minutes)"
              hint="From 5 to 60 minutes. Shorter is safer because this link signs somebody straight in."
              value={linkExpiry.signInMinutes}
              min={5}
              max={60}
              onChange={(signInMinutes) =>
                editLinkExpiry({ ...linkExpiry, signInMinutes })
              }
              onCommit={flushLinkExpiry}
            />
            <NumberField
              id="email-change-link-expiry"
              label="Email change (hours)"
              hint="From 1 hour to 7 days. The confirmation and cancellation links use the same limit."
              value={linkExpiry.emailChangeHours}
              min={1}
              max={168}
              onChange={(emailChangeHours) =>
                editLinkExpiry({ ...linkExpiry, emailChangeHours })
              }
              onCommit={flushLinkExpiry}
            />
          </div>
        ) : (
          <LoadingRow
            label="Loading link expiry settings…"
            className="min-h-[16.5rem] sm:min-h-[7.75rem]"
          />
        )}
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="newsletter-drip"
        title="How fast newsletters go out"
        description="Sending a big list all at once is what a spam machine looks like to a mail server. These settings let a newsletter out a few hundred at a time instead. They are the starting point for every new newsletter — each one can still be changed on its own before it is sent."
      >
        {status && drip ? (
          // Focus leaving the card is the moment to judge what was typed, so
          // the handler sits on the container rather than on each of the eight
          // fields. React's onBlur bubbles, so it also fires on every hop from
          // one field to the next inside the card — and the containment check
          // is what stops "the smallest cannot be bigger than the largest"
          // firing on the way to the box that fixes it.
          <div
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return
              flushDrip()
            }}
          >
            <DripSettingsFields
              idPrefix="drip-defaults"
              value={drip}
              onChange={editDrip}
            />
          </div>
        ) : (
          <LoadingRow
            label="Loading newsletter sending settings…"
            className="min-h-13 py-2"
          />
        )}
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="contacts-gone-quiet"
        title="When somebody has gone quiet"
        description="Someone who never opens anything drags every message to everybody else towards the spam folder, so after a run of unopened sends their status becomes Gone quiet. They still get what you send, and the first thing they open puts them back on the list."
      >
        {status && quietAfter !== null ? (
          <div
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return
              flushQuiet()
            }}
          >
            <NumberField
              id="contacts-quiet-after"
              label="Unopened sends in a row"
              hint="From 2 to 50. Seven is a good place to start. An open is a hidden image, so a mail client that blocks pictures never reports one — which is why this counts a run rather than a single message."
              value={quietAfter}
              min={QUIET_AFTER_EMAILS_MIN}
              max={QUIET_AFTER_EMAILS_MAX}
              onChange={editQuiet}
              onCommit={flushQuiet}
            />
          </div>
        ) : (
          <LoadingRow
            label="Loading the gone-quiet rule…"
            className="min-h-13 py-2"
          />
        )}
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={
          removing === "webhook"
            ? "Remove the webhook secret?"
            : "Remove the Resend key?"
        }
        description={
          removing === "webhook"
            ? "The saved secret is deleted. Resend's bounce and spam reports stop being accepted, so addresses that go bad stay on the list until it is set again."
            : "The saved key is deleted. Emails stop going out until a new key is saved — outside production they are written to the server log instead."
        }
        confirmLabel={removing === "webhook" ? "Remove secret" : "Remove key"}
        loading={runningId === "remove"}
        onConfirm={() => {
          if (removing) void remove(removing)
        }}
      />
    </CardGroup>
  )
}

/**
 * Whether email works at all, said before any of the fields.
 *
 * The dot is never the only signal — the sentence beside it says the same
 * thing in words — and it answers the whole question rather than "is there a
 * key in this box", because a key on the server or on another workspace sends
 * this app's emails just as well.
 */
function EmailStatusHeader({ status }: { status: EmailSettingsStatus }) {
  const [open, setOpen] = React.useState(false)
  const lines = [
    emailStatusLine(status),
    emailLinkStatusLine(status),
    {
      on: status.systemSender.configured,
      line: systemSenderStatusLine(status),
    },
  ]
  const ready = lines.every(({ on }) => on)

  return (
    <div className="flex items-center gap-1.5">
      <h3 className="text-sm font-medium">Email status</h3>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="About email status"
            onClick={() => setOpen((shown) => !shown)}
            className={cn(
              "rounded-sm text-muted-foreground transition-colors hover:text-foreground",
              focusRing
            )}
          >
            <InfoIcon className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="grid max-w-md gap-3 p-3">
          {lines.map((line) => (
            <EmailStatusRow key={line.line} {...line} />
          ))}
        </TooltipContent>
      </Tooltip>
      <span
        className={cn(
          "ml-1 size-2 shrink-0 rounded-full",
          ready
            ? "bg-emerald-500 dark:bg-emerald-400"
            : "bg-amber-500 dark:bg-amber-400"
        )}
        aria-hidden
      />
      <span
        role="status"
        className={cn(
          "text-sm",
          ready ? "text-muted-foreground" : "font-medium"
        )}
      >
        {ready ? "Ready" : "Needs attention"}
      </span>
    </div>
  )
}

function systemSenderStatusLine(status: EmailSettingsStatus) {
  if (status.systemSender.source === "settings") {
    return `System emails come from ${status.systemSender.from}. This workspace controls the address below.`
  }
  if (status.systemSender.configured) {
    return `System emails come from ${status.systemSender.from}. Save a different verified address below to replace the deployment default.`
  }
  return `System emails are using Resend's testing sender, ${status.systemSender.from}. It only delivers to the Resend account owner; set CUSTOM_SHELL_EMAIL_FROM to an address on a verified domain.`
}

/** One shared warning shape for sending health and link health. */
function EmailStatusRow({ on, line }: { on: boolean; line: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          on
            ? "bg-emerald-500 dark:bg-emerald-400"
            : "bg-amber-500 dark:bg-amber-400"
        )}
        aria-hidden
      />
      <p
        className={cn(
          "min-w-0 break-words text-xs",
          on ? "text-muted-foreground" : "font-medium"
        )}
      >
        {line}
      </p>
    </div>
  )
}

/** The test verdict in plain words — each outcome clearly its own message. */
function testMessage(verdict: EmailKeyTestResult) {
  switch (verdict.result) {
    case "ok":
      return "It works — Resend accepted the key."
    case "rejected":
      return `Resend rejected this key: ${verdict.reason}`
    case "unreachable":
      return "Resend could not be reached. Check the server's internet connection and try again."
    case "error":
      return `Resend answered with an error (HTTP ${verdict.status}). The key may still be fine — try again in a minute.`
  }
}
