import * as React from "react"
import {
  PackageIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  Card,
  CardContent,
  CardDescription,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  archiveAdminPlan,
  createAdminPlan,
  getPlanErrorMessage,
  loadAdminPlans,
  updateAdminPlan,
  type AdminPlan,
} from "@/lib/api/admin-plans"
import { formatMoney } from "@/lib/money"
import type { PlanFeatures } from "@/lib/plan-features"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useShellRuntime } from "@/components/shell/shell-layout"

type PlanSortColumn = "name" | "monthly" | "yearly" | "stripe" | "visibility"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

function comparePlans(a: AdminPlan, b: AdminPlan, column: PlanSortColumn) {
  switch (column) {
    case "monthly":
      return a.priceMonthlyCents - b.priceMonthlyCents
    case "yearly":
      return a.priceYearlyCents - b.priceYearlyCents
    case "stripe":
      return Number(Boolean(a.stripePriceIdMonthly || a.stripePriceIdYearly)) -
        Number(Boolean(b.stripePriceIdMonthly || b.stripePriceIdYearly))
    case "visibility":
      return Number(a.isPublic) - Number(b.isPublic)
    default:
      return a.name.localeCompare(b.name)
  }
}

type PlanDraft = {
  slug: string
  name: string
  description: string
  priceMonthly: string
  priceYearly: string
  currency: string
  stripePriceIdMonthly: string
  stripePriceIdYearly: string
  trialDays: string
  features: string
  isDefault: boolean
  isPublic: boolean
  sortOrder: string
  active: boolean
}

const emptyDraft: PlanDraft = {
  slug: "",
  name: "",
  description: "",
  priceMonthly: "0",
  priceYearly: "0",
  currency: "usd",
  stripePriceIdMonthly: "",
  stripePriceIdYearly: "",
  trialDays: "0",
  features: "{}",
  isDefault: false,
  isPublic: true,
  sortOrder: "0",
  active: true,
}

export function AdminPlansDashboard({
  initialPlans,
}: {
  initialPlans: AdminPlan[]
}) {
  const { config } = useShellRuntime()
  const [plans, setPlans] = React.useState(initialPlans)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [sort, setSort] = React.useState<PlanSortColumn>("name")
  const [direction, setDirection] = React.useState<"asc" | "desc">("asc")
  const [editing, setEditing] = React.useState<AdminPlan | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [archiveTarget, setArchiveTarget] = React.useState<AdminPlan | null>(null)
  const [archiving, setArchiving] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massArchiving, setMassArchiving] = React.useState(false)
  const [massArchiveOpen, setMassArchiveOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const sortedPlans = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const query = searchQuery.trim().toLowerCase()
    return plans
      .filter(
        (plan) =>
          !query ||
          plan.name.toLowerCase().includes(query) ||
          plan.slug.toLowerCase().includes(query)
      )
      .sort((a, b) => factor * comparePlans(a, b, sort))
  }, [direction, plans, searchQuery, sort])

  const totalPages = Math.ceil(sortedPlans.length / pageSize)
  const paginatedPlans = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedPlans.slice(startIndex, startIndex + pageSize)
  }, [currentPage, pageSize, sortedPlans])

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sort, direction, pageSize])

  useClearSelectionOnListChange(
    setSelectedIds,
    `${searchQuery}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  // The default plan is everyone's fallback, so it can never be archived.
  // Selection works on the visible page, like every other paginated table.
  const archivableIds = React.useMemo(
    () =>
      paginatedPlans
        .filter((plan) => plan.active && !plan.isDefault)
        .map((plan) => plan.id),
    [paginatedPlans]
  )
  const allSelected =
    archivableIds.length > 0 && archivableIds.every((id) => selectedIds.has(id))
  const someSelected = archivableIds.some((id) => selectedIds.has(id))

  const toggleSelection = React.useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleVisibleSelection = React.useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (archivableIds.every((id) => next.has(id))) {
        archivableIds.forEach((id) => next.delete(id))
      } else {
        archivableIds.forEach((id) => next.add(id))
      }
      return next
    })
  }, [archivableIds])

  const toggleSort = React.useCallback(
    (column: PlanSortColumn) => {
      if (sort === column) {
        setDirection(direction === "asc" ? "desc" : "asc")
        return
      }
      setSort(column)
      setDirection("asc")
    },
    [direction, sort]
  )

  const refresh = React.useCallback(async () => {
    try {
      setPlans(await loadAdminPlans())
      setError(null)
    } catch (loadError) {
      setError(getPlanErrorMessage(loadError))
    }
  }, [])

  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <DashboardTable
        title="Plans"
        icon={<PackageIcon />}
        count={sortedPlans.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setMassArchiveOpen(true)}
                disabled={massArchiving}
              >
                <Trash2Icon className="size-4" />
                Archive ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="plan-search"
              aria-label="Search plans"
              placeholder="Search plans..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              New plan
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={toggleVisibleSelection}
                  aria-label="Select archivable plans"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                >
                  Plan
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "monthly"}
                  direction={direction}
                  onClick={() => toggleSort("monthly")}
                >
                  Monthly
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "yearly"}
                  direction={direction}
                  onClick={() => toggleSort("yearly")}
                >
                  Yearly
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "stripe"}
                  direction={direction}
                  onClick={() => toggleSort("stripe")}
                >
                  Stripe
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "visibility"}
                  direction={direction}
                  onClick={() => toggleSort("visibility")}
                >
                  Visibility
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sortedPlans.length === 0}
        emptyText={
          plans.length === 0
            ? "No plans yet. Create the first one."
            : "No plans found matching your search."
        }
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sortedPlans.length,
          totalPages,
          onPageChange: (page) =>
            setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))),
          onPageSizeChange: (nextSize) => {
            setCurrentPage(1)
            setPageSize(nextSize)
          },
          pageSizeOptions,
        }}
      >
        {paginatedPlans.map((plan) => (
          <TableRow key={plan.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(plan.id)}
                onCheckedChange={() => toggleSelection(plan.id)}
                disabled={plan.isDefault || !plan.active}
                aria-label={`Select ${plan.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="text-left text-sm font-medium group-hover:underline"
                onClick={() => setEditing(plan)}
              >
                {plan.name}
              </button>
              <span className="ml-2 text-xs text-muted-foreground">
                {plan.slug}
              </span>
            </TableCell>
            <TableCell column="meta">
              {formatMoney(plan.priceMonthlyCents, plan.currency)}
            </TableCell>
            <TableCell column="meta">
              {formatMoney(plan.priceYearlyCents, plan.currency)}
            </TableCell>
            <TableCell column="meta">
              {plan.stripePriceIdMonthly || plan.stripePriceIdYearly ? (
                <Badge variant="secondary">Connected</Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
            </TableCell>
            <TableCell column="meta">
              <div className="flex flex-wrap gap-1.5">
                {plan.isDefault ? <Badge>Default</Badge> : null}
                {plan.isPublic ? null : <Badge variant="outline">Hidden</Badge>}
                {plan.active ? null : <Badge variant="outline">Archived</Badge>}
              </div>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(plan)}
                  title="Plan settings"
                  aria-label={`Plan settings for ${plan.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={plan.isDefault || !plan.active}
                  onClick={() => setArchiveTarget(plan)}
                  title="Archive plan"
                  aria-label={`Archive ${plan.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <PlanDialog
        key={editing?.id ?? (creating ? "new-plan" : "closed")}
        open={creating || Boolean(editing)}
        plan={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={async () => {
          setCreating(false)
          setEditing(null)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={massArchiveOpen}
        onOpenChange={setMassArchiveOpen}
        title={`Archive ${selectedIds.size} ${selectedIds.size === 1 ? "plan" : "plans"}?`}
        description="They disappear from the pricing page. Anyone already on them keeps their plan until their subscription ends."
        confirmLabel="Archive plans"
        loading={massArchiving}
        onConfirm={async () => {
          setMassArchiving(true)
          try {
            for (const planId of selectedIds) {
              await archiveAdminPlan(planId)
            }
            toast.success("Plans archived.")
            setSelectedIds(new Set())
            setMassArchiveOpen(false)
            await refresh()
          } catch (archiveError) {
            showErrorToast(getPlanErrorMessage(archiveError))
          } finally {
            setMassArchiving(false)
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null)
        }}
        title="Archive this plan?"
        description={
          archiveTarget
            ? `${archiveTarget.name} disappears from the pricing page. People already on it keep it until their subscription ends.`
            : null
        }
        confirmLabel="Archive plan"
        loading={archiving}
        onConfirm={async () => {
          const target = archiveTarget
          if (!target) return
          setArchiving(true)
          try {
            await archiveAdminPlan(target.id)
            toast.success("Plan archived.")
            setArchiveTarget(null)
            await refresh()
          } catch (archiveError) {
            showErrorToast(getPlanErrorMessage(archiveError))
          } finally {
            setArchiving(false)
          }
        }}
      />
    </div>
  )
}

function PlanDialog({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean
  plan: AdminPlan | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  // Mounted fresh per plan by its key in the parent, so the draft starts from
  // the right plan without an effect resetting it after the first render.
  const [draft, setDraft] = React.useState<PlanDraft>(() =>
    plan ? toDraft(plan) : emptyDraft
  )
  const [saving, setSaving] = React.useState(false)

  const update = React.useCallback(
    <Key extends keyof PlanDraft>(key: Key, value: PlanDraft[Key]) => {
      setDraft((current) => ({ ...current, [key]: value }))
    },
    []
  )

  const handleSave = React.useCallback(async () => {
    dismissErrorToast()

    let features: PlanFeatures
    try {
      features = parseFeatures(draft.features)
    } catch {
      showErrorToast(getPlanErrorMessage(new Error("FEATURES_INVALID")))
      return
    }

    const input = {
      slug: draft.slug.trim().toLowerCase(),
      name: draft.name,
      description: draft.description,
      priceMonthlyCents: toCents(draft.priceMonthly),
      priceYearlyCents: toCents(draft.priceYearly),
      currency: draft.currency,
      stripePriceIdMonthly: draft.stripePriceIdMonthly.trim() || null,
      stripePriceIdYearly: draft.stripePriceIdYearly.trim() || null,
      trialDays: Number.parseInt(draft.trialDays || "0", 10) || 0,
      features,
      isDefault: draft.isDefault,
      isPublic: draft.isPublic,
      sortOrder: Number.parseInt(draft.sortOrder || "0", 10) || 0,
      active: draft.active,
    }

    setSaving(true)
    try {
      if (plan) {
        await updateAdminPlan(plan.id, input)
        toast.success("Plan updated.")
      } else {
        await createAdminPlan(input)
        toast.success("Plan created.")
      }
      await onSaved()
    } catch (saveError) {
      showErrorToast(getPlanErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }, [draft, onSaved, plan])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{plan ? "Edit plan" : "New plan"}</DialogTitle>
          <DialogDescription>
            Prices are shown to people exactly as entered here. Stripe price ids
            decide what they are actually charged.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="plan-name">
                  <Input
                    id="plan-name"
                    value={draft.name}
                    onChange={(event) => update("name", event.target.value)}
                  />
                </Field>
                <Field
                  label="Short id"
                  htmlFor="plan-slug"
                  help="Lowercase letters, numbers and dashes, like `pro`."
                >
                  <Input
                    id="plan-slug"
                    value={draft.slug}
                    onChange={(event) => update("slug", event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Description" htmlFor="plan-description">
                <Textarea
                  id="plan-description"
                  rows={1}
                  value={draft.description}
                  onChange={(event) => update("description", event.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Price</CardTitle>
              <CardDescription>
                Enter amounts in whole currency, like 19 or 19.50. Use 0 to hide
                a billing period.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Monthly price" htmlFor="plan-monthly">
                  <Input
                    id="plan-monthly"
                    inputMode="decimal"
                    value={draft.priceMonthly}
                    onChange={(event) =>
                      update("priceMonthly", event.target.value)
                    }
                  />
                </Field>
                <Field label="Yearly price" htmlFor="plan-yearly">
                  <Input
                    id="plan-yearly"
                    inputMode="decimal"
                    value={draft.priceYearly}
                    onChange={(event) =>
                      update("priceYearly", event.target.value)
                    }
                  />
                </Field>
                <Field label="Currency" htmlFor="plan-currency">
                  <Input
                    id="plan-currency"
                    value={draft.currency}
                    onChange={(event) => update("currency", event.target.value)}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Stripe monthly price id"
                  htmlFor="plan-stripe-monthly"
                >
                  <Input
                    id="plan-stripe-monthly"
                    placeholder="price_..."
                    value={draft.stripePriceIdMonthly}
                    onChange={(event) =>
                      update("stripePriceIdMonthly", event.target.value)
                    }
                  />
                </Field>
                <Field
                  label="Stripe yearly price id"
                  htmlFor="plan-stripe-yearly"
                >
                  <Input
                    id="plan-stripe-yearly"
                    placeholder="price_..."
                    value={draft.stripePriceIdYearly}
                    onChange={(event) =>
                      update("stripePriceIdYearly", event.target.value)
                    }
                  />
                </Field>
              </div>
              <Field
                label="Free trial days"
                htmlFor="plan-trial"
                help="0 means no trial."
              >
                <Input
                  id="plan-trial"
                  inputMode="numeric"
                  value={draft.trialDays}
                  onChange={(event) => update("trialDays", event.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Features and visibility</CardTitle>
              <CardDescription>
                Features are JSON. `true` shows as a bullet, a number shows as a
                limit, and text shows as a value.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field label="Features" htmlFor="plan-features">
                <Textarea
                  id="plan-features"
                  rows={1}
                  className="font-mono text-xs"
                  value={draft.features}
                  onChange={(event) => update("features", event.target.value)}
                />
              </Field>
              <Field label="Order" htmlFor="plan-sort">
                <Input
                  id="plan-sort"
                  inputMode="numeric"
                  value={draft.sortOrder}
                  onChange={(event) => update("sortOrder", event.target.value)}
                />
              </Field>
              <div className="grid gap-2">
                <CheckboxRow
                  id="plan-public"
                  label="Show on the pricing page"
                  checked={draft.isPublic}
                  onChange={(checked) => update("isPublic", checked)}
                />
                <CheckboxRow
                  id="plan-default"
                  label="Everyone starts on this plan"
                  checked={draft.isDefault}
                  onChange={(checked) => update("isDefault", checked)}
                />
                <CheckboxRow
                  id="plan-active"
                  label="Active"
                  checked={draft.active}
                  onChange={(checked) => update("active", checked)}
                />
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {plan ? "Save plan" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string
  htmlFor: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={htmlFor} hint={help}>
        {label}
      </FieldLabel>
      {children}
    </div>
  )
}

function CheckboxRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  )
}

function toDraft(plan: AdminPlan): PlanDraft {
  return {
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    priceMonthly: (plan.priceMonthlyCents / 100).toString(),
    priceYearly: (plan.priceYearlyCents / 100).toString(),
    currency: plan.currency,
    stripePriceIdMonthly: plan.stripePriceIdMonthly ?? "",
    stripePriceIdYearly: plan.stripePriceIdYearly ?? "",
    trialDays: plan.trialDays.toString(),
    features: JSON.stringify(plan.features, null, 2),
    isDefault: plan.isDefault,
    isPublic: plan.isPublic,
    sortOrder: plan.sortOrder.toString(),
    active: plan.active,
  }
}

function toCents(value: string) {
  const amount = Number.parseFloat(value || "0")
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0
}

function parseFeatures(value: string): PlanFeatures {
  const trimmed = value.trim()
  if (!trimmed) return {}

  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("FEATURES_INVALID")
  }

  return parsed as PlanFeatures
}
