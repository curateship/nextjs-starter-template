import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  GlobeIcon,
  Loader2Icon,
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
import {
  createProxy,
  deleteProxy,
  getProxyErrorMessage,
  updateProxy,
  type ProxyItem,
} from "@/lib/api/proxies"

// Port lives as a string in the form so the input can be empty mid-typing.
type ProxyForm = {
  label: string
  type: ProxyItem["type"]
  host: string
  port: string
  username: string
  password: string
  country: string
}

const emptyForm: ProxyForm = {
  label: "",
  type: "residential",
  host: "",
  port: "",
  username: "",
  password: "",
  country: "",
}

const typeLabels: Record<ProxyItem["type"], string> = {
  residential: "Residential",
  mobile: "Mobile",
  datacenter: "Datacenter",
}

export function ProxiesDashboard({
  initialProxies: proxies,
}: {
  initialProxies: ProxyItem[]
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<ProxyItem | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<ProxyForm>(emptyForm)
  const [pendingDelete, setPendingDelete] = React.useState<ProxyItem | null>(
    null
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function openCreateForm() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setFormOpen(true)
  }

  function openEditForm(proxy: ProxyItem) {
    setEditing(proxy)
    // Password is never sent to the client, so it starts blank on edit.
    setForm({
      label: proxy.label,
      type: proxy.type,
      host: proxy.host,
      port: String(proxy.port),
      username: proxy.username ?? "",
      password: "",
      country: proxy.country ?? "",
    })
    setError(null)
    setFormOpen(true)
  }

  async function saveProxy() {
    const label = form.label.trim()
    const host = form.host.trim()
    const port = Number.parseInt(form.port, 10)
    if (!label) return setError("Proxy label is required")
    if (!host) return setError("Proxy host is required")
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return setError("Proxy port must be between 1 and 65535")
    }

    setBusy(true)
    setError(null)
    try {
      const input = {
        label,
        type: form.type,
        host,
        port,
        username: form.username.trim() || undefined,
        password: form.password || undefined,
        country: form.country.trim() || undefined,
      }
      if (editing) {
        await updateProxy(editing.id, input)
      } else {
        await createProxy(input)
      }
      await router.invalidate()
      setFormOpen(false)
      setEditing(null)
    } catch (err) {
      setError(getProxyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    setError(null)
    try {
      await deleteProxy(pendingDelete.id)
      await router.invalidate()
      setPendingDelete(null)
    } catch (err) {
      setError(getProxyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full pb-8">
      {error ? <Message>{error}</Message> : null}

      <DashboardTable
        title="Proxies"
        icon={<GlobeIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={proxies.length}
        controls={
          <DashboardToolbarButton type="button" onClick={openCreateForm}>
            <PlusIcon className="size-4" />
            Add Proxy
          </DashboardToolbarButton>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Proxy</TableHead>
              <TableHead column="meta">Endpoint</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={proxies.length === 0}
        emptyText="No proxies yet. Add one so profiles can route through it."
        emptyColSpan={3}
        footer={{ type: "summary", count: proxies.length, label: "proxies" }}
      >
        {proxies.map((proxy) => (
          <TableRow key={proxy.id}>
            <TableCell column="main">
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <GlobeIcon className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{proxy.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {typeLabels[proxy.type]}
                    {proxy.country ? ` · ${proxy.country}` : ""}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell column="meta">
              <span className="font-mono text-xs text-muted-foreground">
                {proxy.host}:{proxy.port}
              </span>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEditForm(proxy)}
                  aria-label={`Edit ${proxy.label}`}
                  title={`Edit ${proxy.label}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPendingDelete(proxy)}
                  aria-label={`Delete ${proxy.label}`}
                  title={`Delete ${proxy.label}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Proxy" : "Add Proxy"}</DialogTitle>
            <DialogDescription>
              Profiles route their traffic through the proxy you assign.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="proxy-label">Label</Label>
              <Input
                id="proxy-label"
                value={form.label}
                disabled={busy}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-type">Type</Label>
              <Select
                value={form.type}
                disabled={busy}
                onValueChange={(value) =>
                  setForm({ ...form, type: value as ProxyItem["type"] })
                }
              >
                <SelectTrigger id="proxy-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-host">Host</Label>
              <Input
                id="proxy-host"
                value={form.host}
                disabled={busy}
                placeholder="proxy.example.com"
                onChange={(e) => setForm({ ...form, host: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-port">Port</Label>
              <Input
                id="proxy-port"
                type="number"
                value={form.port}
                disabled={busy}
                placeholder="8080"
                onChange={(e) => setForm({ ...form, port: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-username">Username</Label>
              <Input
                id="proxy-username"
                value={form.username}
                disabled={busy}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-password">Password</Label>
              <Input
                id="proxy-password"
                type="password"
                value={form.password}
                disabled={busy}
                placeholder={editing ? "Leave blank to keep current" : undefined}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-country">Country (ISO-2)</Label>
              <Input
                id="proxy-country"
                value={form.country}
                disabled={busy}
                placeholder="US"
                onChange={(e) => setForm({ ...form, country: e.target.value })}
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
              <Button type="button" disabled={busy} onClick={() => void saveProxy()}>
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
            <DialogTitle>Delete Proxy</DialogTitle>
            <DialogDescription>
              Profiles using this proxy will be left without one.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Delete{" "}
              <span className="font-medium">
                {pendingDelete?.label ?? "this proxy"}
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

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  )
}
