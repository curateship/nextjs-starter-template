import * as React from "react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  disconnectYoutubeChannel,
  getRetentionErrorMessage,
  loadYoutubeConnection,
  removeYoutubeClient,
  saveYoutubeClientId,
  saveYoutubeClientSecret,
  type YoutubeConnectionStatus,
} from "@/lib/api/video/youtube-retention"
import { YOUTUBE_CLIENT_MISSING_MESSAGE } from "@/lib/video/retention"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Settings → YouTube, under the key: the one YouTube channel the retention
 * curves are read from (`workspace/docs/retention-curve.md`).
 *
 * The Google client's id and secret save themselves as they are pasted, the
 * secret scrambled and shown again as dots. Connect YouTube sends the admin
 * to Google and back; the address the browser comes back to says how it
 * went, and this card says it in words.
 */

const SAVE_DELAY_MS = 700
const SAVED_SENTINEL = "••••••••••••"
const CONNECT_PATH = "/api/v1/video/youtube/connect"

/** What the callback's `youtube_error` codes mean. */
const CONNECT_FAILURES: Record<string, string> = {
  denied: "Google's screen was closed, so no channel was connected.",
  failed:
    "Google did not finish the sign-in. Check the client ID, the secret and the return address in Google Cloud, then connect again.",
  scopes:
    "Both boxes on Google's screen need a tick. The app only reads figures and cannot change anything on the channel.",
  no_channel:
    "That Google account has no YouTube channel. Connect again and pick the account the channel belongs to.",
  client_missing: YOUTUBE_CLIENT_MISSING_MESSAGE,
  forbidden: "Only an admin can connect a YouTube channel.",
}

type Field = "clientId" | "clientSecret"

/**
 * Held for the page's life, so opening this tab again draws at once instead
 * of loading. Every save replaces it.
 */
let held: YoutubeConnectionStatus | null = null

export function YoutubeChannelCard() {
  const [status, setStatusState] = React.useState(held)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [drafts, setDrafts] = React.useState<Record<Field, string>>({
    clientId: "",
    clientSecret: "",
  })
  const [editing, setEditing] = React.useState<Field | null>(null)
  const [saving, setSaving] = React.useState<Field | null>(null)
  const [confirm, setConfirm] = React.useState<"disconnect" | "remove" | null>(
    null
  )
  const [busy, setBusy] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const timers = React.useRef<Partial<Record<Field, ReturnType<typeof setTimeout>>>>(
    {}
  )

  const setStatus = (next: YoutubeConnectionStatus) => {
    held = next
    setStatusState(next)
  }

  React.useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of Object.values(pending)) clearTimeout(timer)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    loadYoutubeConnection()
      .then((loaded) => {
        if (cancelled) return
        held = loaded
        setStatusState(loaded)
        setLoadError(null)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getRetentionErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  // How the trip to Google went, said once, then taken out of the address so
  // a reload does not say it again.
  React.useEffect(() => {
    const url = new URL(window.location.href)
    const failure = url.searchParams.get("youtube_error")
    const connected = url.searchParams.get("youtube") === "connected"
    if (!failure && !connected) return
    if (failure) {
      showErrorToast(CONNECT_FAILURES[failure] ?? CONNECT_FAILURES.failed)
    } else {
      toast.success("YouTube channel connected.")
    }
    url.searchParams.delete("youtube_error")
    url.searchParams.delete("youtube")
    window.history.replaceState(window.history.state, "", url.toString())
  }, [])

  // `value` rides in as an argument, so the timer saves exactly what was
  // typed when it was scheduled.
  const save = async (field: Field, value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setSaving(field)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const hadChannel = !!status?.channel
      const next =
        field === "clientId"
          ? await saveYoutubeClientId(trimmed)
          : await saveYoutubeClientSecret(trimmed)
      setStatus(next)
      // A field still holding what was saved empties; a newer edit stays.
      setDrafts((prev) =>
        prev[field] === value ? { ...prev, [field]: "" } : prev
      )
      setSaveStatus("saved")
      if (hadChannel && !next.channel) {
        toast.message(
          "A different client cannot use the old sign-in, so the channel was disconnected. Connect it again."
        )
      }
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getRetentionErrorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  const scheduleSave = (field: Field, value: string) => {
    clearTimeout(timers.current[field])
    if (!value.trim()) return
    timers.current[field] = setTimeout(() => void save(field, value), SAVE_DELAY_MS)
  }

  const flushSave = (field: Field) => {
    clearTimeout(timers.current[field])
    if (saving === field) return
    void save(field, drafts[field])
  }

  const connect = () => {
    if (!status?.clientId || !status.maskedSecret) {
      showErrorToast(
        status?.clientUnreadable
          ? "The saved client secret can no longer be read. Paste it again first."
          : YOUTUBE_CLIENT_MISSING_MESSAGE
      )
      return
    }
    window.location.assign(CONNECT_PATH)
  }

  const copyAddress = async () => {
    if (!status) return
    try {
      await navigator.clipboard.writeText(status.redirectUri)
      toast.success("Copied. Paste it in Google Cloud.")
    } catch {
      showErrorToast("The address could not be copied. Select it and copy it yourself.")
    }
  }

  const runConfirmed = async () => {
    setBusy(true)
    dismissErrorToast()
    try {
      if (confirm === "disconnect") {
        const { status: next, revoked } = await disconnectYoutubeChannel()
        setStatus(next)
        toast.success(
          revoked
            ? "Channel disconnected."
            : "Channel disconnected here. Google could not be reached, so remove the app from the Google account's connected apps yourself."
        )
      } else {
        setStatus(await removeYoutubeClient())
        toast.success("Google client removed.")
      }
      setConfirm(null)
    } catch (error) {
      showErrorToast(getRetentionErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <CollapsibleSettingsCard
        storageId="video-youtube-channel"
        title="YouTube channel"
        description="Connect your channel to see, on each export, where viewers stopped watching. The app reads figures only and can never post, edit or delete anything on the channel."
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : !status ? (
          <LoadingRow label="Checking the YouTube channel…" />
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground" role="status">
              {status.channel
                ? `Connected to ${status.channel.title} since ${new Date(
                    status.channel.connectedAt
                  ).toLocaleDateString()}.`
                : status.clientUnreadable
                  ? "A Google client is saved, but its secret can no longer be read because the server's encryption key changed. Paste the secret again."
                  : "No channel connected yet."}
            </p>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="youtube-redirect-uri"
                hint="In Google Cloud, open the OAuth client and add this under Authorised redirect URIs."
              >
                Return address
              </FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="youtube-redirect-uri"
                  readOnly
                  value={status.redirectUri}
                  className="sm:flex-1"
                  onFocus={(event) => event.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void copyAddress()}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="youtube-client-id"
                hint="From Google Cloud: APIs and services, Credentials, an OAuth client of the Web application type."
              >
                Client ID
              </FieldLabel>
              <Input
                id="youtube-client-id"
                autoComplete="off"
                maxLength={200}
                placeholder="1234567890-abc.apps.googleusercontent.com"
                value={
                  editing === "clientId" || drafts.clientId
                    ? drafts.clientId
                    : (status.clientId ?? "")
                }
                onFocus={() => {
                  setEditing("clientId")
                  setDrafts((prev) => ({
                    ...prev,
                    clientId: prev.clientId || (status.clientId ?? ""),
                  }))
                }}
                onBlur={() => {
                  setEditing(null)
                  if (drafts.clientId.trim() !== (status.clientId ?? "")) {
                    flushSave("clientId")
                  } else {
                    setDrafts((prev) => ({ ...prev, clientId: "" }))
                  }
                }}
                onChange={(event) => {
                  const value = event.target.value
                  setDrafts((prev) => ({ ...prev, clientId: value }))
                  scheduleSave("clientId", value)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") flushSave("clientId")
                }}
              />
            </div>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="youtube-client-secret"
                hint="Shown once in Google Cloud beside the client ID. It is scrambled before it is stored and never shown again."
              >
                Client secret
              </FieldLabel>
              <Input
                id="youtube-client-secret"
                type="password"
                autoComplete="off"
                maxLength={200}
                placeholder="Paste the client secret"
                value={
                  !drafts.clientSecret &&
                  editing !== "clientSecret" &&
                  status.maskedSecret
                    ? SAVED_SENTINEL
                    : drafts.clientSecret
                }
                onFocus={() => setEditing("clientSecret")}
                onBlur={() => {
                  setEditing(null)
                  flushSave("clientSecret")
                }}
                onChange={(event) => {
                  const value = event.target.value
                  setDrafts((prev) => ({ ...prev, clientSecret: value }))
                  scheduleSave("clientSecret", value)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") flushSave("clientSecret")
                }}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={connect}>
                {status.channel ? "Connect again" : "Connect YouTube"}
              </Button>
              {status.channel ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirm("disconnect")}
                >
                  Disconnect
                </Button>
              ) : null}
              {status.clientId || status.maskedSecret || status.clientUnreadable ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving !== null}
                  onClick={() => setConfirm("remove")}
                >
                  Remove client
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={
          confirm === "disconnect"
            ? "Disconnect the YouTube channel?"
            : "Remove the Google client?"
        }
        description={
          confirm === "disconnect"
            ? "The app's sign-in to the channel is deleted. Curves already read stay on their exports; Refresh stops working until the channel is connected again."
            : "The client ID and secret are deleted, and the channel is disconnected with them. Curves already read stay on their exports."
        }
        confirmLabel={confirm === "disconnect" ? "Disconnect" : "Remove client"}
        loading={busy}
        onConfirm={() => void runConfirmed()}
      />
    </>
  )
}
