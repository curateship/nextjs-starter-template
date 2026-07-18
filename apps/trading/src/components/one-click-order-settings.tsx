import * as React from "react"
import { toast } from "sonner"
import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { OneClickOrderDialog } from "@/components/one-click-order-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  deleteOrderTemplate,
  getOrderTemplateErrorMessage,
  loadOrderTemplates,
  setDefaultOrderTemplate,
  type OrderTemplateItem,
} from "@/lib/api/order-templates"
import { cn } from "@/lib/utils"

type SortColumn =
  | "name"
  | "orderSizePct"
  | "leverage"
  | "stopLossPct"
  | "takeProfitPct"
  | "useLimitOrder"
  | "isDefault"

export function OneClickOrderSettings() {
  const [templates, setTemplates] = React.useState<OrderTemplateItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OrderTemplateItem | null>(null)
  const [pendingDelete, setPendingDelete] =
    React.useState<OrderTemplateItem | null>(null)
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("name")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("asc")

  React.useEffect(() => {
    void loadOrderTemplates()
      .then(setTemplates)
      .catch((error) => setError(getOrderTemplateErrorMessage(error)))
      .finally(() => setLoading(false))
  }, [])

  const sorted = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    return [...templates].sort((a, b) => {
      const left = a[sortColumn]
      const right = b[sortColumn]
      if (typeof left === "string" && typeof right === "string") {
        return left.localeCompare(right) * direction
      }
      return (Number(left) - Number(right)) * direction
    })
  }, [sortColumn, sortDirection, templates])

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(template: OrderTemplateItem) {
    setEditing(template)
    setDialogOpen(true)
  }

  async function makeDefault(template: OrderTemplateItem) {
    if (template.isDefault) return
    setBusyId(template.id)
    setError(null)
    try {
      setTemplates(await setDefaultOrderTemplate(template.id))
    } catch (error) {
      setError(getOrderTemplateErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusyId(pendingDelete.id)
    setError(null)
    try {
      setTemplates(await deleteOrderTemplate(pendingDelete.id))
      setPendingDelete(null)
      toast.success("Template deleted")
    } catch (error) {
      setError(getOrderTemplateErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  const sortHead = (column: SortColumn, label: string) => (
    <TableSortButton
      active={sortColumn === column}
      direction={sortDirection}
      onClick={() => toggleSort(column)}
    >
      {label}
    </TableSortButton>
  )

  return (
    <>
      <DashboardTable
        title="One Click Order"
        count={templates.length}
        loading={loading}
        status={error ? { tone: "error", text: error } : null}
        controls={
          <DashboardToolbarButton type="button" onClick={openCreate}>
            <PlusIcon className="size-4" />
            New template
          </DashboardToolbarButton>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">{sortHead("name", "Name")}</TableHead>
              <TableHead column="meta">
                {sortHead("orderSizePct", "Sizing")}
              </TableHead>
              <TableHead column="meta">
                {sortHead("leverage", "Leverage")}
              </TableHead>
              <TableHead column="meta">
                {sortHead("stopLossPct", "Stop")}
              </TableHead>
              <TableHead column="meta">
                {sortHead("takeProfitPct", "Take profit")}
              </TableHead>
              <TableHead column="meta">
                {sortHead("useLimitOrder", "Entry")}
              </TableHead>
              <TableHead column="meta">
                {sortHead("isDefault", "Default")}
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={templates.length === 0}
        emptyText="No order templates yet. Create one to enable one-click orders."
        emptyColSpan={8}
        footer={{
          type: "summary",
          count: templates.length,
          label: "templates",
        }}
      >
        {sorted.map((template) => (
          <TableRow key={template.id}>
            <TableCell column="main">
              <button
                type="button"
                className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => openEdit(template)}
              >
                {template.name}
              </button>
            </TableCell>
            <TableCell column="meta">
              {template.sizingMode === "risk" ? "Risk" : "Wallet"}{" "}
              {template.orderSizePct}%
            </TableCell>
            <TableCell column="meta">{template.leverage}x</TableCell>
            <TableCell column="meta">{template.stopLossPct}%</TableCell>
            <TableCell column="meta">{template.takeProfitPct}%</TableCell>
            <TableCell column="meta">
              {template.useLimitOrder ? "Limit" : "Market"}
            </TableCell>
            <TableCell column="meta">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busyId === template.id || template.isDefault}
                aria-label={
                  template.isDefault
                    ? `${template.name} is the default`
                    : `Make ${template.name} the default`
                }
                title={template.isDefault ? "Default template" : "Make default"}
                onClick={() => void makeDefault(template)}
              >
                {busyId === template.id ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <StarIcon
                    className={cn(
                      "size-4",
                      template.isDefault && "fill-amber-400 text-amber-500"
                    )}
                  />
                )}
              </Button>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${template.name}`}
                  title={`Edit ${template.name}`}
                  onClick={() => openEdit(template)}
                >
                  <PencilIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${template.name}`}
                  title={`Delete ${template.name}`}
                  onClick={() => setPendingDelete(template)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {dialogOpen ? (
        <OneClickOrderDialog
          open
          template={editing}
          onOpenChange={setDialogOpen}
          onSaved={(templates) => {
            setTemplates(templates)
            setError(null)
            toast.success("Template saved")
          }}
        />
      ) : null}

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete order template?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `“${pendingDelete.name}” will no longer be available on the Trade screen.`
                : "This template will be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busyId)}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(busyId)}
              onClick={() => void confirmDelete()}
            >
              {busyId ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
