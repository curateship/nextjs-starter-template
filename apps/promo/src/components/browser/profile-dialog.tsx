import * as React from "react"
import { Loader2Icon, RotateCwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ProfileBackupsPanel } from "@/components/browser/profile-backups-panel"
import { ProfileIdentityPanel } from "@/components/browser/profile-identity-panel"
import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

/**
 * One browser profile, as a window over the list, with its settings and its
 * history. A new profile has only the settings, because it has no history yet.
 *
 * Two things a change of proxy says before it is saved. An open browser keeps
 * the old proxy until it restarts, so the window offers the restart. And a
 * proxy in another country moves every signed-in account with it, so the
 * window warns, without refusing.
 */
export function ProfileDialog({
  open,
  profile,
  page,
  onRestart,
  onDelete,
  onClose,
  onSaved,
  onChanged,
}: {
  open: boolean
  /** Null to make a new one. */
  profile: ProfileRow | null
  page: ProfilesPage
  onRestart: (profile: ProfileRow) => Promise<void>
  onDelete: (profile: ProfileRow) => void
  onClose: () => void
  onSaved: (id: string) => Promise<void>
  /** The record behind the window changed without a save: a check, a new identity. */
  onChanged: () => Promise<void>
}) {
  const initial = React.useMemo(() => formFrom(profile), [profile])
  const [form, setForm] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const [restarting, setRestarting] = React.useState(false)
  const [tab, setTab] = React.useState<"settings" | "identity" | "backups" | "history">("settings")
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const nextProxy = page.proxies.find((proxy) => proxy.id === form.proxyId) ?? null
  const nextCountry = nextProxy?.lastTestResult?.country || nextProxy?.country || ""
  const warning =
    profile && form.proxyId !== initial.proxyId
      ? countryJumpWarning(profile.lastCountry, nextCountry)
      : null

  async function save() {
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
      toast.success(profile ? "Profile saved." : "Profile created.")
      await onSaved(id)
    } catch (error) {
      showErrorToast(getProfileErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="h-[48rem]">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "settings" | "identity" | "backups" | "history")}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <DialogTitle>{profile ? profile.name : "New browser profile"}</DialogTitle>
                {profile ? (
                  <TabsList>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                    <TabsTrigger value="identity">Identity</TabsTrigger>
                    <TabsTrigger value="backups">Backups</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>
                ) : null}
              </div>
              <DialogDescription>
                One isolated browser: its own cookies, its own identity, its own
                proxy. A Reddit account picks one in Settings.
              </DialogDescription>
            </DialogHeader>

            <form
              id="profile-form"
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <DialogBody>
                <TabsContent value="settings" className="min-w-0" forceMount hidden={tab !== "settings"}>
                  <div className="grid gap-6">
                    <Card size="sm">
                      <CardHeader>
                        <CardTitle>The profile</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="profile-name">Name</Label>
                          <Input
                            id="profile-name"
                            value={form.name}
                            placeholder="Main"
                            onChange={(event) => set("name", event.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="profile-notes">Notes</Label>
                          <Textarea
                            id="profile-notes"
                            rows={1}
                            value={form.notes}
                            onChange={(event) => set("notes", event.target.value)}
                          />
                        </div>
                        {profile?.accounts.length ? (
                          <p className="text-sm text-muted-foreground">
                            Signed in inside it: {profile.accounts.map(signedInWords).join(", ")}.
                          </p>
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
                            <SelectTrigger id="profile-proxy" className="w-full sm:w-fit sm:min-w-64">
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
                              The open browser is still on the proxy it opened with. It
                              changes when the browser restarts.
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
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor="profile-folder">Folder</Label>
                            <Select value={form.folderId} onValueChange={(value) => set("folderId", value)}>
                              <SelectTrigger id="profile-folder" className="w-full">
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
                          <div className="grid gap-2">
                            <Label htmlFor="profile-label">Label</Label>
                            <Select value={form.labelId} onValueChange={(value) => set("labelId", value)}>
                              <SelectTrigger id="profile-label" className="w-full">
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
                          <Input
                            id="profile-tags"
                            value={form.tags}
                            placeholder="warm, us-east"
                            onChange={(event) => set("tags", event.target.value)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                {profile ? (
                  <TabsContent value="identity" className="min-w-0">
                    <ProfileIdentityPanel profile={profile} onChanged={onChanged} />
                  </TabsContent>
                ) : null}
                {profile ? (
                  <TabsContent value="backups" className="min-w-0">
                    {tab === "backups" ? <ProfileBackupsPanel profile={profile} onChanged={onChanged} /> : null}
                  </TabsContent>
                ) : null}
                {profile ? (
                  <TabsContent value="history" className="min-w-0">
                    {tab === "history" ? <ProfileHistory profileId={profile.id} /> : null}
                  </TabsContent>
                ) : null}
              </DialogBody>
            </form>

            <DialogFooter>
              {profile ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={saving}
                  onClick={() => onDelete(profile)}
                >
                  <Trash2Icon />
                  Delete
                </Button>
              ) : null}
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" form="profile-form" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {profile ? "Save changes" : "Create profile"}
              </Button>
            </DialogFooter>
          </Tabs>
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
function ProfileHistory({ profileId }: { profileId: string }) {
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

  if (state.error) {
    return <ErrorRow message={state.error} onRetry={() => setAttempt((count) => count + 1)} />
  }
  if (!state.entries) return <LoadingRow label="Reading the history" className="min-h-48" />
  if (!state.entries.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">This profile&apos;s browser has never been opened.</p>
  }

  return (
    <Card size="sm">
      <CardContent className="grid gap-0 divide-y p-0">
        {state.entries.map((entry) => (
          <div key={entry.id} className="grid gap-1 px-4 py-3 text-sm">
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
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
