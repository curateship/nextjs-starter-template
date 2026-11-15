import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SecretKeyField } from "@/components/settings/secret-key-field"
import { useSettingsAutoSave } from "@/components/settings/use-settings-auto-save"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { useLoad } from "@/lib/hooks/use-load"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

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
 * The Cloudflare R2 card on General settings. Where uploaded files are kept,
 * app-wide, saved through server/media/storage-settings.ts. The secret is
 * scrambled before it is stored and the browser only ever sees its last four
 * characters.
 *
 * Saving is automatic and reports through the sticky header's Saving…/Saved
 * indicator, like every other auto-save in the app.
 */
export function StorageSettings() {
  // The four plain fields as typed; null until the load fills them in.
  const [values, setValues] = React.useState<Record<PlainField, string> | null>(
    null
  )
  const loaded = useLoad(loadStorageSettings, getStorageErrorMessage, {
    onLoad: (next) => setValues((prev) => prev ?? pickFields(next)),
  })
  const status = loaded.data
  const setStatus = loaded.setData
  const autoSave = useSettingsAutoSave(
    getStorageErrorMessage,
    (fresh: StorageSettingsStatus) => {
      setStatus(fresh)
      setValues((prev) => prev ?? pickFields(fresh))
    }
  )

  // The secret as typed, empty when it has not been touched this visit.
  const [secret, setSecret] = React.useState("")
  const [testing, setTesting] = React.useState(false)
  const [testMessage, setTestMessage] = React.useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = React.useState(false)
  const [runClear, clearBusy] = useAsyncAction(getStorageErrorMessage)

  // Clear the box only if it still holds what was saved — a newer edit must
  // survive and will save itself in turn.
  const clearSecret = (nextSecret: string) => () =>
    setSecret((prev) => (prev === nextSecret ? "" : prev))

  // The five values save together, under one timer. They only mean anything
  // as a set: an account ID saved without its bucket names nothing the app
  // can write to.
  const schedule = (next: Record<PlainField, string>, nextSecret: string) =>
    autoSave.schedule(
      "bucket",
      saveBucket(next, nextSecret),
      clearSecret(nextSecret)
    )
  const flush = () => {
    if (!values) return
    autoSave.flush("bucket", saveBucket(values, secret), clearSecret(secret))
  }

  const edit = (field: PlainField, value: string) => {
    if (!values) return
    setTestMessage(null)
    const next = { ...values, [field]: value }
    setValues(next)
    schedule(next, secret)
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
    })
  }

  return (
    <>
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
        {loaded.error ? (
          <ErrorRow message={loaded.error} onRetry={loaded.retry} />
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

            <SecretKeyField
              id="storage-secret"
              label="Secret access key"
              hint="The secret half of the same R2 API token. Cloudflare shows it once, when the token is created."
              secret={{
                configured: status.secretConfigured,
                unreadable: status.secretUnreadable,
                maskedKey: status.maskedSecret,
                source: status.secretFromEnv ? "env" : "settings",
              }}
              saved={status.secretConfigured}
              placeholder="Paste the secret access key"
              value={secret}
              onChange={(value) => {
                setTestMessage(null)
                setSecret(value)
                if (values) schedule(values, value)
              }}
              onCommit={flush}
            />

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
                  disabled={clearBusy || autoSave.saving !== null}
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
    </>
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

/**
 * What one save sends. An untouched secret box is left out rather than sent
 * empty, so it never wipes the stored secret.
 */
function saveBucket(next: Record<PlainField, string>, secret: string) {
  return () =>
    saveStorage({
      ...next,
      secretAccessKey: secret.trim() ? secret : undefined,
    })
}

function pickFields(status: StorageSettingsStatus): Record<PlainField, string> {
  return {
    accountId: status.accountId,
    accessKeyId: status.accessKeyId,
    bucketName: status.bucketName,
    publicUrl: status.publicUrl,
  }
}
