import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  clearStorage,
  getStorageErrorMessage,
  loadStorageSettings,
  saveStorage,
  testStorage,
  type StorageSettingsStatus,
  type StorageTestResult,
} from "@/lib/api/storage"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"

// An edit saves itself this long after the last keystroke; leaving the field
// (or pressing Enter) saves straight away. Same rhythm as the Payments tab.
const SAVE_DELAY_MS = 1200

// What the saved secret's field displays while it is not being edited. Any
// string renders as dots in a password field; the length just makes it look
// like one.
const SAVED_SENTINEL = "••••••••••••"

type PlainField = "accountId" | "accessKeyId" | "bucketName" | "publicUrl"

const FIELDS: { id: PlainField; label: string; placeholder: string; hint: string }[] =
  [
    {
      id: "accountId",
      label: "Account ID",
      placeholder: "The 32-character ID from your Cloudflare dashboard",
      hint: "Cloudflare dashboard → R2 → the ID in the address bar, or beside 'Account ID' on the R2 overview page.",
    },
    {
      id: "accessKeyId",
      label: "Access key ID",
      placeholder: "The ID half of an R2 API token",
      hint: "Cloudflare dashboard → R2 → Manage API tokens → Create token. Give it read and write on the bucket below.",
    },
    {
      id: "bucketName",
      label: "Bucket name",
      placeholder: "The bucket uploads are written into",
      hint: "The bucket must already exist. Nothing here creates one.",
    },
    {
      id: "publicUrl",
      label: "Public address",
      placeholder: "https://media.your-domain.com",
      hint: "The address browsers fetch the files from: the bucket's custom domain, or its r2.dev address once public access is on. Without it an upload is refused, because the app would have no address to hand out.",
    },
  ]

/**
 * Settings → Storage. Where uploaded files are kept, app-wide, saved through
 * server/media/storage-settings.ts. The secret is scrambled before it is
 * stored and the browser only ever sees its last four characters.
 *
 * Saving is automatic and reports through the sticky header's Saving…/Saved
 * indicator, like every other auto-save in the app.
 */
export function StorageSettings() {
  const { reportSaveStatus } = useShellRuntime()
  const [status, setStatus] = React.useState<StorageSettingsStatus | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  // The four plain fields as typed; null until the load fills them in.
  const [values, setValues] = React.useState<Record<PlainField, string> | null>(
    null
  )
  // The secret as typed, empty when it has not been touched this visit.
  const [secret, setSecret] = React.useState("")
  const [editingSecret, setEditingSecret] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [testMessage, setTestMessage] = React.useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = React.useState(false)
  const [runClear, clearBusy] = useAsyncAction(getStorageErrorMessage)

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

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    loadStorageSettings()
      .then((next) => {
        if (cancelled) return
        setStatus(next)
        setValues((prev) => prev ?? pickFields(next))
        setLoadError(null)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getStorageErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  // The five values save together. They only mean anything as a set: an
  // account ID saved without its bucket names nothing the app can write to.
  const save = async (next: Record<PlainField, string>, nextSecret: string) => {
    setSaving(true)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const fresh = await saveStorage({
        ...next,
        // An untouched field must not wipe the stored secret, so it is left
        // out of the call rather than sent as an empty string.
        secretAccessKey: nextSecret.trim() ? nextSecret : undefined,
      })
      setStatus(fresh)
      setValues((prev) => prev ?? pickFields(fresh))
      // Clear the box only if it still holds what was saved — a newer edit
      // must survive and will save itself in turn.
      setSecret((prev) => (prev === nextSecret ? "" : prev))
      setSaveStatus("saved")
    } catch (error) {
      // What was typed stays in the fields so a failed save loses nothing.
      setSaveStatus("idle")
      showErrorToast(getStorageErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const schedule = (next: Record<PlainField, string>, nextSecret: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(next, nextSecret), SAVE_DELAY_MS)
  }

  const flush = () => {
    if (!values) return
    if (timer.current) clearTimeout(timer.current)
    if (saving) {
      // Another save is mid-flight. Tabbing from one field into the next lands
      // exactly here, so the edit stays scheduled rather than being dropped.
      schedule(values, secret)
      return
    }
    void save(values, secret)
  }

  const edit = (field: PlainField, value: string) => {
    setTestMessage(null)
    setValues((prev) => {
      if (!prev) return prev
      const next = { ...prev, [field]: value }
      schedule(next, secret)
      return next
    })
  }

  const runTest = async () => {
    if (!values) return
    setTesting(true)
    setTestMessage(null)
    dismissErrorToast()
    try {
      const verdict = await testStorage({
        accountId: values.accountId,
        accessKeyId: values.accessKeyId,
        bucketName: values.bucketName,
        secretAccessKey: secret,
      })
      setTestMessage(testVerdictMessage(verdict))
    } catch (error) {
      showErrorToast(getStorageErrorMessage(error))
    } finally {
      setTesting(false)
    }
  }

  const clear = async () => {
    await runClear(async () => {
      const fresh = await clearStorage()
      setStatus(fresh)
      setValues(pickFields(fresh))
      setSecret("")
      setTestMessage(null)
      setConfirmingClear(false)
    }, "The saved storage settings were removed.")
  }

  const showSentinel =
    !secret && !editingSecret && Boolean(status?.secretConfigured)

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="storage-bucket"
        title={
          <span className="flex items-center gap-2">
            Cloudflare R2
            {status ? (
              <Badge variant="secondary">
                {status.ready ? "Ready" : "Not set up"}
              </Badge>
            ) : null}
          </span>
        }
        description="Where every uploaded picture, video and file is kept. Fill this in and the server needs no CUSTOM_SHELL_R2_ environment variables. The secret access key is scrambled before it is stored and never leaves the server."
        contentClassName="space-y-6"
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => setReloads((count) => count + 1)}
          />
        ) : !status || !values ? (
          <LoadingRow
            label="Loading storage settings…"
            className="min-h-[30rem] sm:min-h-[26rem]"
          />
        ) : (
          <>
            {FIELDS.map(({ id, label, placeholder, hint }) => (
              <div key={id} className="grid gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <FieldLabel htmlFor={`storage-${id}`} hint={hint}>
                    {label}
                  </FieldLabel>
                  {status.envFields.includes(id) ? (
                    <span className="text-sm text-muted-foreground">
                      From the server&apos;s own setting
                    </span>
                  ) : null}
                </div>
                <Input
                  id={`storage-${id}`}
                  autoComplete="off"
                  placeholder={placeholder}
                  value={values[id]}
                  onChange={(event) => edit(id, event.target.value)}
                  onBlur={flush}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") flush()
                  }}
                />
              </div>
            ))}

            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <FieldLabel
                  htmlFor="storage-secret"
                  hint="The secret half of the same R2 API token. Cloudflare shows it once, when the token is created."
                >
                  Secret access key
                </FieldLabel>
                <span className="text-sm text-muted-foreground">
                  {secretLabel(status)}
                </span>
              </div>
              <Input
                id="storage-secret"
                type="password"
                autoComplete="off"
                placeholder="Paste the secret access key"
                value={showSentinel ? SAVED_SENTINEL : secret}
                onFocus={() => setEditingSecret(true)}
                onBlur={() => {
                  setEditingSecret(false)
                  flush()
                }}
                onChange={(event) => {
                  const value = event.target.value
                  setTestMessage(null)
                  setSecret(value)
                  if (values) schedule(values, value)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") flush()
                }}
              />
            </div>

            {/* Never disabled while idle — a disabled button fades to
                near-invisible and cannot say why. Clicked with a field
                missing, it explains itself in a toast. */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={testing}
                onClick={() => void runTest()}
              >
                {testing ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Test this bucket
              </Button>
              {status.anySaved ? (
                // Unlike Test, this waits out an in-flight save: a delete
                // racing the save could resurrect what was just removed.
                <Button
                  type="button"
                  variant="outline"
                  disabled={clearBusy || saving}
                  onClick={() => setConfirmingClear(true)}
                >
                  Remove these settings
                </Button>
              ) : null}
            </div>

            {testMessage ? (
              <p role="status" className="text-sm text-muted-foreground">
                {testMessage}
              </p>
            ) : null}
          </>
        )}
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={confirmingClear}
        onOpenChange={(open) => {
          if (!open) setConfirmingClear(false)
        }}
        title="Remove the saved storage settings?"
        description="The saved bucket details are deleted. If the server has its own CUSTOM_SHELL_R2_ settings, those take over; otherwise uploads stop working and pictures already uploaded stop loading until a bucket is saved again. Nothing in the bucket itself is touched."
        confirmLabel="Remove settings"
        loading={clearBusy}
        onConfirm={() => void clear()}
      />
    </CardGroup>
  )
}

/** The test verdict in plain words, each outcome clearly its own message. */
function testVerdictMessage(verdict: StorageTestResult) {
  switch (verdict.result) {
    case "ok":
      return "It works — Cloudflare opened the bucket and listed it."
    case "unreachable":
      return "Cloudflare could not be reached at that address. The account ID is the usual cause; check it against the R2 page in your Cloudflare dashboard."
    case "rejected":
      return `Cloudflare turned the request away: ${verdict.reason}`
  }
}

function pickFields(status: StorageSettingsStatus): Record<PlainField, string> {
  return {
    accountId: status.accountId,
    accessKeyId: status.accessKeyId,
    bucketName: status.bucketName,
    publicUrl: status.publicUrl,
  }
}

/** One short line saying whether the secret exists and where it lives. */
function secretLabel(status: StorageSettingsStatus) {
  if (status.secretUnreadable) return "Set, but unreadable — paste it again"
  if (!status.secretConfigured) return "Not set"
  if (status.secretFromEnv) {
    return `Using the server's own key ${status.maskedSecret}`
  }
  return `Set ${status.maskedSecret}`
}
