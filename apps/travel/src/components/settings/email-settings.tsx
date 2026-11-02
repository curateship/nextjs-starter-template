import * as React from "react"
import { InfoIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { BlockedSendersCard } from "@/components/settings/blocked-senders-card"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { DripSettingsFields } from "@/components/shared/drip-settings-fields"
import { useShellRuntime } from "@/components/shell/shell-layout"
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
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
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
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"

// An edit saves itself this long after the last keystroke; leaving the field
// (or pressing Enter) saves straight away. Same rhythm as the AI keys tab.
const SAVE_DELAY_MS = 1200

// What the saved key's field displays while it is not being edited. Any string
// renders as dots in a password field; the length just makes it look like one.
const SAVED_SENTINEL = "••••••••••••"

/**
 * Settings → Email. The Resend key every email in the app sends with, the
 * system sender, and this workspace's newsletter sender. The key is saved
 * encrypted and the browser only ever sees a masked tail.
 * Saving is automatic and reports through the sticky header's Saving…/Saved
 * indicator, like every other auto-save in the app — no Save button.
 */
export function EmailSettings() {
  const { reportSaveStatus } = useShellRuntime()
  const [status, setStatus] = React.useState<EmailSettingsStatus | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  // The sender fields as typed; null until the load fills them in.
  const [sender, setSender] = React.useState<{
    systemFromEmail: string
    fromEmail: string
    fromName: string
    inboundAddress: string
    crmReplyName: string
    crmReplySignature: string
    crmQuoteReplies: boolean
  } | null>(null)
  // The pace a new newsletter starts from, as edited; null until the load.
  const [drip, setDrip] = React.useState<DripConfig | null>(null)
  // The run of unopened sends that marks somebody quiet; null until the load.
  const [quietAfter, setQuietAfter] = React.useState<number | null>(null)
  const [linkExpiry, setLinkExpiry] = React.useState<AuthLinkExpiry | null>(null)
  // The key and webhook secret as typed but not yet saved.
  const [keyDraft, setKeyDraft] = React.useState("")
  const [webhookDraft, setWebhookDraft] = React.useState("")
  // The secret field that is focused: its saved dots make way for typing.
  const [editing, setEditing] = React.useState<"key" | "webhook" | null>(null)
  // Which button is running — the others grey out, the active one spins.
  const [runningId, setRunningId] = React.useState<"test" | "remove" | null>(
    null
  )
  // What is auto-saving right now. Deliberately NOT part of `busy`: clicking
  // "Test this key" right after typing blurs the field, the blur starts the
  // save, and a save that disabled the buttons would swallow that very click.
  const [saving, setSaving] = React.useState<
    | "systemSender"
    | "sender"
    | "inbound"
    | "crmReplyName"
    | "crmReplySignature"
    | "crmQuoteReplies"
    | "key"
    | "webhook"
    | "drip"
    | "quietAfter"
    | "linkExpiry"
    | null
  >(null)
  // Which secret's Remove is waiting on its confirmation, if any.
  const [removing, setRemoving] = React.useState<"key" | "webhook" | null>(
    null
  )

  // The auto-save's outcome, shown in the shared sticky header like every
  // other settings save.
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  React.useEffect(() => {
    reportSaveStatus(saveStatus)
  }, [reportSaveStatus, saveStatus])
  React.useEffect(() => {
    return () => reportSaveStatus(null)
  }, [reportSaveStatus])
  React.useEffect(() => {
    if (saveStatus !== "saved") return
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // One pending auto-save timer per field group.
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  )
  React.useEffect(() => {
    const pending = timers.current
    return () => {
      for (const id of Object.keys(pending)) clearTimeout(pending[id])
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    loadEmailSettings()
      .then((next) => {
        if (cancelled) return
        setStatus(next)
        setSender((prev) =>
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
        setLoadError(null)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getEmailSettingsErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  const busy = runningId !== null

  const saveSystemSender = async (systemFromEmail: string) => {
    setSaving("systemSender")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveSystemEmailSenderSetting(systemFromEmail))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  // `values` ride in as arguments, not read from state: the timer's closure
  // must save exactly what was typed when it was scheduled.
  const saveSender = async (fromEmail: string, fromName: string) => {
    setSaving("sender")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveEmailSenderSettings(fromEmail, fromName))
      setSaveStatus("saved")
    } catch (error) {
      // The fields keep what was typed so a failed save loses nothing.
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const saveInbound = async (inboundAddress: string) => {
    setSaving("inbound")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveInboundAddressSetting(inboundAddress))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const saveCrmName = async (crmReplyName: string) => {
    setSaving("crmReplyName")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveCrmReplyNameSetting(crmReplyName))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const saveCrmSignature = async (crmReplySignature: string) => {
    setSaving("crmReplySignature")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveCrmReplySignatureSetting(crmReplySignature))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  // No debounce: a switch takes effect when it is flipped, and there is no
  // half-typed state to wait for the way there is in a text box.
  const saveQuoteReplies = async (crmQuoteReplies: boolean) => {
    setSender((prev) => (prev ? { ...prev, crmQuoteReplies } : prev))
    setSaving("crmQuoteReplies")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveCrmQuoteRepliesSetting(crmQuoteReplies))
      setSaveStatus("saved")
    } catch (error) {
      // Put the switch back: it never took, so it must not look as if it did.
      setSender((prev) =>
        prev ? { ...prev, crmQuoteReplies: !crmQuoteReplies } : prev
      )
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const saveKey = async (value: string) => {
    const key = value.trim()
    if (!key) return
    setSaving("key")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveEmailApiKey(key))
      // Clear the field only if it still holds what was saved — a newer edit
      // must survive and will save itself in turn.
      setKeyDraft((prev) => (prev === value ? "" : prev))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const saveWebhook = async (value: string) => {
    const secret = value.trim()
    if (!secret) return
    setSaving("webhook")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveResendWebhookSecret(secret))
      setWebhookDraft((prev) => (prev === value ? "" : prev))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const saveDrip = async (next: DripConfig) => {
    // Settings that contradict each other are simply not sent. The blur below
    // is what says so out loud — complaining 1.2 seconds after every keystroke
    // would fire halfway through typing a two-digit number.
    if (validateDripConfig(next)) return
    setSaving("drip")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveNewsletterDripDefaults(next))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const saveLinkExpiry = async (next: AuthLinkExpiry) => {
    setSaving("linkExpiry")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveAuthLinkExpirySetting(next))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const scheduleLinkExpirySave = (next: AuthLinkExpiry) => {
    clearTimeout(timers.current.linkExpiry)
    timers.current.linkExpiry = setTimeout(
      () => void saveLinkExpiry(next),
      SAVE_DELAY_MS
    )
  }

  const flushLinkExpirySave = () => {
    if (!linkExpiry) return
    clearTimeout(timers.current.linkExpiry)
    if (saving !== null) {
      scheduleLinkExpirySave(linkExpiry)
      return
    }
    void saveLinkExpiry(linkExpiry)
  }

  const saveQuiet = async (next: number) => {
    setSaving("quietAfter")
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await saveQuietAfterEmailsSetting(next))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const scheduleQuietSave = (next: number) => {
    clearTimeout(timers.current.quietAfter)
    timers.current.quietAfter = setTimeout(
      () => void saveQuiet(next),
      SAVE_DELAY_MS
    )
  }

  const flushQuietSave = () => {
    if (quietAfter === null) return
    clearTimeout(timers.current.quietAfter)
    if (saving !== null) {
      scheduleQuietSave(quietAfter)
      return
    }
    void saveQuiet(quietAfter)
  }

  const scheduleDripSave = (next: DripConfig) => {
    clearTimeout(timers.current.drip)
    timers.current.drip = setTimeout(() => void saveDrip(next), SAVE_DELAY_MS)
  }

  // Fires when focus leaves the card, which is when a half-typed number has
  // become a finished answer worth judging.
  const flushDripSave = () => {
    if (!drip) return
    clearTimeout(timers.current.drip)
    const invalid = validateDripConfig(drip)
    if (invalid) {
      showErrorToast(`Not saved. ${invalid}`)
      return
    }
    if (saving !== null) {
      scheduleDripSave(drip)
      return
    }
    void saveDrip(drip)
  }

  const scheduleSenderSave = (fromEmail: string, fromName: string) => {
    clearTimeout(timers.current.sender)
    timers.current.sender = setTimeout(
      () => void saveSender(fromEmail, fromName),
      SAVE_DELAY_MS
    )
  }

  const scheduleSystemSenderSave = (systemFromEmail: string) => {
    clearTimeout(timers.current.systemSender)
    timers.current.systemSender = setTimeout(
      () => void saveSystemSender(systemFromEmail),
      SAVE_DELAY_MS,
    )
  }

  const flushSystemSenderSave = () => {
    if (!sender) return
    clearTimeout(timers.current.systemSender)
    if (saving !== null) {
      scheduleSystemSenderSave(sender.systemFromEmail)
      return
    }
    void saveSystemSender(sender.systemFromEmail)
  }

  const flushSenderSave = () => {
    if (!sender) return
    clearTimeout(timers.current.sender)
    if (saving !== null) {
      // Another save is mid-flight. Dropping the edit here would lose it for
      // good — moving focus from one field straight into the next lands
      // exactly on this path — so it stays scheduled instead.
      scheduleSenderSave(sender.fromEmail, sender.fromName)
      return
    }
    void saveSender(sender.fromEmail, sender.fromName)
  }

  const scheduleInboundSave = (inboundAddress: string) => {
    clearTimeout(timers.current.inbound)
    timers.current.inbound = setTimeout(
      () => void saveInbound(inboundAddress),
      SAVE_DELAY_MS
    )
  }

  const flushInboundSave = () => {
    if (!sender) return
    clearTimeout(timers.current.inbound)
    if (saving !== null) {
      scheduleInboundSave(sender.inboundAddress)
      return
    }
    void saveInbound(sender.inboundAddress)
  }

  const scheduleCrmNameSave = (crmReplyName: string) => {
    clearTimeout(timers.current.crmReplyName)
    timers.current.crmReplyName = setTimeout(
      () => void saveCrmName(crmReplyName),
      SAVE_DELAY_MS
    )
  }

  const flushCrmNameSave = () => {
    if (!sender) return
    clearTimeout(timers.current.crmReplyName)
    if (saving !== null) {
      scheduleCrmNameSave(sender.crmReplyName)
      return
    }
    void saveCrmName(sender.crmReplyName)
  }

  const scheduleCrmSignatureSave = (crmReplySignature: string) => {
    clearTimeout(timers.current.crmReplySignature)
    timers.current.crmReplySignature = setTimeout(
      () => void saveCrmSignature(crmReplySignature),
      SAVE_DELAY_MS
    )
  }

  const flushCrmSignatureSave = () => {
    if (!sender) return
    clearTimeout(timers.current.crmReplySignature)
    if (saving !== null) {
      scheduleCrmSignatureSave(sender.crmReplySignature)
      return
    }
    void saveCrmSignature(sender.crmReplySignature)
  }

  const scheduleKeySave = (value: string) => {
    clearTimeout(timers.current.key)
    if (!value.trim()) return
    timers.current.key = setTimeout(() => void saveKey(value), SAVE_DELAY_MS)
  }

  const flushKeySave = () => {
    if (!keyDraft.trim()) return
    clearTimeout(timers.current.key)
    if (saving !== null) {
      // Same as the sender flush: an in-flight save must not eat this edit.
      scheduleKeySave(keyDraft)
      return
    }
    void saveKey(keyDraft)
  }

  const scheduleWebhookSave = (value: string) => {
    clearTimeout(timers.current.webhook)
    if (!value.trim()) return
    timers.current.webhook = setTimeout(
      () => void saveWebhook(value),
      SAVE_DELAY_MS
    )
  }

  const flushWebhookSave = () => {
    if (!webhookDraft.trim()) return
    clearTimeout(timers.current.webhook)
    if (saving !== null) {
      scheduleWebhookSave(webhookDraft)
      return
    }
    void saveWebhook(webhookDraft)
  }

  const test = async () => {
    setRunningId("test")
    dismissErrorToast()
    try {
      const verdict = await testEmailKey(keyDraft)
      const message = testMessage(verdict)
      if (verdict.result === "ok") toast.success(message)
      else showErrorToast(message)
    } catch (error) {
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  const remove = async (what: "key" | "webhook") => {
    setRunningId("remove")
    dismissErrorToast()
    try {
      setStatus(
        await (what === "key" ? removeEmailApiKey() : removeResendWebhookSecret())
      )
      setRemoving(null)
      toast.success(
        what === "key" ? "Resend key removed." : "Webhook secret removed."
      )
    } catch (error) {
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  // A saved secret shows as dots until its field is focused or typed in, so a
  // filled field means a secret is there.
  const showSentinel =
    !keyDraft && editing !== "key" && Boolean(status?.keyConfigured)
  const showWebhookSentinel =
    !webhookDraft && editing !== "webhook" && Boolean(status?.webhookConfigured)

  if (loadError) {
    return (
      <CardGroup>
        <Card>
          <ErrorRow
            className="min-h-32"
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((count) => count + 1)
            }}
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
                value={sender.systemFromEmail}
                onChange={(event) => {
                  const next = {
                    ...sender,
                    systemFromEmail: event.target.value,
                  }
                  setSender(next)
                  scheduleSystemSenderSave(next.systemFromEmail)
                }}
                onBlur={flushSystemSenderSave}
                onKeyDown={(event) => {
                  if (event.key === "Enter") flushSystemSenderSave()
                }}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <FieldLabel
                  htmlFor="email-resend-key"
                  hint="The key from resend.com → API keys. It is scrambled before it is stored, and only its last four characters are ever shown again."
                >
                  Resend API key
                </FieldLabel>
                <span className="text-sm text-muted-foreground">
                  {keyStatusLabel(status)}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="email-resend-key"
                  className="sm:flex-1"
                  type="password"
                  autoComplete="off"
                  placeholder="Paste your Resend API key"
                  value={showSentinel ? SAVED_SENTINEL : keyDraft}
                  onFocus={() => setEditing("key")}
                  onBlur={() => {
                    setEditing(null)
                    flushKeySave()
                  }}
                  onChange={(event) => {
                    setKeyDraft(event.target.value)
                    scheduleKeySave(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") flushKeySave()
                  }}
                />
                {/* Never disabled while idle — a disabled button fades to
                    near-invisible and cannot say why. Clicked with nothing
                    to test, it explains itself in a toast. */}
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
                      disabled={busy || saving !== null}
                      onClick={() => setRemoving("key")}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <FieldLabel
                  htmlFor="email-webhook-secret"
                  hint="In Resend → Webhooks, point an endpoint at this app's /api/webhooks/resend and select delivered, opened, clicked, bounced, and complained. Paste its signing secret here."
                >
                  Webhook secret
                </FieldLabel>
                <span className="text-sm text-muted-foreground">
                  {webhookStatusLabel(status)}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="email-webhook-secret"
                  className="sm:flex-1"
                  type="password"
                  autoComplete="off"
                  placeholder="Paste the webhook signing secret"
                  value={showWebhookSentinel ? SAVED_SENTINEL : webhookDraft}
                  onFocus={() => setEditing("webhook")}
                  onBlur={() => {
                    setEditing(null)
                    flushWebhookSave()
                  }}
                  onChange={(event) => {
                    setWebhookDraft(event.target.value)
                    scheduleWebhookSave(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") flushWebhookSave()
                  }}
                />
                {status.webhookConfigured || status.webhookUnreadable ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 self-start"
                    disabled={busy || saving !== null}
                    onClick={() => setRemoving("webhook")}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>

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
                value={sender.fromName}
                onChange={(event) => {
                  const next = { ...sender, fromName: event.target.value }
                  setSender(next)
                  scheduleSenderSave(next.fromEmail, next.fromName)
                }}
                onBlur={flushSenderSave}
                onKeyDown={(event) => {
                  if (event.key === "Enter") flushSenderSave()
                }}
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
                value={sender.fromEmail}
                onChange={(event) => {
                  const next = { ...sender, fromEmail: event.target.value }
                  setSender(next)
                  scheduleSenderSave(next.fromEmail, next.fromName)
                }}
                onBlur={flushSenderSave}
                onKeyDown={(event) => {
                  if (event.key === "Enter") flushSenderSave()
                }}
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
                value={sender.inboundAddress}
                onChange={(event) => {
                  const next = {
                    ...sender,
                    inboundAddress: event.target.value,
                  }
                  setSender(next)
                  scheduleInboundSave(next.inboundAddress)
                }}
                onBlur={flushInboundSave}
                onKeyDown={(event) => {
                  if (event.key === "Enter") flushInboundSave()
                }}
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
                value={sender.crmReplyName}
                onChange={(event) => {
                  const next = {
                    ...sender,
                    crmReplyName: event.target.value,
                  }
                  setSender(next)
                  scheduleCrmNameSave(next.crmReplyName)
                }}
                onBlur={flushCrmNameSave}
                onKeyDown={(event) => {
                  if (event.key === "Enter") flushCrmNameSave()
                }}
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
                value={sender.crmReplySignature}
                onChange={(event) => {
                  const next = {
                    ...sender,
                    crmReplySignature: event.target.value,
                  }
                  setSender(next)
                  scheduleCrmSignatureSave(next.crmReplySignature)
                }}
                onBlur={flushCrmSignatureSave}
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
              flushLinkExpirySave()
            }}
          >
            <NumberField
              id="verification-link-expiry"
              label="Email verification (hours)"
              hint="From 1 hour to 7 days. This also controls verification reminder links."
              value={linkExpiry.verificationHours}
              min={1}
              max={168}
              onChange={(verificationHours) => {
                const next = { ...linkExpiry, verificationHours }
                setLinkExpiry(next)
                scheduleLinkExpirySave(next)
              }}
              onCommit={flushLinkExpirySave}
            />
            <NumberField
              id="password-reset-link-expiry"
              label="Password reset (minutes)"
              hint="From 5 minutes to 24 hours. This also controls links for accounts created by an admin."
              value={linkExpiry.passwordResetMinutes}
              min={5}
              max={1440}
              onChange={(passwordResetMinutes) => {
                const next = { ...linkExpiry, passwordResetMinutes }
                setLinkExpiry(next)
                scheduleLinkExpirySave(next)
              }}
              onCommit={flushLinkExpirySave}
            />
            <NumberField
              id="sign-in-link-expiry"
              label="Sign-in link (minutes)"
              hint="From 5 to 60 minutes. Shorter is safer because this link signs somebody straight in."
              value={linkExpiry.signInMinutes}
              min={5}
              max={60}
              onChange={(signInMinutes) => {
                const next = { ...linkExpiry, signInMinutes }
                setLinkExpiry(next)
                scheduleLinkExpirySave(next)
              }}
              onCommit={flushLinkExpirySave}
            />
            <NumberField
              id="email-change-link-expiry"
              label="Email change (hours)"
              hint="From 1 hour to 7 days. The confirmation and cancellation links use the same limit."
              value={linkExpiry.emailChangeHours}
              min={1}
              max={168}
              onChange={(emailChangeHours) => {
                const next = { ...linkExpiry, emailChangeHours }
                setLinkExpiry(next)
                scheduleLinkExpirySave(next)
              }}
              onCommit={flushLinkExpirySave}
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
              flushDripSave()
            }}
          >
            <DripSettingsFields
              idPrefix="drip-defaults"
              value={drip}
              onChange={(next) => {
                setDrip(next)
                scheduleDripSave(next)
              }}
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
              flushQuietSave()
            }}
          >
            <NumberField
              id="contacts-quiet-after"
              label="Unopened sends in a row"
              hint="From 2 to 50. Seven is a good place to start. An open is a hidden image, so a mail client that blocks pictures never reports one — which is why this counts a run rather than a single message."
              value={quietAfter}
              min={QUIET_AFTER_EMAILS_MIN}
              max={QUIET_AFTER_EMAILS_MAX}
              onChange={(next) => {
                setQuietAfter(next)
                scheduleQuietSave(next)
              }}
              onCommit={flushQuietSave}
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

/** One short line saying whether a key exists. */
function keyStatusLabel(status: EmailSettingsStatus) {
  if (status.keyUnreadable) return "Set, but unreadable — paste it again"
  if (!status.keyConfigured) return "Not set"
  return `Set ${status.maskedKey}`
}

function webhookStatusLabel(status: EmailSettingsStatus) {
  if (status.webhookUnreadable) return "Set, but unreadable — paste it again"
  if (!status.webhookConfigured) return "Not set"
  return `Set ${status.maskedWebhookSecret}`
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
