import * as React from "react"
import { CheckIcon, Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SecretKeyField } from "@/components/settings/secret-key-field"
import { useSettingsAutoSave } from "@/components/settings/use-settings-auto-save"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { InlineError } from "@/components/ui/inline-error"
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
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { useLoad } from "@/lib/hooks/use-load"
import { dismissErrorToast } from "@/lib/toast/error-toast"

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
 * It saves itself like every other settings card, with one difference: new
 * details are tested before they are kept. Leaving a box or pressing Enter,
 * with something changed, asks Cloudflare whether the details open the
 * bucket. Only a pass is saved.
 * A fail is kept on screen with the reason, and the bucket in use stays in
 * use. Saving every keystroke put a half-typed account ID live, which broke
 * uploads and every picture already uploaded before Test was ever pressed.
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
  const [verdict, setVerdict] = React.useState<Verdict | null>(null)
  const [confirmingClear, setConfirmingClear] = React.useState(false)
  const [runClear, clearBusy] = useAsyncAction(getStorageErrorMessage)

  // Clear the box only if it still holds what was saved — a newer edit must
  // survive and will be tested and saved in turn.
  const clearSecret = (nextSecret: string) => () =>
    setSecret((prev) => (prev === nextSecret ? "" : prev))

  // What is on screen against what is saved. Leaving a box that changed
  // nothing tests and saves nothing.
  const changed = Boolean(values && status && hasChanges(values, secret, status))

  // A check reads the newest values when it starts, not the ones from the
  // render that asked for it, so a check queued behind another tests what is
  // on screen by then.
  const latest = React.useRef({ values, secret, status })
  useEffectBeforePaint(() => {
    latest.current = { values, secret, status }
  })
  const checkRunning = React.useRef(false)
  const checkAgain = React.useRef(false)

  /**
   * Tests the details on screen and keeps them only if they pass.
   *
   * The five values are tested and saved together. They only mean anything as
   * a set: an account ID saved without its bucket names nothing the app can
   * write to. A check asked for while one runs (tabbing from one box to the
   * next) waits and runs once that one ends, never dropped.
   */
  const check = async () => {
    if (checkRunning.current) {
      checkAgain.current = true
      return
    }
    const { values: next, secret: nextSecret, status: saved } = latest.current
    if (!next || !saved) return
    const unsaved = hasChanges(next, nextSecret, saved)

    checkRunning.current = true
    setTesting(true)
    setVerdict(null)
    dismissErrorToast()
    try {
      const result = await testStorage({
        accountId: next.accountId,
        accessKeyId: next.accessKeyId,
        bucketName: next.bucketName,
        secretAccessKey: nextSecret,
      })
      if (result.result !== "ok") {
        setVerdict({ passed: false, unsaved, message: testVerdictMessage(result) })
        return
      }
      setVerdict({ passed: true, unsaved: false, message: testVerdictMessage(result) })
      if (unsaved) {
        await autoSave.run(
          "bucket",
          saveBucket(next, nextSecret),
          clearSecret(nextSecret)
        )
      }
    } catch (error) {
      setVerdict({ passed: false, unsaved, message: getStorageErrorMessage(error) })
    } finally {
      checkRunning.current = false
      setTesting(false)
      if (checkAgain.current) {
        checkAgain.current = false
        void check()
      }
    }
  }

  /** Leaving a box, or Enter in one: test and keep, if anything changed. */
  const commit = () => {
    if (changed) void check()
  }

  const edit = (field: PlainField, value: string) => {
    if (!values) return
    setVerdict(null)
    setValues({ ...values, [field]: value })
  }

  const clear = async () => {
    await runClear(async () => {
      const fresh = await clearStorage()
      setStatus(fresh)
      setValues(pickFields(fresh))
      setSecret("")
      setVerdict(null)
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
                  aria-invalid={(verdict && !verdict.passed) || undefined}
                  aria-describedby={verdict ? "storage-verdict" : undefined}
                  onChange={(event) => edit(id, event.target.value)}
                  onBlur={commit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commit()
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
                setVerdict(null)
                setSecret(value)
              }}
              onCommit={commit}
            />

            {/* Never disabled while idle — a disabled button fades to
                near-invisible and cannot say why. Clicked with a field
                missing, it says so in the line below. It runs the same check
                leaving a box does, so changed details that pass are kept. */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={testing}
                onClick={() => void check()}
              >
                {testing ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Test this bucket
              </Button>
              {status.anySaved ? (
                // Unlike Test, this waits out a check and its save: a delete
                // racing the save could resurrect what was just removed.
                <Button
                  type="button"
                  variant="outline"
                  disabled={clearBusy || testing || autoSave.saving !== null}
                  onClick={() => setConfirmingClear(true)}
                >
                  Remove these settings
                </Button>
              ) : null}
            </div>

            {verdict?.passed ? (
              <p
                id="storage-verdict"
                role="status"
                className="flex items-start gap-2 text-sm"
              >
                <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {verdict.message}
              </p>
            ) : verdict ? (
              <InlineError id="storage-verdict">
                {verdict.unsaved
                  ? `Not saved, so the bucket in use stays in use. ${verdict.message}`
                  : verdict.message}
              </InlineError>
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

/**
 * How the last check went. `unsaved` marks a fail that held back changed
 * details, so the line can say they were not kept.
 */
type Verdict = { passed: boolean; unsaved: boolean; message: string }

/**
 * Whether the boxes differ from what is saved. Compared the way the server
 * stores them: trimmed, and the public address without a trailing slash.
 */
function hasChanges(
  values: Record<PlainField, string>,
  secret: string,
  status: StorageSettingsStatus
) {
  const stored = (field: PlainField, value: string) => {
    const trimmed = value.trim()
    return field === "publicUrl" ? trimmed.replace(/\/+$/, "") : trimmed
  }
  const saved = pickFields(status)
  return (
    Boolean(secret.trim()) ||
    FIELDS.some(({ id }) => stored(id, values[id]) !== stored(id, saved[id]))
  )
}

/** The test verdict in plain words, each outcome clearly its own message. */
function testVerdictMessage(verdict: StorageTestResult) {
  switch (verdict.result) {
    case "ok":
      return "It works. Cloudflare opened the bucket and listed it."
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
