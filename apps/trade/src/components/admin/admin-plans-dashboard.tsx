import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import {
  Loader2Icon,
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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  archiveAdminPlan,
  archiveAdminPlans,
  createAdminPlan,
  getPlanErrorMessage,
  loadAdminPlans,
  updateAdminPlan,
  type AdminPlan,
} from "@/lib/api/billing/admin-plans"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { AI_ALLOWANCE_FEATURE_KEY } from "@/lib/ai/ai-models"
import { formatPlanPrice } from "@/lib/format/money"
import type { PlanFeatures } from "@/lib/billing/plan-features"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useShellRuntime } from "@/components/shell/shell-layout"

const plansRoute = getRouteApi("/_authenticated/admin/plans")

type PlanSortColumn = "name" | "monthly" | "yearly" | "stripe" | "visibility"

const PLAN_COLUMNS: SortableColumn<PlanSortColumn>[] = [
  { key: "name", label: "Plan", column: "main" },
  { key: "monthly", label: "Monthly", column: "meta" },
  { key: "yearly", label: "Yearly", column: "meta" },
  { key: "stripe", label: "Stripe", column: "meta" },
  { key: "visibility", label: "Visibility", column: "meta" },
]

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
  /** Dollars of AI a month, its own field so nobody has to hand-edit JSON. */
  aiDollars: string
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
  aiDollars: "",
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
  // Search, sort and page live in the address, so Back returns this exact
  // list — see `lib/nav/list-search.ts`.
  const listSearch = plansRoute.useSearch()
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const currentPage = listSearch.page ?? 1
  const setCurrentPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const sort: PlanSortColumn = listSearch.sort ?? "name"
  const direction = listSearch.direction ?? "asc"
  const [editing, setEditing] = React.useState<AdminPlan | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [archiveTarget, setArchiveTarget] = React.useState<AdminPlan | null>(null)
  const [archiving, setArchiving] = React.useState(false)
  const selection = useSelection()
  const selectedIds = selection.selected
  const [run, massArchiving] = useAsyncAction(getPlanErrorMessage)
  const [massArchiveOpen, setMassArchiveOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const setOpenPlan = React.useCallback(
    (id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )
  const openPlan = React.useCallback(
    (plan: AdminPlan) => {
      setEditing(plan)
      setOpenPlan(plan.id)
    },
    [setOpenPlan]
  )

  React.useEffect(() => {
    const plan = plans.find((item) => item.id === listSearch.open)
    if (plan) setEditing(plan)
    else if (!creating) setEditing(null)
  }, [creating, listSearch.open, plans])

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

  // Changing how many rows fit can leave you past the end; the address already
  // drops the page when the search, sort or filters change.
  React.useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, setCurrentPage])

  useClearSelectionOnListChange(
    selection.setSelected,
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
  const toggleSort = useListSort<PlanSortColumn>({ sort, direction })

  const refresh = React.useCallback(async () => {
    try {
      setPlans(await loadAdminPlans())
      setError(null)
    } catch (loadError) {
      setError(getPlanErrorMessage(loadError))
    }
  }, [])

  // One request for the whole selection, and the server decides what it can
  // take — the default plan and anything already archived are left alone.
  const confirmMassArchive = React.useCallback(async () => {
    await run(async () => {
      const { archived, kept } = await archiveAdminPlans([...selectedIds])
      await refresh()
      // Anything that would not go stays ticked, so the rows still on screen
      // are the ones the count is talking about.
      selection.setSelected(new Set(kept))

      if (archived.length === 0) {
        showErrorToast(
          "No plans were archived. The default plan has to stay, and the others may already be archived."
        )
        return
      }

      toast.success(
        describeBulkResult({
          done: archived.length,
          kept: kept.length,
          one: "plan",
          many: "plans",
          verb: "archived",
        })
      )
      setMassArchiveOpen(false)
    })
  }, [refresh, run, selectedIds, selection])

  return (
    <>
      <DashboardTable
        title="Plans"
        icon={<PackageIcon />}
        count={sortedPlans.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
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
              placeholder="Search plans…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              New plan
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={PLAN_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(archivableIds)}
                  onCheckedChange={() => selection.toggleVisible(archivableIds)}
                  aria-label="Select archivable plans"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
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
        }}
      >
        {paginatedPlans.map((plan) => (
          <TableRow
            key={plan.id}
            className="group"
            rowAction={() => openPlan(plan)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(plan.id)}
                onCheckedChange={() => selection.toggle(plan.id)}
                disabled={plan.isDefault || !plan.active}
                aria-label={`Select ${plan.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => openPlan(plan)}
                title={plan.name}
              >
                {plan.name}
              </button>
              <span
                className="ml-2 inline-block max-w-96 truncate align-bottom text-xs text-muted-foreground"
                title={plan.slug}
              >
                {plan.slug}
              </span>
            </TableCell>
            <TableCell column="meta">
              {formatPlanPrice(
                plan.priceMonthlyCents,
                plan.priceYearlyCents,
                plan.currency
              )}
            </TableCell>
            <TableCell column="meta">
              {formatPlanPrice(
                plan.priceYearlyCents,
                plan.priceMonthlyCents,
                plan.currency
              )}
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
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => openPlan(plan)}
                  title="Plan settings"
                  aria-label={`Plan settings for ${plan.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <DisabledReason
                  disabled={plan.isDefault || !plan.active}
                  reason={
                    plan.isDefault
                      ? "This is the default plan, which everyone falls back to. Make another plan the default first."
                      : "This plan is already archived."
                  }
                >
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
                </DisabledReason>
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
          setOpenPlan(undefined)
        }}
        onSaved={async () => {
          setCreating(false)
          setEditing(null)
          setOpenPlan(undefined)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={massArchiveOpen}
        onOpenChange={setMassArchiveOpen}
        title={`Archive ${selectedIds.size} ${plural(selectedIds.size, "plan", "plans")}?`}
        description="They disappear from the pricing page. Anyone already on them keeps their plan until their subscription ends."
        confirmLabel="Archive plans"
        loading={massArchiving}
        onConfirm={confirmMassArchive}
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
    </>
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
  const nameInputRef = React.useRef<HTMLInputElement>(null)

  // What the window opened with, so closing it can tell real edits from a
  // window that was only looked at.
  const [openedWith] = React.useState(draft)
  const dirty = (Object.keys(draft) as Array<keyof PlanDraft>).some(
    (field) => draft[field] !== openedWith[field]
  )

  const update = React.useCallback(
    <Key extends keyof PlanDraft>(key: Key, value: PlanDraft[Key]) => {
      setDraft((current) => ({ ...current, [key]: value }))
    },
    []
  )

  const handleSave = React.useCallback(async () => {
    dismissErrorToast()

    if (!draft.name.trim()) {
      showErrorToast("Plan name is required.")
      return
    }
    if (!draft.slug.trim()) {
      showErrorToast("Plan short id is required.")
      return
    }

    let features: PlanFeatures
    try {
      features = parseFeatures(draft.features)
    } catch {
      showErrorToast(getPlanErrorMessage(new Error("FEATURES_INVALID")))
      return
    }

    // The AI allowance field writes the same features key it was read from.
    // A filled field wins over anything typed into the JSON; an empty field
    // leaves the JSON alone, so the escape hatch still works.
    const aiText = draft.aiDollars.trim()
    if (aiText !== "") {
      const aiValue = Number(aiText)
      if (!Number.isFinite(aiValue) || aiValue < 0) {
        showErrorToast("The AI allowance must be a dollar amount, 0 or more.")
        return
      }
      features = { ...features, [AI_ALLOWANCE_FEATURE_KEY]: aiValue }
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
    // A save in flight holds the window open, and typed edits are asked about
    // before the X, the overlay or Escape can throw them away.
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          // A new plan opens with the cursor in Name so you can just type.
          // Editing an existing one keeps the window's normal focus, since
          // landing in a filled field invites a stray edit.
          onOpenAutoFocus={(event) => {
            if (plan) return
            event.preventDefault()
            nameInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{plan ? "Edit plan" : "New plan"}</DialogTitle>
            <DialogDescription>
              Prices are shown to people exactly as entered here. Stripe price ids
              decide what they are actually charged.
            </DialogDescription>
          </DialogHeader>
          {/* Enter from any of the text fields saves. None of them is a
              `type="number"` box, so there is no spinner for Enter to disturb. */}
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
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
                      ref={nameInputRef}
                      value={draft.name}
                      onChange={(event) => update("name", event.target.value)}
                      aria-invalid={!draft.name.trim() || undefined}
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
                      aria-invalid={!draft.slug.trim() || undefined}
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
                      placeholder="price_…"
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
                      placeholder="price_…"
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
                <Field
                  label="AI allowance ($ a month)"
                  htmlFor="plan-ai-dollars"
                  help="Empty means no ceiling. 0 means this plan gets no AI at all."
                >
                  <Input
                    id="plan-ai-dollars"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="No ceiling"
                    value={draft.aiDollars}
                    onChange={(event) => update("aiDollars", event.target.value)}
                  />
                </Field>
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
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {plan ? "Save changes" : "Create plan"}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
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
  // The AI allowance gets its own field, so a number under its key comes out
  // of the JSON and into that field. Anything else under the key is left in
  // the JSON where it can be seen and fixed.
  const { [AI_ALLOWANCE_FEATURE_KEY]: aiValue, ...otherFeatures } =
    plan.features
  const aiIsNumber =
    typeof aiValue === "number" && Number.isFinite(aiValue) && aiValue >= 0

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
    aiDollars: aiIsNumber ? aiValue.toString() : "",
    features: JSON.stringify(
      aiIsNumber ? otherFeatures : plan.features,
      null,
      2
    ),
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
