import * as React from "react"
import {
  DownloadIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  Trash2Icon,
  WifiIcon,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardSelectedActionButton,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
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
  createProxy,
  deleteProxy,
  deleteProxies,
  getProxyErrorMessage,
  importProxies,
  listProxies,
  testProxy,
  toggleProxy,
  updateProxy,
  type ProxyConnectionType,
  type ProxyImportLineError,
  type ProxyItem,
  type ProxyProtocol,
  type ProxyStatus,
} from "@/lib/api/proxies"
import { cn } from "@/lib/utils"

type ProxyFormState = {
  name: string
  protocol: ProxyProtocol
  host: string
  port: string
  username: string
  password: string
  connectionType: ProxyConnectionType | "none"
  country: string
  enabled: boolean
}

type ProxyImportState = {
  lines: string
  protocol: ProxyProtocol
  enabled: boolean
}

const emptyProxyForm: ProxyFormState = {
  name: "",
  protocol: "http",
  host: "",
  port: "",
  username: "",
  password: "",
  connectionType: "none",
  country: "",
  enabled: true,
}

const emptyImportForm: ProxyImportState = {
  lines: "",
  protocol: "http",
  enabled: true,
}

const statusLabels: Record<ProxyStatus, string> = {
  untested: "Untested",
  online: "Online",
  offline: "Offline",
}

const connectionTypeLabels: Record<ProxyConnectionType, string> = {
  residential: "Residential",
  mobile: "Mobile",
  datacenter: "Datacenter",
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function ProxiesDashboard({
  initialProxies,
}: {
  initialProxies: ProxyItem[]
}) {
  const [proxies, setProxies] = React.useState<ProxyItem[]>(initialProxies)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<ProxyStatus | "all">("all")
  const [typeFilter, setTypeFilter] = React.useState<ProxyConnectionType | "all" | "unset">("all")
  const [countryFilter, setCountryFilter] = React.useState("all")
  const [editingProxy, setEditingProxy] = React.useState<ProxyItem | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<ProxyFormState>(emptyProxyForm)
  const [saving, setSaving] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [importForm, setImportForm] = React.useState<ProxyImportState>(emptyImportForm)
  const [importing, setImporting] = React.useState(false)
  const [importErrors, setImportErrors] = React.useState<ProxyImportLineError[]>([])
  const [testingIds, setTestingIds] = React.useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = React.useState<ProxyItem | null>(null)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)

  const loadCurrentProxies = React.useCallback(async () => {
    setError(null)
    try {
      const result = await listProxies()
      setProxies(result.proxies)
    } catch (loadError) {
      setError(getProxyErrorMessage(loadError))
    }
  }, [])

  const countries = React.useMemo(
    () =>
      Array.from(
        new Set(proxies.map((proxy) => proxy.country).filter(Boolean))
      ).sort() as string[],
    [proxies]
  )

  const visibleProxies = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return proxies.filter((proxy) => {
      if (statusFilter !== "all" && proxy.last_status !== statusFilter) {
        return false
      }
      if (typeFilter === "unset" && proxy.connection_type) {
        return false
      }
      if (
        typeFilter !== "all" &&
        typeFilter !== "unset" &&
        proxy.connection_type !== typeFilter
      ) {
        return false
      }
      if (countryFilter !== "all" && proxy.country !== countryFilter) {
        return false
      }
      if (!normalizedQuery) {
        return true
      }

      return [
        proxy.name,
        proxy.host,
        proxy.username,
        proxy.country ?? "",
        proxy.connection_type ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [countryFilter, proxies, query, statusFilter, typeFilter])

  const visibleProxyIds = visibleProxies.map((proxy) => proxy.id)
  const visibleSelected =
    visibleProxyIds.length > 0 && visibleProxyIds.every((id) => selectedIds.has(id))
  const visiblePartiallySelected =
    visibleProxyIds.some((id) => selectedIds.has(id)) && !visibleSelected

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (visibleSelected) {
        visibleProxyIds.forEach((id) => next.delete(id))
      } else {
        visibleProxyIds.forEach((id) => next.add(id))
      }

      return next
    })
  }

  function toggleProxySelection(proxyId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(proxyId)) {
        next.delete(proxyId)
      } else {
        next.add(proxyId)
      }
      return next
    })
  }

  function openCreateForm() {
    setEditingProxy(null)
    setForm(emptyProxyForm)
    setFormOpen(true)
    setError(null)
    setNotice(null)
  }

  function openEditForm(proxy: ProxyItem) {
    setEditingProxy(proxy)
    setForm({
      name: proxy.name,
      protocol: proxy.protocol,
      host: proxy.host,
      port: String(proxy.port),
      username: proxy.username,
      password: "",
      connectionType: proxy.connection_type ?? "none",
      country: proxy.country ?? "",
      enabled: proxy.enabled,
    })
    setFormOpen(true)
    setError(null)
    setNotice(null)
  }

  async function handleSaveProxy() {
    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const payload = toProxyPayload(form)
      const saved = editingProxy
        ? await updateProxy({ ...payload, proxyId: editingProxy.id })
        : await createProxy(payload)

      setProxies((current) =>
        editingProxy
          ? current.map((proxy) => (proxy.id === saved.id ? saved : proxy))
          : [saved, ...current]
      )
      setNotice(editingProxy ? "Proxy updated." : "Proxy added.")
      setFormOpen(false)
    } catch (saveError) {
      setError(getProxyErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function handleImport() {
    setImporting(true)
    setError(null)
    setNotice(null)
    setImportErrors([])

    try {
      const result = await importProxies(importForm)
      setImportErrors(result.invalid_lines)
      setNotice(
        `Imported ${result.created_count}, skipped ${result.skipped_count}${
          result.invalid_lines.length ? `, invalid ${result.invalid_lines.length}` : ""
        }.`
      )
      setImportForm(emptyImportForm)
      setImportOpen(false)
      await loadCurrentProxies()
    } catch (importError) {
      setError(getProxyErrorMessage(importError))
    } finally {
      setImporting(false)
    }
  }

  async function handleTest(proxy: ProxyItem) {
    setTestingIds((current) => new Set(current).add(proxy.id))
    setError(null)
    setNotice(null)

    try {
      const tested = await testProxy(proxy.id)
      setProxies((current) =>
        current.map((item) => (item.id === tested.id ? tested : item))
      )
      setEditingProxy((current) =>
        current?.id === tested.id ? tested : current
      )
    } catch (testError) {
      setError(getProxyErrorMessage(testError))
    } finally {
      setTestingIds((current) => {
        const next = new Set(current)
        next.delete(proxy.id)
        return next
      })
    }
  }

  async function handleToggle(proxy: ProxyItem) {
    setError(null)
    setNotice(null)
    try {
      const updated = await toggleProxy(proxy.id, !proxy.enabled)
      setProxies((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
    } catch (toggleError) {
      setError(getProxyErrorMessage(toggleError))
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return

    setError(null)
    setNotice(null)
    try {
      await deleteProxy(pendingDelete.id)
      setProxies((current) =>
        current.filter((proxy) => proxy.id !== pendingDelete.id)
      )
      setSelectedIds((current) => {
        const next = new Set(current)
        next.delete(pendingDelete.id)
        return next
      })
      setNotice("Proxy deleted.")
      setPendingDelete(null)
    } catch (deleteError) {
      setError(getProxyErrorMessage(deleteError))
    }
  }

  async function handleMassDelete() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return

    setMassDeleting(true)
    setError(null)
    setNotice(null)
    try {
      const result = await deleteProxies(ids)
      const deletedIds = new Set(result.proxyIds)
      setProxies((current) => current.filter((proxy) => !deletedIds.has(proxy.id)))
      setSelectedIds(new Set())
      setNotice(`Deleted ${result.proxyIds.length} ${result.proxyIds.length === 1 ? "proxy" : "proxies"}.`)
      setMassDeleteOpen(false)
    } catch (deleteError) {
      setError(getProxyErrorMessage(deleteError))
    } finally {
      setMassDeleting(false)
    }
  }

  return (
    <div className="w-full pb-8">
      {error ? <Message tone="error">{error}</Message> : null}
      {notice ? <Message tone="success">{notice}</Message> : null}
      {importErrors.length ? (
        <Message tone="error">
          Invalid import lines:{" "}
          {importErrors
            .slice(0, 5)
            .map((item) => item.line)
            .join(", ")}
          {importErrors.length > 5 ? "..." : ""}
        </Message>
      ) : null}

      <DashboardTable
        title="Proxies"
        icon={<WifiIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={visibleProxies.length}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardSelectedActionButton
                type="button"
                variant="destructive"
                onClick={() => setMassDeleteOpen(true)}
                disabled={massDeleting}
              >
                {massDeleting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                Delete ({selectedIds.size})
              </DashboardSelectedActionButton>
            ) : null}
            <DashboardToolbarSearch
              name="proxy-search"
              aria-label="Search proxies"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search proxies..."
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as ProxyStatus | "all")}
            >
              <DashboardToolbarSelectTrigger
                aria-label="Filter by status"
                labels={["All statuses", "Online", "Offline", "Untested"]}
              >
                <SelectValue placeholder="Status" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="untested">Untested</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as ProxyConnectionType | "all" | "unset")
              }
            >
              <DashboardToolbarSelectTrigger
                aria-label="Filter by connection type"
                labels={["All types", "Unset", "Residential", "Mobile", "Datacenter"]}
              >
                <SelectValue placeholder="Type" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="unset">Unset</SelectItem>
                <SelectItem value="residential">Residential</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="datacenter">Datacenter</SelectItem>
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <DashboardToolbarSelectTrigger
                aria-label="Filter by country"
                labels={["All countries", ...countries]}
              >
                <SelectValue placeholder="Country" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {countries.map((country) => (
                  <SelectItem key={country} value={country}>
                    {country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-fit gap-2 sm:h-9"
              onClick={() => {
                setImportErrors([])
                setImportOpen(true)
              }}
            >
              <DownloadIcon className="size-4" />
              Import
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 w-fit gap-2 sm:h-9"
              onClick={openCreateForm}
            >
              <PlusIcon className="size-4" />
              Add Proxy
            </Button>
          </>
        }
        header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={
                      visibleSelected
                        ? true
                        : visiblePartiallySelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleVisibleSelection}
                    aria-label="Select visible proxies"
                  />
                </TableHead>
                <TableHead column="main">
                  Proxy
                </TableHead>
                <TableHead column="meta">
                  Port
                </TableHead>
                <TableHead column="meta">
                  Country
                </TableHead>
                <TableHead column="meta">
                  Type
                </TableHead>
                <TableHead column="meta">
                  Status
                </TableHead>
                <TableHead column="meta">
                  Enabled
                </TableHead>
                <TableHead column="meta">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
        }
        isEmpty={visibleProxies.length === 0}
        emptyText="No proxies found."
        emptyColSpan={8}
        footer={{ type: "summary", count: visibleProxies.length, label: "proxies" }}
      >
        {visibleProxies.map((proxy) => (
          <TableRow key={proxy.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(proxy.id)}
                onCheckedChange={() => toggleProxySelection(proxy.id)}
                aria-label={`Select ${proxy.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="space-y-1">
                <button
                  type="button"
                  className="max-w-full text-left font-medium group-hover:underline"
                  onClick={() => openEditForm(proxy)}
                  title={proxy.name}
                >
                  {proxy.name}
                </button>
                <div className="text-xs text-muted-foreground">
                  {proxy.protocol}://{proxy.username ? `${proxy.username}@` : ""}
                  {proxy.host}
                </div>
              </div>
            </TableCell>
            <TableCell column="meta">{proxy.port}</TableCell>
            <TableCell column="meta">{proxy.country ?? "Unknown"}</TableCell>
            <TableCell column="meta">
              {proxy.connection_type
                ? connectionTypeLabels[proxy.connection_type]
                : "Unset"}
            </TableCell>
            <TableCell column="meta">
              <StatusBadge status={proxy.last_status} />
            </TableCell>
            <TableCell column="meta">
              <Badge
                variant="outline"
                className={cn(
                  proxy.enabled
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                )}
              >
                {proxy.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void handleToggle(proxy)}
                  aria-label={proxy.enabled ? "Disable proxy" : "Enable proxy"}
                  title={proxy.enabled ? "Disable proxy" : "Enable proxy"}
                >
                  <PowerIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEditForm(proxy)}
                  aria-label={`Edit ${proxy.name}`}
                  title={`Edit ${proxy.name}`}
                >
                  <PencilIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setPendingDelete(proxy)}
                  aria-label={`Delete ${proxy.name}`}
                  title={`Delete ${proxy.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ProxyFormDialog
        open={formOpen}
        editingProxy={editingProxy}
        form={form}
        saving={saving}
        testing={editingProxy ? testingIds.has(editingProxy.id) : false}
        onFormChange={setForm}
        onOpenChange={setFormOpen}
        onSave={() => void handleSaveProxy()}
        onTest={() => {
          if (editingProxy) void handleTest(editingProxy)
        }}
      />

      <ImportDialog
        open={importOpen}
        form={importForm}
        importing={importing}
        onFormChange={setImportForm}
        onOpenChange={setImportOpen}
        onImport={() => void handleImport()}
      />

      <DeleteDialog
        proxy={pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        onConfirm={() => void handleDelete()}
      />
      <MassDeleteDialog
        count={selectedIds.size}
        deleting={massDeleting}
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={() => void handleMassDelete()}
      />
    </div>
  )
}

function ProxyFormDialog({
  open,
  editingProxy,
  form,
  saving,
  testing,
  onFormChange,
  onOpenChange,
  onSave,
  onTest,
}: {
  open: boolean
  editingProxy: ProxyItem | null
  form: ProxyFormState
  saving: boolean
  testing: boolean
  onFormChange: (form: ProxyFormState) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
  onTest: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{editingProxy ? "Edit Proxy" : "Add Proxy"}</DialogTitle>
          <DialogDescription>
            {editingProxy
              ? "Update this proxy. Leave password blank to keep the saved value."
              : "Add a proxy to the platform pool."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          {editingProxy ? (
            <ProxyStatusCard proxy={editingProxy} className="mb-2" />
          ) : null}
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(event) =>
                onFormChange({ ...form, name: event.target.value })
              }
              placeholder="US residential 1"
            />
          </Field>
          <Field label="Protocol">
            <Select
              value={form.protocol}
              onValueChange={(value) =>
                onFormChange({ ...form, protocol: value as ProxyProtocol })
              }
            >
              <DashboardToolbarSelectTrigger className="w-full">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="https">HTTPS</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Host">
            <Input
              value={form.host}
              onChange={(event) =>
                onFormChange({ ...form, host: event.target.value })
              }
              placeholder="proxy.example.com"
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(event) =>
                onFormChange({ ...form, port: event.target.value })
              }
              placeholder="8080"
            />
          </Field>
          <Field label="Username">
            <Input
              value={form.username}
              onChange={(event) =>
                onFormChange({ ...form, username: event.target.value })
              }
              autoComplete="off"
            />
          </Field>
          <Field label={editingProxy?.has_password ? "New password" : "Password"}>
            <Input
              type="password"
              value={form.password}
              onChange={(event) =>
                onFormChange({ ...form, password: event.target.value })
              }
              autoComplete="new-password"
              placeholder={editingProxy?.has_password ? "Saved password unchanged" : ""}
            />
          </Field>
          <Field label="Country">
            <Input
              value={form.country}
              onChange={(event) =>
                onFormChange({ ...form, country: event.target.value })
              }
              placeholder="United States"
            />
          </Field>
          <Field label="Connection Type">
            <Select
              value={form.connectionType}
              onValueChange={(value) =>
                onFormChange({
                  ...form,
                  connectionType: value as ProxyConnectionType | "none",
                })
              }
            >
              <DashboardToolbarSelectTrigger className="w-full">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unset</SelectItem>
                <SelectItem value="residential">Residential</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="datacenter">Datacenter</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <Checkbox
              checked={form.enabled}
              onCheckedChange={(checked) =>
                onFormChange({ ...form, enabled: checked === true })
              }
            />
            Enabled
          </label>
        </DialogBody>
        <DialogFooter variant="plain" className="sm:justify-between">
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              {editingProxy ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onTest}
                  disabled={testing || saving}
                >
                  {testing ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <WifiIcon className="size-4" />
                  )}
                  {testing ? "Testing" : "Test"}
                </Button>
              ) : null}
              <Button type="button" onClick={onSave} disabled={saving || testing}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {saving ? "Saving" : "Save"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProxyStatusCard({
  proxy,
  className,
}: {
  proxy: ProxyItem
  className?: string
}) {
  return (
    <Card size="sm" className={cn("sm:col-span-2", className)}>
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <StatusMetric label="Current">
          <StatusBadge status={proxy.last_status} />
        </StatusMetric>
        <StatusMetric label="Last checked">
          {proxy.last_checked_at
            ? dateFormatter.format(new Date(proxy.last_checked_at))
            : "Never"}
        </StatusMetric>
        <StatusMetric label="Response time">
          {proxy.last_response_ms ? `${proxy.last_response_ms}ms` : "None"}
        </StatusMetric>
        <StatusMetric label="Error" className="sm:col-span-3">
          {proxy.last_error ?? "None"}
        </StatusMetric>
      </CardContent>
    </Card>
  )
}

function StatusMetric({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="wrap-break-word text-sm">{children}</div>
    </div>
  )
}

function ImportDialog({
  open,
  form,
  importing,
  onFormChange,
  onOpenChange,
  onImport,
}: {
  open: boolean
  form: ProxyImportState
  importing: boolean
  onFormChange: (form: ProxyImportState) => void
  onOpenChange: (open: boolean) => void
  onImport: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Import Proxies</DialogTitle>
          <DialogDescription>
            Paste one proxy per line using host:port:user:pass.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Protocol">
              <Select
                value={form.protocol}
                onValueChange={(value) =>
                  onFormChange({ ...form, protocol: value as ProxyProtocol })
                }
              >
                <DashboardToolbarSelectTrigger className="w-full">
                  <SelectValue />
                </DashboardToolbarSelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm font-medium">
              <Checkbox
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  onFormChange({ ...form, enabled: checked === true })
                }
              />
              Enabled after import
            </label>
          </div>
          <Field label="Proxy list">
            <Textarea
              value={form.lines}
              onChange={(event) =>
                onFormChange({ ...form, lines: event.target.value })
              }
              className="min-h-72 font-mono text-xs"
              placeholder="proxy.example.com:8080:user:pass"
            />
          </Field>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onImport} disabled={importing}>
              {importing ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {importing ? "Importing" : "Import"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  proxy,
  onOpenChange,
  onConfirm,
}: {
  proxy: ProxyItem | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(proxy)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Delete Proxy</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {proxy ? `Are you sure you want to delete ${proxy.name}?` : ""}
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm}>
              <Trash2Icon className="h-4 w-4" />
              Delete
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MassDeleteDialog({
  count,
  deleting,
  open,
  onOpenChange,
  onConfirm,
}: {
  count: number
  deleting: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            Delete {count} {count === 1 ? "Proxy" : "Proxies"}
          </DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete {count} selected {count === 1 ? "proxy" : "proxies"}?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={deleting || count === 0}
            >
              {deleting ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2Icon className="h-4 w-4" />
              )}
              Delete
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Message({
  tone,
  children,
}: {
  tone: "error" | "success"
  children: React.ReactNode
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mt-4 rounded-md border px-3 py-2 text-sm",
        tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted/40 text-muted-foreground"
      )}
    >
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: ProxyStatus }) {
  return (
    <Badge
      variant={
        status === "online"
          ? "secondary"
          : status === "offline"
            ? "destructive"
            : "outline"
      }
    >
      {statusLabels[status]}
    </Badge>
  )
}

function toProxyPayload(form: ProxyFormState) {
  const port = Number.parseInt(form.port, 10)
  if (!Number.isInteger(port)) {
    throw new Error("Port is required.")
  }

  return {
    name: form.name,
    protocol: form.protocol,
    host: form.host,
    port,
    username: form.username,
    password: form.password,
    connectionType:
      form.connectionType === "none" ? null : form.connectionType,
    country: form.country || null,
    enabled: form.enabled,
  }
}
