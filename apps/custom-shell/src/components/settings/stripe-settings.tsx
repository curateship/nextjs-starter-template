import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getStripeSettingsErrorMessage,
  loadStripeSettings,
  removeStripeSecret,
  saveStripeSecret,
  saveStripeText,
  saveStripeUseSandbox,
  type StripeSecretField,
  type StripeSecretStatus,
  type StripeSettingsStatus,
  type StripeTextField,
} from "@/lib/api/stripe-settings"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useAsyncAction } from "@/lib/use-async-action"
import type { SaveStatus } from "@/pages/dashboard/sticky-header/sticky-header"

// An edit saves itself this long after the last keystroke; leaving the field
// (or pressing Enter) saves straight away. Same rhythm as the Email tab.
const SAVE_DELAY_MS = 1200

// What a saved secret's field displays while it is not being edited. Any
// string renders as dots in a password field; the length just makes it look
// like one.
const SAVED_SENTINEL = "••••••••••••"

type SecretFieldConfig = {
  id: StripeSecretField
  label: string
  placeholder: string
}
type TextFieldConfig = {
  id: StripeTextField
  label: string
  placeholder: string
}

/** One mode's three fields, in the order Stripe's own dashboard lists them. */
type CredentialSection = {
  title: string
  secret: SecretFieldConfig
  publishable: TextFieldConfig
  webhook: SecretFieldConfig
}

const SECTIONS: CredentialSection[] = [
  {
    title: "Live credentials",
    secret: {
      id: "liveSecretKey",
      label: "Live secret key",
      placeholder: "Paste your live secret key",
    },
    publishable: {
      id: "livePublishableKey",
      label: "Live publishable key",
      placeholder: "Paste your live publishable key",
    },
    webhook: {
      id: "liveWebhookSecret",
      label: "Live webhook secret",
      placeholder: "Paste your live webhook secret",
    },
  },
  {
    title: "Sandbox credentials",
    secret: {
      id: "sandboxSecretKey",
      label: "Sandbox secret key",
      placeholder: "Paste your sandbox secret key",
    },
    publishable: {
      id: "sandboxPublishableKey",
      label: "Sandbox publishable key",
      placeholder: "Paste your sandbox publishable key",
    },
    webhook: {
      id: "sandboxWebhookSecret",
      label: "Sandbox webhook secret",
      placeholder: "Paste your sandbox webhook secret",
    },
  },
]

const SECRET_NAMES: Record<StripeSecretField, string> = {
  liveSecretKey: "live secret key",
  liveWebhookSecret: "live webhook secret",
  sandboxSecretKey: "sandbox secret key",
  sandboxWebhookSecret: "sandbox webhook secret",
}

/**
 * Settings → Payments. The Stripe keys everything billing does runs on: a
 * live set and a sandbox set, with one switch saying which is in use — the
 * same shape as the Directory app's Stripe card. Secrets are saved encrypted
 * through server/stripe-settings.ts and the browser only ever sees a masked
 * tail. Saving is automatic and reports through the sticky header's
 * Saving…/Saved indicator, like every other auto-save in the app.
 */
export function StripeSettings() {
  const { reportSaveStatus } = useShellRuntime()
  const [status, setStatus] = React.useState<StripeSettingsStatus | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  // What was typed but not yet saved, per secret field.
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  // The publishable keys as typed; null until the load fills them in.
  const [texts, setTexts] = React.useState<Record<
    StripeTextField,
    string
  > | null>(null)
  // The secret field that is focused: its saved-key dots make way for typing.
  const [editing, setEditing] = React.useState<string | null>(null)
  // What is auto-saving right now: a field id, or "sandbox" for the switch.
  const [saving, setSaving] = React.useState<string | null>(null)
  // Which secret's Remove is waiting on its confirmation, if any.
  const [removing, setRemoving] = React.useState<StripeSecretField | null>(
    null
  )
  // True while the Remove call itself runs.
  const [runRemove, removeBusy] = useAsyncAction(getStripeSettingsErrorMessage)

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

  // One pending auto-save timer per field.
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
    loadStripeSettings()
      .then((next) => {
        if (cancelled) return
        setStatus(next)
        setTexts(
          (prev) =>
            prev ?? {
              livePublishableKey: next.livePublishableKey,
              sandboxPublishableKey: next.sandboxPublishableKey,
            }
        )
        setLoadError(null)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getStripeSettingsErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  const runSave = async (
    id: string,
    call: () => Promise<StripeSettingsStatus>,
    onSaved?: () => void
  ) => {
    setSaving(id)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      setStatus(await call())
      onSaved?.()
      setSaveStatus("saved")
      return true
    } catch (error) {
      // What was typed stays in the field so a failed save loses nothing.
      setSaveStatus("idle")
      showErrorToast(getStripeSettingsErrorMessage(error))
      return false
    } finally {
      setSaving(null)
    }
  }

  // `value` rides in as an argument, not read from state: the timer's closure
  // must save exactly what was typed when it was scheduled.
  const saveSecret = (field: StripeSecretField, value: string) => {
    const key = value.trim()
    if (!key) return
    void runSave(field, () => saveStripeSecret(field, key), () =>
      // Clear the field only if it still holds what was saved — a newer edit
      // must survive and will save itself in turn.
      setDrafts((prev) =>
        prev[field] === value ? { ...prev, [field]: "" } : prev
      )
    )
  }

  const saveText = (field: StripeTextField, value: string) => {
    void runSave(field, () => saveStripeText(field, value))
  }

  const scheduleSave = (field: string, run: () => void) => {
    clearTimeout(timers.current[field])
    timers.current[field] = setTimeout(run, SAVE_DELAY_MS)
  }

  const flushSecret = (field: StripeSecretField) => {
    const value = drafts[field] ?? ""
    if (!value.trim()) return
    clearTimeout(timers.current[field])
    if (saving !== null) {
      // Another save is mid-flight. Dropping the edit would lose it for good
      // — tabbing from one field into the next lands exactly here — so it
      // stays scheduled instead.
      scheduleSave(field, () => saveSecret(field, value))
      return
    }
    saveSecret(field, value)
  }

  const flushText = (field: StripeTextField) => {
    if (!texts || !status) return
    const value = texts[field]
    if (value.trim() === status[field]) return
    clearTimeout(timers.current[field])
    if (saving !== null) {
      scheduleSave(field, () => saveText(field, value))
      return
    }
    saveText(field, value)
  }

  const remove = async (field: StripeSecretField) => {
    await runRemove(async () => {
      setStatus(await removeStripeSecret(field))
      setRemoving(null)
    }, `The ${SECRET_NAMES[field]} was removed.`)
  }

  const renderSecretField = ({ id, label, placeholder }: SecretFieldConfig) => {
    if (!status) return null
    const fieldStatus = status.secrets[id]
    const draft = drafts[id] ?? ""
    // A saved key shows as dots until the field is focused or typed in, so a
    // filled field means a key is there.
    const showSentinel =
      !draft && editing !== id && fieldStatus.configured &&
      fieldStatus.source === "settings"
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <FieldLabel htmlFor={`stripe-${id}`}>{label}</FieldLabel>
          <span className="text-sm text-muted-foreground">
            {secretStatusLabel(fieldStatus)}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`stripe-${id}`}
            className="sm:flex-1"
            type="password"
            autoComplete="off"
            placeholder={placeholder}
            value={showSentinel ? SAVED_SENTINEL : draft}
            onFocus={() => setEditing(id)}
            onBlur={() => {
              setEditing(null)
              flushSecret(id)
            }}
            onChange={(event) => {
              const value = event.target.value
              setDrafts((prev) => ({ ...prev, [id]: value }))
              scheduleSave(id, () => saveSecret(id, value))
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") flushSecret(id)
            }}
          />
          {fieldStatus.source === "settings" ? (
            // Remove waits out an in-flight save: a delete racing the save's
            // upsert could resurrect the key that was just removed.
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={removeBusy || saving !== null}
              onClick={() => setRemoving(id)}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  const renderTextField = ({ id, label, placeholder }: TextFieldConfig) => {
    if (!texts) return null
    return (
      <div className="grid gap-2">
        <FieldLabel htmlFor={`stripe-${id}`}>{label}</FieldLabel>
        <Input
          id={`stripe-${id}`}
          autoComplete="off"
          placeholder={placeholder}
          value={texts[id]}
          onChange={(event) => {
            const value = event.target.value
            setTexts((prev) => (prev ? { ...prev, [id]: value } : prev))
            scheduleSave(id, () => saveText(id, value))
          }}
          onBlur={() => flushText(id)}
          onKeyDown={(event) => {
            if (event.key === "Enter") flushText(id)
          }}
        />
      </div>
    )
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="stripe-keys"
        title={
          <span className="flex items-center gap-2">
            Stripe
            {status ? (
              <Badge variant="secondary">
                {status.useSandbox ? "Using sandbox" : "Using live"}
              </Badge>
            ) : null}
          </span>
        }
        description="Payment processing for plans and subscriptions. Two full sets of keys — live and sandbox — and one switch saying which set the app charges through. Secrets are scrambled before they are stored and never leave the server."
        contentClassName="space-y-8"
      >
        {loadError ? (
          <ErrorBanner
            message={loadError}
            onRetry={() => setReloads((count) => count + 1)}
          />
        ) : !status || !texts ? (
          <div className="flex justify-center p-6">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Checkbox
                id="stripe-use-sandbox"
                checked={status.useSandbox}
                disabled={saving === "sandbox"}
                onCheckedChange={(checked) =>
                  void runSave("sandbox", () =>
                    saveStripeUseSandbox(checked === true)
                  )
                }
              />
              <Label htmlFor="stripe-use-sandbox" className="font-normal">
                Use sandbox keys — test payments that move no real money
              </Label>
            </div>

            {SECTIONS.map((section) => (
              <div key={section.title} className="space-y-4">
                <h2 className="text-sm font-semibold">{section.title}</h2>
                {renderSecretField(section.secret)}
                {renderTextField(section.publishable)}
                {renderSecretField(section.webhook)}
              </div>
            ))}
          </>
        )}
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`Remove the ${removing ? SECRET_NAMES[removing] : ""}?`}
        description="The saved key is deleted. If the server has its own key for this slot, that one takes over; otherwise billing stops working on this set of keys until a new one is saved."
        confirmLabel="Remove key"
        loading={removeBusy}
        onConfirm={() => {
          if (removing) void remove(removing)
        }}
      />
    </CardGroup>
  )
}

/** One short line saying whether a key exists and where it lives. */
function secretStatusLabel(status: StripeSecretStatus) {
  if (status.unreadable) return "Set, but unreadable — paste it again"
  if (!status.configured) return "Not set"
  if (status.source === "env") {
    return `Using the server's own key ${status.maskedKey}`
  }
  return `Set ${status.maskedKey}`
}
