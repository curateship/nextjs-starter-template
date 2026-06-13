import * as React from "react"
import {
  CheckCircle2Icon,
  Loader2Icon,
  PhoneIcon,
  RefreshCwIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import {
  getProviderErrorMessage,
  getProviderStatus,
  syncPhoneNumbers,
  testProviderConnection,
  type ProviderStatus,
} from "@/lib/api/provider"

// Voice provider connection page: key status, connection test, webhook info,
// and the phone numbers mirrored from the provider.
export function ProviderSettings() {
  const [status, setStatus] = React.useState<ProviderStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [testing, setTesting] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)

  React.useEffect(() => {
    let active = true
    getProviderStatus()
      .then((data) => {
        if (active) setStatus(data)
      })
      .catch((loadError) => {
        if (active) setError(getProviderErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [])

  async function handleTestConnection() {
    setTesting(true)
    setError(null)
    setNotice(null)
    try {
      const result = await testProviderConnection()
      setNotice(
        `Connection works — Vapi reports ${result.phone_number_count} phone ${result.phone_number_count === 1 ? "number" : "numbers"}.`
      )
    } catch (testError) {
      setError(getProviderErrorMessage(testError))
    } finally {
      setTesting(false)
    }
  }

  async function handleSyncNumbers() {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      const numbers = await syncPhoneNumbers()
      setStatus((current) =>
        current ? { ...current, phone_numbers: numbers } : current
      )
      setNotice(
        `Synced ${numbers.length} phone ${numbers.length === 1 ? "number" : "numbers"} from Vapi.`
      )
    } catch (syncError) {
      setError(getProviderErrorMessage(syncError))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="w-full max-w-2xl">
      {notice ? (
        <div className="mb-4 flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-500" />
          <span>{notice}</span>
        </div>
      ) : null}
      {error ? (
        <ErrorAlert className="mb-4" message={error} />
      ) : null}

      {!status ? (
        <div className="flex items-center justify-center rounded-xl border bg-card py-16">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Connection */}
          <section className="space-y-3 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Vapi</h2>
              <Badge variant={status.configured ? "secondary" : "outline"}>
                {status.configured ? `Connected ${status.masked_key}` : "Not connected"}
              </Badge>
            </div>
            {status.configured ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Vapi handles telephony, speech, and AI for your agents. Saving an
                  agent pushes it to Vapi automatically.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={testing}
                  onClick={handleTestConnection}
                >
                  {testing ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  {testing ? "Testing" : "Test Connection"}
                </Button>
              </>
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Connect Vapi to sync agents, import phone numbers, and start
                  calling:
                </p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    Create an account at{" "}
                    <a
                      href="https://dashboard.vapi.ai"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      dashboard.vapi.ai
                    </a>{" "}
                    and copy an API key
                  </li>
                  <li>
                    Add it to the app environment as{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      AI_AGENTS_VAPI_API_KEY
                    </code>
                  </li>
                  <li>Restart the app and refresh this page</li>
                </ol>
                <p>
                  Until then, agents save locally and show a "Not synced" badge.
                </p>
              </div>
            )}
          </section>

          {/* Phone numbers */}
          <section className="space-y-3 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Phone Numbers</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!status.configured || syncing}
                onClick={handleSyncNumbers}
              >
                {syncing ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <RefreshCwIcon className="size-4" />
                )}
                {syncing ? "Syncing" : "Sync from Vapi"}
              </Button>
            </div>
            {status.phone_numbers.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
                No phone numbers yet. Get a free number in the Vapi dashboard, then
                sync it here — outbound calls need one as the caller ID.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {status.phone_numbers.map((number) => (
                  <li key={number.id} className="flex items-center gap-3 px-3 py-2">
                    <PhoneIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">{number.number}</span>
                    {number.name ? (
                      <span className="truncate text-sm text-muted-foreground">
                        {number.name}
                      </span>
                    ) : null}
                    <Badge variant="outline" className="ml-auto">
                      {number.provider}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Webhook */}
          <section className="space-y-2 rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Webhook</h2>
            {status.webhook_url ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Vapi pushes call updates to this endpoint (attached to agents on
                  their next save):
                </p>
                <code className="block rounded bg-muted px-2 py-1.5 text-xs break-all">
                  {status.webhook_url}
                </code>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No public URL configured — fine for local development, where call
                updates arrive by polling. In production, set{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  AI_AGENTS_PUBLIC_URL
                </code>{" "}
                so Vapi can push call results instantly.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
