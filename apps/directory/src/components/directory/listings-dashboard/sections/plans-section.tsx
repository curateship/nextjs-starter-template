import * as React from "react"
import { CopyIcon, CreditCardIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { TextPickRow } from "@/components/crm/crm-record-menu"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import type { ListingsLoaded } from "@/components/directory/listings-dashboard/load-section"
import {
  AutoSaveWords,
  NoMatches,
  PickGroup,
  RecordMenu,
  useAutoSave,
  useOpenFirstRow,
  type SectionProps,
} from "@/components/directory/listings-dashboard/section-parts"
import { CharacterCount } from "@/components/shared/character-count"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { PickMenuRow } from "@/components/shared/notes/pick-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { batchOutcome } from "@/components/directory/listings-dashboard/batch-outcome"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type { Category } from "@/lib/api/directory/categories"
import {
  getFeaturedErrorMessage,
  removeFeaturedPlan,
  saveFeaturedPlanAction,
  type FeaturedPlan,
  type FeaturedPlanKind,
} from "@/lib/api/directory/featured"
import { categoryTreeOrder } from "@/lib/directory/category-tree"
import { formatMoney } from "@/lib/format/money"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"

type Data = Extract<ListingsLoaded, { section: "plans" }>

/** The Category value when a plan sells the whole directory. */
const WHOLE_DIRECTORY = "all"

/** What the plan sells the top of: the Events page, the whole directory, or one category. */
function planAudience(plan: FeaturedPlan) {
  if (plan.kind === "event") return "The Events page"
  if (!plan.categoryId) return "The whole directory"
  // The category was deleted after the plan was made, so nobody can buy it.
  return plan.categoryName ? plan.categoryName : "Category deleted"
}

/**
 * "2 of 3 spots taken" for a plan selling one category's spots, or how many
 * placements run on a plan with no limit (Tyler's polish pick, 18 Nov 2026:
 * "A featured plan row says \"2 of 3 spots taken\" instead of \"3 spots\"").
 */
function spotsText(plan: FeaturedPlan, taken: number) {
  if (plan.categoryId && plan.categorySpots) return `${taken} of ${plan.categorySpots} spots taken`
  return `${taken} running`
}

/**
 * The Featured plans row: what the site sells the top of its pages for. It
 * was the top table of the Featured page; its three figures are Overview
 * widgets now, and the placements sold are the Placements row.
 *
 * - **Header:** "N selected" (Delete), search, Select, New plan.
 * - **Rows:** price, spots taken, on sale or not; right-click holds Mass
 *   select, Duplicate and Delete.
 * - **Right:** the open plan, saving by itself; what it sells is fixed once
 *   made, so an earlier buyer's purchase never changes.
 */
export function PlansSection({ data, search, frame, onChanged }: SectionProps<Data>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const plans = data.featured.plans
  const taken = data.featured.spotsTaken
  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? plans.filter((plan) => `${plan.name} ${plan.description}`.toLowerCase().includes(needle)) : plans
  }, [plans, q])
  const ids = rows.map((plan) => plan.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openPlan = plans.find((plan) => plan.id === openId) ?? null
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [confirm, setConfirm] = React.useState<FeaturedPlan[] | null>(null)
  const [run, busy] = useAsyncAction(getFeaturedErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()
  useClearSelectionOnListChange(selection.setSelected, q)

  /** A copy to start from, off sale until it is checked. It opens on the right. */
  const duplicate = (plan: FeaturedPlan) =>
    void run(async () => {
      const made = await saveFeaturedPlanAction({
        kind: plan.kind,
        name: `${plan.name} copy`.slice(0, 120),
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        durationDays: plan.durationDays,
        categoryId: plan.categoryId,
        categorySpots: plan.categorySpots,
        priority: plan.priority,
        active: false,
      })
      await onChanged()
      setOpen(made.id)
    })

  const actionsFor = (plan: FeaturedPlan): RowMenuItem[] => [
    { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => duplicate(plan) },
    { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setConfirm([plan]) },
  ]
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }
  const ticked = plans.filter((plan) => selection.selected.has(plan.id))
  const rightClicked = rightClick ? plans.find((plan) => plan.id === rightClick.id) : undefined

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={CreditCardIcon} label="Featured plans" />}
        end={<PanelReopenButton side="right" label="Show the plan" />}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  className="text-destructive"
                  onClick={() => {
                    menu.close()
                    setConfirm(ticked)
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for featured plans"
        search={{
          name: "plan-search",
          label: "Search plans",
          placeholder: "Search plans",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        primary={
          <NewPlanDropdown
            onCreated={async (id) => {
              await onChanged()
              setOpen(id)
            }}
          />
        }
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Plan", column: "main", className: "min-w-40", sortable: false },
          { key: "price", label: "Price", column: "meta", sortable: false },
          { key: "spots", label: "Spots", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
          { key: "status", label: "On sale", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? { noun: "plans", disabled: ids.length === 0, checked: selection.selectAllState(ids), onToggle: () => selection.toggleVisible(ids) }
            : null
        }
        empty={
          rows.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="plans" onClear={() => setListSearch({ q: undefined })} />
          ) : (
            "No featured plans yet. Make the first one with New plan."
          )
        }
      >
        {rows.map((plan) => (
          <CrmTableRow
            key={plan.id}
            open={plan.id === openId}
            label={plan.name}
            tick={{ shown: massSelect, ticked: selection.selected.has(plan.id), onToggle: () => selection.toggle(plan.id) }}
            onOpen={() => {
              setPressedId(plan.id)
              setOpen(plan.id)
            }}
            onDelete={() => setConfirm([plan])}
            onRightClick={(x, y) => setRightClick({ id: plan.id, x, y })}
          >
            <MainCell name={plan.name} line={planAudience(plan)} />
            <TableCell column="mutedMeta" className="tabular-nums">
              {formatMoney(plan.priceCents, plan.currency)}
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @xl:table-cell">
              <Chip muted>{spotsText(plan, taken[plan.id] ?? 0)}</Chip>
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @2xl:table-cell">
              <Chip muted>{plan.active ? "On sale" : "Off sale"}</Chip>
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={actionsFor(rightClicked)}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: q,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Plan",
      showLabel: "Show the plan",
      content: openPlan ? (
        <PlanRecord
          key={openPlan.id}
          plan={openPlan}
          taken={taken[openPlan.id] ?? 0}
          categories={data.categories}
          actions={actionsFor(openPlan)}
          busy={busy}
          onSaved={() => void onChanged()}
        />
      ) : (
        <EmptyRecord
          title="Plan"
          icon={<CreditCardIcon aria-hidden />}
          line={plans.length ? "Click a plan to see it here." : "Make a plan with New plan to see it here."}
          hideLabel="Hide the plan"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={confirm && confirm.length > 1 ? `Delete ${confirm.length} plans?` : "Delete this featured plan?"}
        description="A plan with purchases cannot be deleted. Take it off sale in its ⋮ instead."
        confirmLabel={confirm && confirm.length > 1 ? `Delete ${confirm.length} plans` : "Delete plan"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!confirm) return
            const refused: { row: (typeof confirm)[number]; error: unknown }[] = []
            for (const plan of confirm) {
              try {
                await removeFeaturedPlan(plan.id)
              } catch (error) {
                refused.push({ row: plan, error })
              }
            }
            const asked = confirm
            setConfirm(null)
            selection.setSelected(new Set(refused.map(({ row }) => row.id)))
            await onChanged()
            const problem = batchOutcome({ asked, refused, verb: "deleted", nameOf: (row) => row.name })
            if (problem) throw problem
          })
        }
      />
    ),
  })
}

/** What a plan's form holds and checks, shared by New plan and the plan's record. */
function readPlan(values: { price: string; currency: string; days: string; priority: string; spots: string; name: string }, kind: FeaturedPlanKind, forOneCategory: boolean) {
  const dollars = Number(values.price)
  const duration = Number(values.days)
  const rank = Number(values.priority)
  const places = Number(values.spots)
  const forEvents = kind === "event"
  const problem = !values.name.trim()
    ? "Give it a name to save"
    : !/^\d+(?:\.\d{1,2})?$/.test(values.price.trim()) || dollars <= 0 || dollars > 1_000_000
      ? "Fix the price to save"
      : !/^[a-zA-Z]{3}$/.test(values.currency.trim())
        ? "Fix the currency to save"
        : !forEvents && (!Number.isInteger(duration) || duration < 1 || duration > 3650)
          ? "Fix the days to save"
          : !Number.isInteger(rank) || rank < -10_000 || rank > 10_000
            ? "Fix the priority to save"
            : forOneCategory && (!Number.isInteger(places) || places < 1 || places > 100)
              ? "Fix the spots to save"
              : null
  return { problem, dollars, duration, rank, places, forEvents }
}

/** New plan: its name, what it is for, its price and its days, as a dropdown under its button. It opens on the right, off sale until checked. */
function NewPlanDropdown({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [kind, setKind] = React.useState<FeaturedPlanKind>("listing")
  const [price, setPrice] = React.useState("")
  const [days, setDays] = React.useState("30")
  const [run, saving] = useAsyncAction(getFeaturedErrorMessage)
  return (
    <NewRecordDropdown
      label="New plan"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create plan"
      busy={saving}
      onSubmit={() =>
        void run(async () => {
          const read = readPlan({ name, price, currency: "usd", days, priority: "0", spots: "3" }, kind, false)
          if (read.problem) throw new Error(read.problem.replace(" to save", " first."))
          const made = await saveFeaturedPlanAction({
            kind,
            name: name.trim(),
            priceCents: Math.round(read.dollars * 100),
            currency: "usd",
            durationDays: read.forEvents ? null : read.duration,
            active: false,
          })
          setName("")
          setPrice("")
          setOpen(false)
          await onCreated(made.id)
        })
      }
      trigger={
        <DashboardToolbarButton type="button" aria-label="New plan">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">New plan</span>
        </DashboardToolbarButton>
      }
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-plan-name">Name</FieldLabel>
        <Input id="new-plan-name" autoFocus maxLength={120} value={name} disabled={saving} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-plan-kind" hint="Set when the plan is made, so a plan never changes what an earlier buyer paid for.">
          For
        </FieldLabel>
        <Select value={kind} onValueChange={(value) => setKind(value as FeaturedPlanKind)}>
          <SelectTrigger id="new-plan-kind" className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="listing">Listings</SelectItem>
            <SelectItem value="event">Events</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <FieldLabel htmlFor="new-plan-price">Price</FieldLabel>
          <Input id="new-plan-price" inputMode="decimal" placeholder="49" value={price} disabled={saving} onChange={(event) => setPrice(event.target.value)} />
        </div>
        {kind === "event" ? null : (
          <div className="grid gap-2">
            <FieldLabel htmlFor="new-plan-days">Days</FieldLabel>
            <Input id="new-plan-days" inputMode="numeric" value={days} disabled={saving} onChange={(event) => setDays(event.target.value)} />
          </div>
        )}
      </div>
    </NewRecordDropdown>
  )
}

/** One plan on the right: its words, price and days saving by themselves; what it sells and whether it is on sale in the ⋮. */
function PlanRecord({
  plan,
  taken,
  categories,
  actions,
  busy,
  onSaved,
}: {
  plan: FeaturedPlan
  taken: number
  categories: Category[]
  actions: RowMenuItem[]
  busy: boolean
  onSaved: () => void
}) {
  const [name, setName] = React.useState(plan.name)
  const [description, setDescription] = React.useState(plan.description)
  const [price, setPrice] = React.useState(String(plan.priceCents / 100))
  const [currency, setCurrency] = React.useState(plan.currency)
  const [days, setDays] = React.useState(plan.durationDays ? String(plan.durationDays) : "")
  const [categoryId, setCategoryId] = React.useState(plan.categoryId ?? WHOLE_DIRECTORY)
  const [spots, setSpots] = React.useState(plan.categorySpots ? String(plan.categorySpots) : "3")
  const [priority, setPriority] = React.useState(String(plan.priority))
  const [active, setActive] = React.useState(plan.active)
  const forEvents = plan.kind === "event"
  const forOneCategory = !forEvents && categoryId !== WHOLE_DIRECTORY
  const read = readPlan({ name, price, currency, days, priority, spots }, plan.kind, forOneCategory)
  const treeRows = React.useMemo(() => categoryTreeOrder(categories), [categories])

  const auto = useAutoSave({
    value: { name, description, price, currency, days, categoryId, spots, priority, active },
    ready: !read.problem,
    message: getFeaturedErrorMessage,
    save: async () => {
      await saveFeaturedPlanAction({
        id: plan.id,
        kind: plan.kind,
        name,
        description,
        priceCents: Math.round(read.dollars * 100),
        currency,
        durationDays: forEvents ? null : read.duration,
        categoryId: forOneCategory ? categoryId : null,
        categorySpots: forOneCategory ? read.places : null,
        priority: forEvents ? 0 : read.rank,
        active,
      })
      onSaved()
    },
  })

  return (
    <RecordFrame
      avatar={<CreditCardIcon aria-hidden />}
      title={name.trim() || "Untitled plan"}
      line={`${active ? "On sale" : "Off sale"} · ${spotsText(plan, taken)}`}
      hideLabel="Hide the plan"
      actions={
        <RecordMenu
          label="Plan menu"
          groups={
            <PickGroup title="Plan">
              <PickMenuRow
                label="On sale"
                value={active ? "On sale" : "Off sale"}
                options={[
                  { value: "on", label: "On sale" },
                  { value: "off", label: "Off sale" },
                ]}
                selected={active ? "on" : "off"}
                onPick={(value) => setActive(value === "on")}
              />
              <PickMenuRow
                label="For"
                value={forEvents ? "Events" : "Listings"}
                disabled
                options={[]}
                selected={plan.kind}
                onPick={() => undefined}
              />
              {forEvents ? null : (
                <PickMenuRow
                  label="Top of"
                  value={categoryId === WHOLE_DIRECTORY ? "The whole directory" : (treeRows.find(({ category }) => category.id === categoryId)?.category.name ?? "Category deleted")}
                  options={[
                    { value: WHOLE_DIRECTORY, label: "The whole directory" },
                    ...treeRows.map(({ category, depth }) => ({ value: category.id, label: `${" ".repeat(depth * 2)}${category.name}` })),
                  ]}
                  selected={categoryId}
                  onPick={setCategoryId}
                />
              )}
              {forEvents ? null : <TextPickRow label="Priority" value={priority} inputMode="numeric" onCommit={setPriority} />}
            </PickGroup>
          }
          actions={actions.map((action) => ({ ...action, disabled: busy }))}
        />
      }
      body={
        <PanelCard storageId="featured-plan-basics" icon={<CreditCardIcon />} title="The plan" openWhen={Boolean(read.problem)}>
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">The saved price is the only price sent to Stripe.</p>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="featured-plan-name">Name</FieldLabel>
                <CharacterCount value={name} max={120} />
              </div>
              <Input id="featured-plan-name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="featured-plan-description">Description</FieldLabel>
                <CharacterCount value={description} max={500} />
              </div>
              <Textarea id="featured-plan-description" rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <FieldLabel htmlFor="featured-plan-price">Price</FieldLabel>
                <Input id="featured-plan-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="featured-plan-currency">Currency</FieldLabel>
                <Input id="featured-plan-currency" maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} />
              </div>
              {forEvents ? null : (
                <div className="grid gap-2">
                  <FieldLabel htmlFor="featured-plan-days">Days</FieldLabel>
                  <Input id="featured-plan-days" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} />
                </div>
              )}
              {forOneCategory ? (
                <div className="grid gap-2">
                  <FieldLabel htmlFor="featured-plan-spots" hint="How many listings can hold a paid spot on that category's page at once. First come, first served.">
                    Spots
                  </FieldLabel>
                  <Input id="featured-plan-spots" inputMode="numeric" value={spots} onChange={(event) => setSpots(event.target.value)} />
                </div>
              ) : null}
            </div>
            {forEvents ? (
              <p className="text-sm text-muted-foreground">
                An event's spot starts when the owner pays and ends when the event ends. Featured events sit soonest first among themselves.
              </p>
            ) : null}
          </div>
        </PanelCard>
      }
      footer={
        <>
          <FooterState>
            <AutoSaveWords state={auto.state} ready={!read.problem} why={read.problem ?? undefined} />
          </FooterState>
          {active ? (
            <Button type="button" variant="outline" onClick={() => setActive(false)}>
              Take off sale
            </Button>
          ) : (
            <Button type="button" onClick={() => setActive(true)}>
              Put on sale
            </Button>
          )}
        </>
      }
    />
  )
}
