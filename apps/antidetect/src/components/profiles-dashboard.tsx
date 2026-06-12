import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  AppWindowIcon,
  ChevronDownIcon,
  CopyIcon,
  FolderIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  bulkAddProfileTag,
  bulkDeleteProfiles,
  bulkMoveProfiles,
  bulkSetProfileStatus,
  createFolder,
  createProfile,
  createStatus,
  deleteProfile,
  duplicateProfile,
  getProfileErrorMessage,
  previewFingerprint,
  updateProfile,
  type Fingerprint,
  type FolderItem,
  type ProfileItem,
  type StatusItem,
} from "@/lib/api/profiles"
import type { ProxyItem } from "@/lib/api/proxies"
import { cn } from "@/lib/utils"

// Picker sentinels (a Select value can't be null).
const NO_PROXY = "none"
const NO_FOLDER = "none"
const NO_STATUS = "none"
// Filter sentinels.
const ALL = "all"
const UNSET = "unset"

type ProfileForm = {
  name: string
  engine: ProfileItem["engine"]
  os: ProfileItem["os"]
  proxyId: string
  folderId: string
  statusId: string
  tags: string[]
  notes: string
}

const defaultForm: ProfileForm = {
  name: "",
  engine: "camoufox",
  os: "windows",
  proxyId: NO_PROXY,
  folderId: NO_FOLDER,
  statusId: NO_STATUS,
  tags: [],
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

// Literal class strings per status color token (dynamic names can't be JIT'd).
const statusChipClasses: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/15 text-red-700 dark:text-red-400",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  pink: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  cyan: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  slate: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
}
const statusDotClasses: Record<string, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
  cyan: "bg-cyan-500",
  slate: "bg-slate-500",
}

export function ProfilesDashboard({
  initialProfiles: profiles,
  initialProxies: proxies,
  initialFolders: folders,
  initialStatuses: statuses,
}: {
  initialProfiles: ProfileItem[]
  initialProxies: ProxyItem[]
  initialFolders: FolderItem[]
  initialStatuses: StatusItem[]
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
  // Live fingerprint preview for the dialog (the seed lives inside the object).
  const [fingerprint, setFingerprint] = React.useState<Fingerprint | null>(null)
  const [fpLoading, setFpLoading] = React.useState(false)
  // Organization: selection, filters, per-row + bulk busy, inline create prompt.
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [search, setSearch] = React.useState("")
  const [filterFolder, setFilterFolder] = React.useState(ALL)
  const [filterStatus, setFilterStatus] = React.useState(ALL)
  const [filterTag, setFilterTag] = React.useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [actingId, setActingId] = React.useState<string | null>(null)
  const [prompt, setPrompt] = React.useState<
    "folder" | "status" | "tag" | null
  >(null)
  const [promptValue, setPromptValue] = React.useState("")
  const [promptBusy, setPromptBusy] = React.useState(false)

  const proxyLabels = React.useMemo(
    () => new Map(proxies.map((proxy) => [proxy.id, proxy.label])),
    [proxies]
  )
  const folderMap = React.useMemo(
    () => new Map(folders.map((f) => [f.id, f.name])),
    [folders]
  )
  const statusMap = React.useMemo(
    () => new Map(statuses.map((s) => [s.id, s])),
    [statuses]
  )

  // Client-side search + filtering over the loaded list.
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return profiles.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (filterFolder === UNSET && p.folderId) return false
      if (filterFolder !== ALL && filterFolder !== UNSET && p.folderId !== filterFolder)
        return false
      if (filterStatus === UNSET && p.statusId) return false
      if (filterStatus !== ALL && filterStatus !== UNSET && p.statusId !== filterStatus)
        return false
      if (filterTag && !p.tags.includes(filterTag)) return false
      return true
    })
  }, [profiles, search, filterFolder, filterStatus, filterTag])

  const filteredIds = filtered.map((p) => p.id)
  const allSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))
  const someSelected = filteredIds.some((id) => selected.has(id))
  const headerChecked: boolean | "indeterminate" = allSelected
    ? true
    : someSelected
      ? "indeterminate"
      : false

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) filteredIds.forEach((id) => next.delete(id))
      else filteredIds.forEach((id) => next.add(id))
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  // --- Fingerprint preview (from Workstream B) ---

  async function refreshFingerprint(next: {
    os: ProfileItem["os"]
    engine: ProfileItem["engine"]
    proxyId: string
    seed?: number
  }) {
    setFpLoading(true)
    try {
      const fp = await previewFingerprint({
        os: next.os,
        engine: next.engine,
        proxyId: next.proxyId === NO_PROXY ? null : next.proxyId,
        seed: next.seed,
      })
      setFingerprint(fp)
    } catch {
      // Non-fatal — keep showing the previous preview.
    } finally {
      setFpLoading(false)
    }
  }

  // --- Create / edit / delete ---

  function openCreateForm() {
    setEditing(null)
    setForm(defaultForm)
    setError(null)
    setFingerprint(null)
    setFormOpen(true)
    void refreshFingerprint({
      os: defaultForm.os,
      engine: defaultForm.engine,
      proxyId: defaultForm.proxyId,
    })
  }

  function openEditForm(profile: ProfileItem) {
    setEditing(profile)
    setForm({
      name: profile.name,
      engine: profile.engine,
      os: profile.os,
      proxyId: profile.proxyId ?? NO_PROXY,
      folderId: profile.folderId ?? NO_FOLDER,
      statusId: profile.statusId ?? NO_STATUS,
      tags: profile.tags,
      notes: profile.notes ?? "",
    })
    setError(null)
    setFingerprint(profile.fingerprint)
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
        folderId: form.folderId === NO_FOLDER ? null : form.folderId,
        statusId: form.statusId === NO_STATUS ? null : form.statusId,
        tags: form.tags,
        notes: form.notes.trim() || undefined,
        fingerprintSeed: fingerprint?.seed,
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

  async function duplicate(profile: ProfileItem) {
    setActingId(profile.id)
    setError(null)
    try {
      await duplicateProfile(profile.id)
      await router.invalidate()
    } catch (err) {
      setError(getProfileErrorMessage(err))
    } finally {
      setActingId(null)
    }
  }

  function launch(profile: ProfileItem) {
    setLaunchNotice(
      `"${profile.name}" is ready. Launching the streamed browser is the next phase — the engine is proven (docker/phase0), the orchestrator that starts a container per profile lands in Phase 2.`
    )
  }

  // --- Bulk actions ---

  async function runBulk(action: () => Promise<unknown>) {
    setBulkBusy(true)
    setError(null)
    try {
      await action()
      await router.invalidate()
      clearSelection()
    } catch (err) {
      setError(getProfileErrorMessage(err))
    } finally {
      setBulkBusy(false)
    }
  }

  const selectedIds = () => [...selected]

  // --- Inline create (folder / status / bulk tag) ---

  function openPrompt(kind: "folder" | "status" | "tag") {
    setPromptValue("")
    setError(null)
    setPrompt(kind)
  }

  async function submitPrompt() {
    const value = promptValue.trim()
    if (!value || !prompt) return
    setPromptBusy(true)
    setError(null)
    try {
      if (prompt === "folder") await createFolder(value)
      else if (prompt === "status") await createStatus(value)
      else await bulkAddProfileTag(selectedIds(), value)
      await router.invalidate()
      if (prompt === "tag") clearSelection()
      setPrompt(null)
      setPromptValue("")
    } catch (err) {
      setError(getProfileErrorMessage(err))
    } finally {
      setPromptBusy(false)
    }
  }

  const hasFilters =
    search.trim() !== "" ||
    filterFolder !== ALL ||
    filterStatus !== ALL ||
    filterTag !== null

  return (
    <div className="w-full pb-8">
      {error ? <Message tone="error">{error}</Message> : null}
      {launchNotice ? <Message tone="info">{launchNotice}</Message> : null}

      {/* Bulk action bar — appears once rows are selected. */}
      {selected.size > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={bulkBusy}>
                <FolderIcon className="size-4" />
                Move
                <ChevronDownIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() =>
                  void runBulk(() => bulkMoveProfiles(selectedIds(), null))
                }
              >
                Ungrouped
              </DropdownMenuItem>
              {folders.length ? <DropdownMenuSeparator /> : null}
              {folders.map((folder) => (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={() =>
                    void runBulk(() =>
                      bulkMoveProfiles(selectedIds(), folder.id)
                    )
                  }
                >
                  {folder.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openPrompt("folder")}>
                <PlusIcon className="size-4" />
                New folder…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={bulkBusy}>
                Status
                <ChevronDownIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() =>
                  void runBulk(() => bulkSetProfileStatus(selectedIds(), null))
                }
              >
                Clear status
              </DropdownMenuItem>
              {statuses.length ? <DropdownMenuSeparator /> : null}
              {statuses.map((status) => (
                <DropdownMenuItem
                  key={status.id}
                  onClick={() =>
                    void runBulk(() =>
                      bulkSetProfileStatus(selectedIds(), status.id)
                    )
                  }
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      statusDotClasses[status.color] ?? statusDotClasses.slate
                    )}
                  />
                  {status.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openPrompt("status")}>
                <PlusIcon className="size-4" />
                New status…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={bulkBusy}
            onClick={() => openPrompt("tag")}
          >
            <TagIcon className="size-4" />
            Add tag
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={bulkBusy}
            className="text-destructive hover:text-destructive"
            onClick={() =>
              void runBulk(() => bulkDeleteProfiles(selectedIds()))
            }
          >
            <Trash2Icon className="size-4" />
            Delete
          </Button>

          {bulkBusy ? (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={clearSelection}
          >
            Clear
          </Button>
        </div>
      ) : null}

      {/* Active tag filter pill. */}
      {filterTag ? (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered by tag:</span>
          <Badge variant="secondary" className="gap-1">
            #{filterTag}
            <button
              type="button"
              onClick={() => setFilterTag(null)}
              aria-label="Clear tag filter"
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        </div>
      ) : null}

      <DashboardTable
        title="Profiles"
        icon={
          <AppWindowIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={profiles.length}
        selectedCount={selected.size}
        onClearSelection={clearSelection}
        controls={
          <>
            <DashboardToolbarSearch
              value={search}
              placeholder="Search profiles…"
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={filterFolder} onValueChange={setFilterFolder}>
              <DashboardToolbarSelectTrigger>
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All folders</SelectItem>
                <SelectItem value={UNSET}>Ungrouped</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <DashboardToolbarSelectTrigger>
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value={UNSET}>No status</SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {status.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton type="button" onClick={openCreateForm}>
              <PlusIcon className="size-4" />
              Add Profile
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={headerChecked}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                  Profile
                </div>
              </TableHead>
              <TableHead column="meta">Proxy</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={filtered.length === 0}
        emptyText={
          hasFilters
            ? "No profiles match the filters."
            : "No profiles yet. Add one to get started."
        }
        emptyColSpan={4}
        footer={{ type: "summary", count: filtered.length, label: "profiles" }}
      >
        {filtered.map((profile) => {
          const status = statusMeta[profile.status]
          const workflow = profile.statusId
            ? statusMap.get(profile.statusId)
            : undefined
          const folderName = profile.folderId
            ? folderMap.get(profile.folderId)
            : undefined
          const checked = selected.has(profile.id)
          return (
            <TableRow key={profile.id} data-state={checked ? "selected" : undefined}>
              <TableCell column="main">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleOne(profile.id)}
                    aria-label={`Select ${profile.name}`}
                    className="mt-2.5"
                  />
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <AppWindowIcon className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{profile.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {engineLabels[profile.engine]} · {osLabels[profile.os]}
                      {folderName ? ` · ${folderName}` : ""}
                    </div>
                    {workflow || profile.tags.length ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {workflow ? (
                          <StatusChip
                            name={workflow.name}
                            color={workflow.color}
                          />
                        ) : null}
                        {profile.tags.map((tag) => (
                          <TagChip
                            key={tag}
                            tag={tag}
                            onClick={() => setFilterTag(tag)}
                          />
                        ))}
                      </div>
                    ) : null}
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
                    disabled={actingId === profile.id}
                    onClick={() => void duplicate(profile)}
                    aria-label={`Duplicate ${profile.name}`}
                    title={`Duplicate ${profile.name}`}
                  >
                    {actingId === profile.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <CopyIcon className="size-4" />
                    )}
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
                onValueChange={(value) => {
                  const engine = value as ProfileItem["engine"]
                  setForm({ ...form, engine })
                  void refreshFingerprint({
                    os: form.os,
                    engine,
                    proxyId: form.proxyId,
                    seed: fingerprint?.seed,
                  })
                }}
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
                onValueChange={(value) => {
                  const os = value as ProfileItem["os"]
                  setForm({ ...form, os })
                  void refreshFingerprint({
                    os,
                    engine: form.engine,
                    proxyId: form.proxyId,
                    seed: fingerprint?.seed,
                  })
                }}
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
                onValueChange={(value) => {
                  setForm({ ...form, proxyId: value })
                  void refreshFingerprint({
                    os: form.os,
                    engine: form.engine,
                    proxyId: value,
                    seed: fingerprint?.seed,
                  })
                }}
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
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-folder">Folder</Label>
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => openPrompt("folder")}
                >
                  + New
                </button>
              </div>
              <Select
                value={form.folderId}
                disabled={busy}
                onValueChange={(value) => setForm({ ...form, folderId: value })}
              >
                <SelectTrigger id="profile-folder" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FOLDER}>Ungrouped</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-status">Status</Label>
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => openPrompt("status")}
                >
                  + New
                </button>
              </div>
              <Select
                value={form.statusId}
                disabled={busy}
                onValueChange={(value) => setForm({ ...form, statusId: value })}
              >
                <SelectTrigger id="profile-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STATUS}>No status</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Tags</Label>
              <TagsInput
                value={form.tags}
                disabled={busy}
                onChange={(tags) => setForm({ ...form, tags })}
              />
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
            <div className="grid gap-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Fingerprint</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || fpLoading}
                  onClick={() =>
                    void refreshFingerprint({
                      os: form.os,
                      engine: form.engine,
                      proxyId: form.proxyId,
                    })
                  }
                >
                  <RefreshCwIcon
                    className={cn("size-3.5", fpLoading && "animate-spin")}
                  />
                  Regenerate
                </Button>
              </div>
              <FingerprintSummary fingerprint={fingerprint} loading={fpLoading} />
              <p className="text-xs text-muted-foreground">
                Auto-generated and matched to the proxy&rsquo;s location.
                Regenerate for a fresh identity.
              </p>
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

      {/* Inline create / bulk-tag prompt. */}
      <Dialog
        open={prompt !== null}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {prompt === "folder"
                ? "New Folder"
                : prompt === "status"
                  ? "New Status"
                  : "Add Tag"}
            </DialogTitle>
            <DialogDescription>
              {prompt === "tag"
                ? `Add a tag to ${selected.size} selected profile${selected.size === 1 ? "" : "s"}.`
                : "Pick a short, memorable name."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              autoFocus
              value={promptValue}
              disabled={promptBusy}
              placeholder={
                prompt === "folder"
                  ? "e.g. TikTok accounts"
                  : prompt === "status"
                    ? "e.g. Verifying"
                    : "e.g. warming"
              }
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void submitPrompt()
                }
              }}
            />
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={promptBusy}
                onClick={() => setPrompt(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={promptBusy || !promptValue.trim()}
                onClick={() => void submitPrompt()}
              >
                {promptBusy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                {prompt === "tag" ? "Add" : "Create"}
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

// A workflow-status chip (colored dot + name).
function StatusChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        statusChipClasses[color] ?? statusChipClasses.slate
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          statusDotClasses[color] ?? statusDotClasses.slate
        )}
      />
      {name}
    </span>
  )
}

// A tag chip; clicking it filters the table by that tag.
function TagChip({ tag, onClick }: { tag: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
    >
      #{tag}
    </button>
  )
}

// Chip-style tags editor: Enter/comma adds, backspace removes the last, ✕ removes
// one. Trimming only happens on commit so spaces can be typed mid-tag.
function TagsInput({
  value,
  disabled,
  onChange,
}: {
  value: string[]
  disabled?: boolean
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = React.useState("")

  function commit(raw: string) {
    const tag = raw.trim().slice(0, 50)
    setDraft("")
    if (!tag || value.length >= 20) return
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return
    onChange([...value, tag])
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border border-input p-2",
        disabled && "opacity-50"
      )}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            aria-label={`Remove ${tag}`}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        className="min-w-[100px] flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        value={draft}
        disabled={disabled}
        placeholder={value.length ? "" : "Add tags…"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            commit(draft)
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => commit(draft)}
      />
    </div>
  )
}

// Compact read-out of the generated fingerprint shown in the profile dialog.
function FingerprintSummary({
  fingerprint,
  loading,
}: {
  fingerprint: Fingerprint | null
  loading: boolean
}) {
  if (!fingerprint) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border bg-muted/40 text-xs text-muted-foreground">
        {loading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2Icon className="size-3.5 animate-spin" />
            Generating…
          </span>
        ) : (
          "No fingerprint yet"
        )}
      </div>
    )
  }
  const fp = fingerprint
  return (
    <div
      className={cn(
        "rounded-md border bg-muted/40 p-3 text-xs transition-opacity",
        loading && "opacity-60"
      )}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Field label="Browser" value={fp.browser} />
        <Field
          label="Screen"
          value={`${fp.screen.width}×${fp.screen.height} @${fp.screen.pixelRatio}x`}
        />
        <Field label="Timezone" value={fp.timezone} />
        <Field label="Language" value={fp.locale} />
        <Field
          label="Hardware"
          value={`${fp.hardwareConcurrency} cores · ${fp.deviceMemory} GB`}
        />
        <Field label="WebGL" value={fp.webgl.renderer} />
      </div>
      <div className="mt-2 border-t pt-2">
        <Field label="User agent" value={fp.userAgent} mono />
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className={cn("truncate", mono && "font-mono")} title={value}>
        {value}
      </div>
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
