import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  GlobeIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  createSite,
  deleteSite,
  getSiteErrorMessage,
  updateSite,
  type SiteItem,
} from "@/lib/api/sites"

type SiteForm = { name: string; domain: string }
type SiteSortColumn = "name" | "trackingId"

const emptyForm: SiteForm = { name: "", domain: "" }

export function SitesDashboard({
  initialSites: sites,
}: {
  initialSites: SiteItem[]
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<SiteItem | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<SiteItem[] | null>(
    null
  )
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<SiteForm>(emptyForm)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [sortColumn, setSortColumn] = React.useState<SiteSortColumn>("name")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("asc")

  const sortedSites = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    return [...sites].sort((a, b) => {
      const key = sortColumn === "trackingId" ? "public_id" : "name"
      return a[key].localeCompare(b[key]) * direction
    })
  }, [sites, sortColumn, sortDirection])

  const selectedSites = sortedSites.filter((site) => selected.has(site.id))
  const allSelected =
    sortedSites.length > 0 && selectedSites.length === sortedSites.length

  function toggleSort(column: SiteSortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortColumn(column)
    setSortDirection("asc")
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(sortedSites.map((site) => site.id))
    )
  }

  function toggleOne(siteId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(siteId)) {
        next.delete(siteId)
      } else {
        next.add(siteId)
      }
      return next
    })
  }

  function openCreateForm() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setFormOpen(true)
  }

  function openEditForm(site: SiteItem) {
    setEditing(site)
    setForm({ name: site.name, domain: site.domain })
    setError(null)
    setFormOpen(true)
  }

  function openDeleteConfirm(targets: SiteItem[]) {
    setError(null)
    setPendingDelete(targets)
  }

  async function saveSite() {
    const name = form.name.trim()
    const domain = form.domain.trim()
    if (!name || !domain) {
      setError("Name and website address are required")
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (editing) {
        await updateSite(editing.id, name, domain)
      } else {
        await createSite(name, domain)
      }
      await router.invalidate()
      setFormOpen(false)
      setEditing(null)
    } catch (error) {
      setError(getSiteErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete?.length) return
    setBusy(true)
    setError(null)
    try {
      for (const site of pendingDelete) {
        await deleteSite(site.id)
      }
      await router.invalidate()
      setSelected((current) => {
        const next = new Set(current)
        for (const site of pendingDelete) next.delete(site.id)
        return next
      })
      setPendingDelete(null)
    } catch (error) {
      setError(getSiteErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full">
      <DashboardTable
        title="Sites"
        icon={<GlobeIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={sortedSites.length}
        selectedCount={selectedSites.length}
        onClearSelection={() => setSelected(new Set())}
        controls={
          <>
            {selectedSites.length > 0 ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => openDeleteConfirm(selectedSites)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedSites.length})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarButton type="button" onClick={openCreateForm}>
              <PlusIcon className="size-4" />
              Add Site
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={
                    allSelected
                      ? true
                      : selectedSites.length > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleAll}
                  aria-label="Select all sites"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sortColumn === "name"}
                  direction={sortDirection}
                  onClick={() => toggleSort("name")}
                >
                  Site
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "trackingId"}
                  direction={sortDirection}
                  onClick={() => toggleSort("trackingId")}
                >
                  Tracking ID
                </TableSortButton>
              </TableHead>
              <TableHead column="actions">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sortedSites.length === 0}
        emptyText="No sites yet. Add your first site to get a tracking snippet."
        emptyColSpan={4}
        footer={{ type: "summary", count: sortedSites.length, label: "sites" }}
      >
        {sortedSites.map((site) => (
          <TableRow
            key={site.id}
            data-state={selected.has(site.id) ? "selected" : undefined}
          >
            <TableCell column="select">
              <Checkbox
                checked={selected.has(site.id)}
                onCheckedChange={() => toggleOne(site.id)}
                aria-label={`Select ${site.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                  <GlobeIcon className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <Link
                    to="/sites/$siteId"
                    params={{ siteId: site.id }}
                    className="truncate font-medium hover:underline"
                  >
                    {site.name}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">
                    {site.domain}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell column="meta">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {site.public_id.slice(0, 8)}…
              </code>
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEditForm(site)}
                  aria-label={`Edit ${site.name}`}
                  title={`Edit ${site.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openDeleteConfirm([site])}
                  aria-label={`Delete ${site.name}`}
                  title={`Delete ${site.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <SiteFormDialog
        open={formOpen}
        editing={editing}
        form={form}
        saving={busy}
        error={error}
        onFormChange={setForm}
        onOpenChange={(open) => {
          if (busy) return
          setFormOpen(open)
        }}
        onSave={() => void saveSite()}
      />

      <DeleteSitesDialog
        sites={pendingDelete}
        deleting={busy}
        error={error}
        onOpenChange={(open) => {
          if (busy) return
          if (!open) setPendingDelete(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

function SiteFormDialog({
  open,
  editing,
  form,
  saving,
  error,
  onFormChange,
  onOpenChange,
  onSave,
}: {
  open: boolean
  editing: SiteItem | null
  form: SiteForm
  saving: boolean
  error: string | null
  onFormChange: (form: SiteForm) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Site" : "Add Site"}</DialogTitle>
          <DialogDescription>
            Give the site a name and its website address.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Site details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="site-name">Name</Label>
                <Input
                  id="site-name"
                  value={form.name}
                  disabled={saving}
                  placeholder="My blog"
                  onChange={(event) =>
                    onFormChange({ ...form, name: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="site-domain">Website address</Label>
                <Input
                  id="site-domain"
                  value={form.domain}
                  disabled={saving}
                  placeholder="example.com"
                  onChange={(event) =>
                    onFormChange({ ...form, domain: event.target.value })
                  }
                />
              </div>
            </CardContent>
          </Card>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={onSave}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteSitesDialog({
  sites,
  deleting,
  error,
  onOpenChange,
  onConfirm,
}: {
  sites: SiteItem[] | null
  deleting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const count = sites?.length ?? 0
  const label =
    count === 1 ? (sites?.[0]?.name ?? "this site") : `${count} sites`

  return (
    <Dialog open={count > 0} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{count === 1 ? "Delete Site" : "Delete Sites"}</DialogTitle>
          <DialogDescription>
            This deletes {count === 1 ? "the site" : "these sites"} and all of
            the collected data. The tracking snippets stop being accepted.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">
            Delete <span className="font-medium">{label}</span>?
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={onConfirm}
            >
              {deleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              {count > 1 ? `Delete (${count})` : "Delete"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
