import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  AppWindowIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  createProfile,
  deleteProfile,
  getProfileErrorMessage,
  updateProfile,
  type ProfileItem,
} from "@/lib/api/profiles"
import type { ProxyItem } from "@/lib/api/proxies"

// "none" is the picker sentinel for "no proxy" (a Select value can't be null).
type ProfileForm = {
  name: string
  engine: ProfileItem["engine"]
  os: ProfileItem["os"]
  proxyId: string
  notes: string
}

const NO_PROXY = "none"

const defaultForm: ProfileForm = {
  name: "",
  engine: "camoufox",
  os: "windows",
  proxyId: NO_PROXY,
  notes: "",
}

const engineLabels: Record<ProfileItem["engine"], string> = {
  camoufox: "Camoufox · Firefox",
  chromium: "itbrowser · Chromium",
}

const osLabels: Record<ProfileItem["os"], string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
}

const statusMeta: Record<
  ProfileItem["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  stopped: { label: "Stopped", variant: "secondary" },
  starting: { label: "Starting", variant: "outline" },
  running: { label: "Running", variant: "default" },
  error: { label: "Error", variant: "destructive" },
}

export function ProfilesDashboard({
  initialProfiles: profiles,
  initialProxies: proxies,
}: {
  initialProfiles: ProfileItem[]
  initialProxies: ProxyItem[]
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<ProfileItem | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<ProfileForm>(defaultForm)
  const [pendingDelete, setPendingDelete] = React.useState<ProfileItem | null>(
    null
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [launchNotice, setLaunchNotice] = React.useState<string | null>(null)

  const proxyLabels = React.useMemo(
    () => new Map(proxies.map((proxy) => [proxy.id, proxy.label])),
    [proxies]
  )

  function openCreateForm() {
    setEditing(null)
    setForm(defaultForm)
    setError(null)
    setFormOpen(true)
  }

  function openEditForm(profile: ProfileItem) {
    setEditing(profile)
    setForm({
      name: profile.name,
      engine: profile.engine,
      os: profile.os,
      proxyId: profile.proxyId ?? NO_PROXY,
      notes: profile.notes ?? "",
    })
    setError(null)
    setFormOpen(true)
  }

  async function saveProfile() {
    const name = form.name.trim()
    if (!name) return setError("Profile name is required")

    setBusy(true)
    setError(null)
    try {
      const input = {
        name,
        engine: form.engine,
        os: form.os,
        proxyId: form.proxyId === NO_PROXY ? null : form.proxyId,
        notes: form.notes.trim() || undefined,
      }
      if (editing) {
        await updateProfile(editing.id, input)
      } else {
        await createProfile(input)
      }
      await router.invalidate()
      setFormOpen(false)
      setEditing(null)
    } catch (err) {
      setError(getProfileErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    setError(null)
    try {
      await deleteProfile(pendingDelete.id)
      await router.invalidate()
      setPendingDelete(null)
    } catch (err) {
      setError(getProfileErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function launch(profile: ProfileItem) {
    // The streamed browser engine (proven in Phase 0) is wired in the next phase.
    setLaunchNotice(
      `"${profile.name}" is ready. Launching the streamed browser is the next phase — the engine is proven (docker/phase0), the orchestrator that starts a container per profile lands in Phase 2.`
    )
  }

  return (
    <div className="w-full pb-8">
      {error ? <Message tone="error">{error}</Message> : null}
      {launchNotice ? <Message tone="info">{launchNotice}</Message> : null}

      <DashboardTable
        title="Profiles"
        icon={
          <AppWindowIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={profiles.length}
        controls={
          <DashboardToolbarButton type="button" onClick={openCreateForm}>
            <PlusIcon className="size-4" />
            Add Profile
          </DashboardToolbarButton>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Profile</TableHead>
              <TableHead column="meta">Proxy</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={profiles.length === 0}
        emptyText="No profiles yet. Add one to get started."
        emptyColSpan={4}
        footer={{ type: "summary", count: profiles.length, label: "profiles" }}
      >
        {profiles.map((profile) => {
          const status = statusMeta[profile.status]
          return (
            <TableRow key={profile.id}>
              <TableCell column="main">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <AppWindowIcon className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{profile.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {engineLabels[profile.engine]} · {osLabels[profile.os]}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell column="meta">
                {profile.proxyId && proxyLabels.has(profile.proxyId) ? (
                  <span className="text-sm">
                    {proxyLabels.get(profile.proxyId)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">No proxy</span>
                )}
              </TableCell>
              <TableCell column="meta">
                <Badge variant={status.variant}>{status.label}</Badge>
              </TableCell>
              <TableCell column="meta">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => launch(profile)}
                    aria-label={`Launch ${profile.name}`}
                    title={`Launch ${profile.name}`}
                  >
                    <PlayIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEditForm(profile)}
                    aria-label={`Edit ${profile.name}`}
                    title={`Edit ${profile.name}`}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPendingDelete(profile)}
                    aria-label={`Delete ${profile.name}`}
                    title={`Delete ${profile.name}`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Profile" : "Add Profile"}</DialogTitle>
            <DialogDescription>
              Each profile is an isolated browser with its own fingerprint and
              proxy.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={form.name}
                disabled={busy}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-engine">Engine</Label>
              <Select
                value={form.engine}
                disabled={busy}
                onValueChange={(value) =>
                  setForm({ ...form, engine: value as ProfileItem["engine"] })
                }
              >
                <SelectTrigger id="profile-engine" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(engineLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-os">Fingerprint OS</Label>
              <Select
                value={form.os}
                disabled={busy}
                onValueChange={(value) =>
                  setForm({ ...form, os: value as ProfileItem["os"] })
                }
              >
                <SelectTrigger id="profile-os" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(osLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="profile-proxy">Proxy</Label>
              <Select
                value={form.proxyId}
                disabled={busy}
                onValueChange={(value) => setForm({ ...form, proxyId: value })}
              >
                <SelectTrigger id="profile-proxy" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROXY}>No proxy</SelectItem>
                  {proxies.map((proxy) => (
                    <SelectItem key={proxy.id} value={proxy.id}>
                      {proxy.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {proxies.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No proxies yet — add one on the Proxies page to assign it here.
                </p>
              ) : null}
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="profile-notes">Notes</Label>
              <Textarea
                id="profile-notes"
                value={form.notes}
                disabled={busy}
                rows={3}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void saveProfile()}
              >
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {busy ? "Saving..." : "Save"}
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
            <DialogDescription>
              This permanently deletes the profile.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Delete{" "}
              <span className="font-medium">
                {pendingDelete?.name ?? "this profile"}
              </span>
              ?
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                Delete
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Message({
  tone,
  children,
}: {
  tone: "error" | "info"
  children: React.ReactNode
}) {
  const styles =
    tone === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-border bg-muted/60 text-foreground"
  return (
    <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  )
}
