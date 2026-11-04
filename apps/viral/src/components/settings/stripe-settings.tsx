import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SecretKeyField } from "@/components/settings/secret-key-field"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { useSettingsAutoSave } from "@/components/settings/use-settings-auto-save"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getStripeSettingsErrorMessage,
  loadStripeSettings,
  removeStripeSecret,
  saveStripeSecret,
  saveStripeText,
  saveStripeUseSandbox,
  type StripeSecretField,
  type StripeTextField,
} from "@/lib/api/billing/stripe-settings"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLoad } from "@/lib/hooks/use-load"

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
 * through server/billing/settings.ts and the browser only ever sees a masked
 * tail. Saving is automatic and reports through the sticky header's
 * Saving…/Saved indicator, like every other auto-save in the app.
 */
export function StripeSettings() {
  // The publishable keys as typed; null until the load fills them in.
  const [texts, setTexts] = React.useState<Record<
    StripeTextField,
    string
  > | null>(null)
  const loaded = useLoad(loadStripeSettings, getStripeSettingsErrorMessage, {
    onLoad: (next) =>
      setTexts(
        (prev) =>
          prev ?? {
            livePublishableKey: next.livePublishableKey,
            sandboxPublishableKey: next.sandboxPublishableKey,
          }
      ),
  })
  const status = loaded.data
  // Saves report through the sticky header. `saving` is a field id, or
  // "sandbox" for the switch.
  const autoSave = useSettingsAutoSave(
    getStripeSettingsErrorMessage,
    loaded.setData
  )

  // What was typed but not yet saved, per secret field.
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  // Which secret's Remove is waiting on its confirmation, if any.
  const [removing, setRemoving] = React.useState<StripeSecretField | null>(
    null
  )
  // True while the Remove call itself runs.
  const [runRemove, removeBusy] = useAsyncAction(getStripeSettingsErrorMessage)

  // The save of exactly `value`, and the draft cleared after it only if it
  // still holds that value: a newer edit survives and saves itself in turn.
  const saveSecret = (field: StripeSecretField, value: string) => () =>
    saveStripeSecret(field, value.trim())
  const clearDraft = (field: StripeSecretField, value: string) => () =>
    setDrafts((prev) =>
      prev[field] === value ? { ...prev, [field]: "" } : prev
    )
  const saveText = (field: StripeTextField, value: string) => () =>
    saveStripeText(field, value)

  const editSecret = (field: StripeSecretField, value: string) => {
    setDrafts((prev) => ({ ...prev, [field]: value }))
    if (!value.trim()) {
      autoSave.cancel(field)
      return
    }
    autoSave.schedule(field, saveSecret(field, value), clearDraft(field, value))
  }

  const flushSecret = (field: StripeSecretField) => {
    const value = drafts[field] ?? ""
    if (!value.trim()) return
    autoSave.flush(field, saveSecret(field, value), clearDraft(field, value))
  }

  const flushText = (field: StripeTextField) => {
    if (!texts || !status) return
    const value = texts[field]
    if (value.trim() === status[field]) return
    autoSave.flush(field, saveText(field, value))
  }

  const remove = async (field: StripeSecretField) => {
    await runRemove(async () => {
      loaded.setData(await removeStripeSecret(field))
      setRemoving(null)
    }, `The ${SECRET_NAMES[field]} was removed.`)
  }

  const renderSecretField = ({ id, label, placeholder }: SecretFieldConfig) => {
    if (!status) return null
    const fieldStatus = status.secrets[id]
    return (
      <SecretKeyField
        id={`stripe-${id}`}
        label={label}
        secret={fieldStatus}
        saved={fieldStatus.configured && fieldStatus.source === "settings"}
        placeholder={placeholder}
        value={drafts[id] ?? ""}
        onChange={(value) => editSecret(id, value)}
        onCommit={() => flushSecret(id)}
        actions={
          fieldStatus.source === "settings" ? (
            // Remove waits out an in-flight save: a delete racing the save's
            // upsert could resurrect the key that was just removed.
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={removeBusy || autoSave.saving !== null}
              onClick={() => setRemoving(id)}
            >
              Remove
            </Button>
          ) : null
        }
      />
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
            autoSave.schedule(id, saveText(id, value))
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
        contentClassName="space-y-6"
      >
        {loaded.error ? (
          <ErrorRow message={loaded.error} onRetry={loaded.retry} />
        ) : !status || !texts ? (
          <LoadingRow
            label="Loading Stripe settings…"
            className="min-h-[35rem] sm:min-h-[34.25rem]"
          />
        ) : (
          <>
            <SettingsSwitchRow
              id="stripe-use-sandbox"
              checked={status.useSandbox}
              disabled={autoSave.saving === "sandbox"}
              onCheckedChange={(checked) =>
                void autoSave.run("sandbox", () =>
                  saveStripeUseSandbox(checked)
                )
              }
              label="Use sandbox keys — test payments that move no real money"
            />

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
