import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  getEmailSettingsErrorMessage,
  loadEmailSettings,
  removeEmailApiKey,
  removeResendWebhookSecret,
  saveEmailApiKey,
  saveEmailSenderSettings,
  saveResendWebhookSecret,
  testEmailKey,
  type EmailKeyTestResult,
  type EmailSettingsStatus,
} from "@/lib/api/email-settings"
import { emailStatusLine } from "@/lib/email-delivery"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { cn } from "@/lib/utils"
import type { SaveStatus } from "@/pages/dashboard/sticky-header/sticky-header"

// An edit saves itself this long after the last keystroke; leaving the field
// (or pressing Enter) saves straight away. Same rhythm as the AI keys tab.
const SAVE_DELAY_MS = 1200

// What the saved key's field displays while it is not being edited. Any string
// renders as dots in a password field; the length just makes it look like one.
const SAVED_SENTINEL = "••••••••••••"

/**
 * Settings → Email. The Resend key every email in the app sends with, and the
 * name and address they come from. The key is saved encrypted through
 * server/email-settings.ts and the browser only ever sees a masked tail.
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
    fromEmail: string
    fromName: string
  } | null>(null)
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
    "sender" | "key" | "webhook" | null
  >(null)
  // The last test's verdict, already worded for the user.
  const [testResult, setTestResult] = React.useState("")
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
          prev ?? { fromEmail: next.fromEmail, fromName: next.fromName }
        )
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

  const scheduleSenderSave = (fromEmail: string, fromName: string) => {
    clearTimeout(timers.current.sender)
    timers.current.sender = setTimeout(
      () => void saveSender(fromEmail, fromName),
      SAVE_DELAY_MS
    )
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
    setTestResult("")
    try {
      setTestResult(testMessage(await testEmailKey(keyDraft)))
    } catch (error) {
      showErrorToast(getEmailSettingsErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  const remove = async (what: "key" | "webhook") => {
    setRunningId("remove")
    dismissErrorToast()
    if (what === "key") setTestResult("")
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

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="email-sending"
        title="Sending emails"
        description="Every email this app sends — sign-in links, newsletters, automations — goes out through Resend with this key, from this name and address."
        contentClassName="space-y-6"
      >
        {loadError ? (
          <ErrorBanner
            message={loadError}
            onRetry={() => setReloads((count) => count + 1)}
          />
        ) : !status || !sender ? (
          <div className="flex justify-center p-6">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DeliveryStatusRow status={status} />

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
                    // A verdict is about one exact key; edited text is
                    // another key, so the old verdict comes down.
                    setTestResult("")
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
              {testResult ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {testResult}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <FieldLabel
                  htmlFor="email-webhook-secret"
                  hint="In Resend → Webhooks, add an endpoint pointing at this app's /api/webhooks/resend for the bounced and complained events, then paste its signing secret here. From then on, addresses that bounce or mark the mail as spam come off the contact list by themselves."
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
                hint="The name in the recipient's inbox, in front of the address — like a return address label."
              >
                From name
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
                hint="Must be an address on a domain you have verified inside Resend, or Resend refuses to send."
              >
                From address
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
          </>
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
function DeliveryStatusRow({ status }: { status: EmailSettingsStatus }) {
  const { on, line } = emailStatusLine(status)

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
        role="status"
        className={cn("text-sm", on ? "text-muted-foreground" : "font-medium")}
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
      return "Resend rejected this key. Check it was copied in full."
    case "unreachable":
      return "Resend could not be reached. Check the server's internet connection and try again."
    case "error":
      return `Resend answered with an error (HTTP ${verdict.status}). The key may still be fine — try again in a minute.`
  }
}
