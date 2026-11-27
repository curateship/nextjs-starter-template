import * as React from "react"
import { HistoryIcon, Loader2Icon, RotateCwIcon } from "lucide-react"

import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getProfileErrorMessage,
  loadProfileHistory,
  saveProfile,
  type HistoryEntry,
  type ProfileRow,
  type ProfilesPage,
} from "@/lib/api/browser/profiles"
import {
  EVENT_WORDS,
  RUN_ENDINGS,
  countryJumpWarning,
  signedInWords,
} from "@/lib/browser/wording"
import { formatDateTime, formatDuration } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The value a Select uses for "none", since an item cannot be empty. */
const NONE = "none"

type Form = {
  name: string
  proxyId: string
  notes: string
  folderId: string
  labelId: string
  tags: string
}

function formFrom(profile: ProfileRow | null): Form {
  return {
    name: profile?.name ?? "",
    proxyId: profile?.proxy?.id ?? NONE,
    notes: profile?.notes ?? "",
    folderId: profile?.folderId ?? NONE,
    labelId: profile?.labelId ?? NONE,
    tags: profile?.tags.join(", ") ?? "",
  }
}

const orNull = (value: string) => (value === NONE ? null : value)

/** The settings form's state for one profile, or for a new one, and its save. */
function useProfileForm(profile: ProfileRow | null, page: Pick<ProfilesPage, "proxies">) {
  const initial = React.useMemo(() => formFrom(profile), [profile])
  const [form, setForm] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }))

  const nextProxy = page.proxies.find((proxy) => proxy.id === form.proxyId) ?? null
  const nextCountry = nextProxy?.lastTestResult?.country || nextProxy?.country || ""
  const warning = profile && form.proxyId !== initial.proxyId ? countryJumpWarning(profile.lastCountry, nextCountry) : null

  /** Saves the form, answering with the profile's id, or null when it was refused (the toast says why). */
  async function save(): Promise<string | null> {
    setSaving(true)
    try {
      const { id } = await saveProfile(profile?.id ?? null, {
        name: form.name,
        proxyId: orNull(form.proxyId),
        notes: form.notes,
        folderId: orNull(form.folderId),
        labelId: orNull(form.labelId),
        tags: form.tags.split(","),
      })
      return id
    } catch (error) {
      showErrorToast(getProfileErrorMessage(error))
      return null
    } finally {
      setSaving(false)
    }
  }

  return { form, set, dirty, saving, save, warning, nextProxy, reset: () => setForm(initial) }
}

type ProfileForm = ReturnType<typeof useProfileForm>

/**
 * A profile's settings: what it is called and its notes, the proxy it goes
 * out through, and its folder, label and tags. Two things a change of proxy
 * says before it is saved: an open browser keeps the old proxy until it
 * restarts, so Restart it now is offered; and a proxy in another country
 * moves every signed-in account with it, so it warns, without refusing.
 */
function ProfileSettingsFields({
  form: { form, set, warning, nextProxy },
  profile,
  page,
  onRestart,
}: {
  form: ProfileForm
  /** Null for a new one. */
  profile: ProfileRow | null
  page: Pick<ProfilesPage, "proxies" | "folders" | "labels">
  onRestart: (profile: ProfileRow) => Promise<void>
}) {
  const [restarting, setRestarting] = React.useState(false)
  return (
    <div className="grid gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>The profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" value={form.name} placeholder="Main" onChange={(event) => set("name", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-notes">Notes</Label>
            <Textarea id="profile-notes" rows={1} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
          </div>
          {profile?.accounts.length ? (
            <p className="text-sm text-muted-foreground">Signed in inside it: {profile.accounts.map(signedInWords).join(", ")}.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>The proxy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="profile-proxy">Goes out through</Label>
            <Select value={form.proxyId} onValueChange={(value) => set("proxyId", value)}>
              <SelectTrigger id="profile-proxy" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>This computer&apos;s own address</SelectItem>
                {page.proxies.map((proxy) => (
                  <SelectItem key={proxy.id} value={proxy.id}>
                    {proxy.label || proxy.host}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {nextProxy ? <ProxyTestBadge result={nextProxy.lastTestResult} /> : null}
          {warning ? (
            <p role="status" className="text-sm text-destructive">
              {warning}
            </p>
          ) : null}
          {profile?.onOldProxy ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                The open browser is still on the proxy it opened with. It changes when the browser restarts.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={restarting}
                onClick={async () => {
                  setRestarting(true)
                  try {
                    await onRestart(profile)
                  } finally {
                    setRestarting(false)
                  }
                }}
              >
                {restarting ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
                Restart it now
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Sorting</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 @md:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="profile-folder">Folder</Label>
              <Select value={form.folderId} onValueChange={(value) => set("folderId", value)}>
                <SelectTrigger id="profile-folder" className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No folder</SelectItem>
                  {page.folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="profile-label">Label</Label>
              <Select value={form.labelId} onValueChange={(value) => set("labelId", value)}>
                <SelectTrigger id="profile-label" className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No label</SelectItem>
                  {page.labels.map((label) => (
                    <SelectItem key={label.id} value={label.id}>
                      {label.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-tags">Tags, with commas between them</Label>
            <Input id="profile-tags" value={form.tags} placeholder="warm, us-east" onChange={(event) => set("tags", event.target.value)} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * A new browser profile, as a window over the Anti Detect dashboard's
 * Profiles: its settings only, since it has no identity, backups or history
 * yet. A profile that exists opens on the right instead (`ProfileRecord`).
 */
export function ProfileDialog({
  open,
  page,
  onClose,
  onSaved,
}: {
  open: boolean
  page: ProfilesPage
  onClose: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const profileForm = useProfileForm(null, page)
  return (
    <FormDialog open={open} dirty={profileForm.dirty} busy={profileForm.saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>New browser profile</DialogTitle>
            <DialogDescription>
              One isolated browser: its own cookies, its own identity, its own proxy. An account picks one when it is
              added.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault()
              const id = await profileForm.save()
              if (id) await onSaved(id)
            }}
          >
            <DialogBody className="@container">
              <ProfileSettingsFields form={profileForm} profile={null} page={page} onRestart={async () => {}} />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={profileForm.saving} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={profileForm.saving}>
                {profileForm.saving ? <Loader2Icon className="animate-spin" /> : null}
                Create profile
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * Every run of the profile's browser and everything else that happened to it,
 * newest first: when each run opened, how long it lasted, how it ended, and
 * why when there is a reason.
 */
export function ProfileHistory({ profileId }: { profileId: string }) {
  const [state, setState] = React.useState<{
    entries: HistoryEntry[] | null
    error: string | null
  }>({ entries: null, error: null })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadProfileHistory(profileId).then(
      (entries) => {
        if (live) setState({ entries, error: null })
      },
      (error: unknown) => {
        if (live) setState({ entries: null, error: getProfileErrorMessage(error) })
      }
    )
    return () => {
      live = false
    }
  }, [profileId, attempt])

  // The card stays while the history is read, or could not be, as the right panel's other cards do.
  const frame = (children: React.ReactNode, meta?: number) => (
    <PanelCard icon={<HistoryIcon />} storageId="promo-profile-history" title="History" meta={meta}>
      {children}
    </PanelCard>
  )
  if (state.error) return frame(<ErrorRow message={state.error} onRetry={() => setAttempt((count) => count + 1)} />)
  if (!state.entries) return frame(<LoadingRow label="Reading the history" />)
  if (!state.entries.length) return frame(<p className="text-sm text-muted-foreground">This profile&apos;s browser has never been opened.</p>)

  return frame(
    <ol className="grid gap-3">
        {state.entries.map((entry) => (
          <li key={entry.id} className="grid gap-0.5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {entry.kind === "run" ? RUN_ENDINGS[entry.ending] ?? entry.ending : EVENT_WORDS[entry.kind]}
                {entry.kind === "run" && entry.newBuild ? (
                  <span className="font-normal text-muted-foreground"> · First run on a new browser build</span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</span>
            </div>
            {entry.kind === "run" ? (
              <span className="text-xs text-muted-foreground">
                {[
                  entry.endedAt
                    ? `Ran for ${formatDuration(new Date(entry.endedAt).getTime() - new Date(entry.at).getTime())}`
                    : entry.ending === "running" || entry.ending === "opening"
                      ? "Still running"
                      : "",
                  entry.reason,
                ]
                  .filter(Boolean)
                  .join(". ")}
              </span>
            ) : entry.detail ? (
              <span className="text-xs text-muted-foreground">{entry.detail}</span>
            ) : null}
          </li>
        ))}
    </ol>,
    state.entries.length
  )
}
