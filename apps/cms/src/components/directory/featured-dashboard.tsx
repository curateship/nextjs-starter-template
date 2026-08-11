import * as React from "react"
import { CreditCardIcon, PlusIcon, SettingsIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getFeaturedErrorMessage,
  loadFeaturedAdmin,
  removeFeaturedPlan,
  revokeFeatured,
  saveFeaturedPlanAction,
  type FeaturedPlan,
} from "@/lib/api/directory/featured"
import { formatMoney } from "@/lib/format/money"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

type Overview = Awaited<ReturnType<typeof loadFeaturedAdmin>>

export function FeaturedDashboard({ data }: { data: Overview }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<FeaturedPlan | null | undefined>(undefined)
  const [deletePlan, setDeletePlan] = React.useState<FeaturedPlan | null>(null)
  const [revoke, setRevoke] = React.useState<Overview["entitlements"][number] | null>(null)
  const [run, busy] = useAsyncAction(getFeaturedErrorMessage)

  return (
    <>
      <div className="grid gap-2 md:grid-cols-3 md:gap-3">
        <Card>
          <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
          <CardContent className="grid gap-1">
            {data.revenue.length ? data.revenue.map((row) => (
              <p key={row.currency} className="text-xl font-semibold">
                {formatMoney(row.amount, row.currency)}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{row.purchases} purchases</span>
              </p>
            )) : <p className="text-sm text-muted-foreground">No purchases yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Active now</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">
            {data.entitlements.filter((row) => row.status === "active").length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Plans offered</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">
            {data.plans.filter((plan) => plan.active).length}
          </CardContent>
        </Card>
      </div>

      <DashboardTable
        title="Featured plans"
        icon={<CreditCardIcon className="text-muted-foreground" />}
        count={data.plans.length}
        controls={
          <DashboardToolbarButton type="button" onClick={() => setEditing(null)}>
            <PlusIcon /> New plan
          </DashboardToolbarButton>
        }
        header={
          <TableHeader><TableRow>
            <TableHead column="main">Plan</TableHead>
            <TableHead column="meta">Price</TableHead>
            <TableHead column="meta">Period</TableHead>
            <TableHead column="meta">Status</TableHead>
            <TableHead column="meta">Actions</TableHead>
          </TableRow></TableHeader>
        }
        isEmpty={data.plans.length === 0}
        emptyText="No featured plans yet. Create the first one."
        emptyColSpan={5}
        footer={{ type: "summary", count: data.plans.length, label: "plans" }}
      >
        {data.plans.map((plan) => (
          <TableRow key={plan.id} rowAction={() => setEditing(plan)}>
            <TableCell column="main">
              <button type="button" className="font-medium hover:underline" onClick={() => setEditing(plan)}>{plan.name}</button>
              {plan.description ? <span className="block max-w-96 truncate text-xs text-muted-foreground">{plan.description}</span> : null}
            </TableCell>
            <TableCell column="meta">{formatMoney(plan.priceCents, plan.currency)}</TableCell>
            <TableCell column="meta">{plan.durationDays} days</TableCell>
            <TableCell column="meta"><Badge variant={plan.active ? "secondary" : "outline"}>{plan.active ? "Active" : "Archived"}</Badge></TableCell>
            <TableCell column="actions"><div className="flex items-center">
              <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${plan.name}`} onClick={() => setEditing(plan)}><SettingsIcon /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${plan.name}`} onClick={() => setDeletePlan(plan)}><Trash2Icon /></Button>
            </div></TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <DashboardTable
        title="Featured placements"
        icon={<SparklesIcon className="text-muted-foreground" />}
        count={data.entitlements.length}
        header={
          <TableHeader><TableRow>
            <TableHead column="main">Listing</TableHead>
            <TableHead column="meta">Plan</TableHead>
            <TableHead column="meta">Paid</TableHead>
            <TableHead column="meta">Ends</TableHead>
            <TableHead column="meta">Status</TableHead>
            <TableHead column="meta">Actions</TableHead>
          </TableRow></TableHeader>
        }
        isEmpty={data.entitlements.length === 0}
        emptyText="No featured placement has been purchased yet."
        emptyColSpan={6}
        footer={{ type: "summary", count: data.entitlements.length, label: "placements" }}
      >
        {data.entitlements.map((item) => (
          <TableRow key={item.id}>
            <TableCell column="main"><span className="font-medium">{item.listingTitle}</span><span className="block text-xs text-muted-foreground">{item.buyerEmail}</span></TableCell>
            <TableCell column="meta">{item.planName}</TableCell>
            <TableCell column="meta">{formatMoney(item.amountTotal, item.currency)}</TableCell>
            <TableCell column="meta">{formatDate(item.endsAt)}</TableCell>
            <TableCell column="meta"><Badge variant={item.status === "active" ? "secondary" : "outline"}>{item.status}</Badge></TableCell>
            <TableCell column="actions">
              {item.status === "active" ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setRevoke(item)}>Revoke</Button> : null}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <FeaturedPlanDialog plan={editing} onClose={() => setEditing(undefined)} onSaved={() => void router.invalidate()} />
      <ConfirmDialog
        open={Boolean(deletePlan)}
        onOpenChange={(open) => { if (!open) setDeletePlan(null) }}
        title="Delete this featured plan?"
        description="A plan with purchases cannot be deleted. Archive it from Edit instead."
        confirmLabel="Delete plan"
        loading={busy}
        onConfirm={() => void run(async () => {
          await removeFeaturedPlan(deletePlan!.id)
          setDeletePlan(null)
          await router.invalidate()
          toast.success("Featured plan deleted.")
        })}
      />
      <ConfirmDialog
        open={Boolean(revoke)}
        onOpenChange={(open) => { if (!open) setRevoke(null) }}
        title="Revoke this placement?"
        description="The Featured badge and priority stop immediately. This does not refund the Stripe payment."
        confirmLabel="Revoke placement"
        loading={busy}
        onConfirm={() => void run(async () => {
          await revokeFeatured(revoke!.id)
          setRevoke(null)
          await router.invalidate()
          toast.success("Featured placement revoked.")
        })}
      />
    </>
  )
}

function FeaturedPlanDialog({
  plan,
  onClose,
  onSaved,
}: {
  plan: FeaturedPlan | null | undefined
  onClose: () => void
  onSaved: () => void
}) {
  const open = plan !== undefined
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [price, setPrice] = React.useState("")
  const [currency, setCurrency] = React.useState("usd")
  const [days, setDays] = React.useState("")
  const [priority, setPriority] = React.useState("0")
  const [active, setActive] = React.useState(true)
  const [attempted, setAttempted] = React.useState(false)
  const [loaded, setLoaded] = React.useState<string | null>(null)
  const [run, busy] = useAsyncAction(getFeaturedErrorMessage)
  const stamp = plan?.id ?? (open ? "new" : null)
  if (stamp !== loaded) {
    setLoaded(stamp)
    setName(plan?.name ?? "")
    setDescription(plan?.description ?? "")
    setPrice(plan ? String(plan.priceCents / 100) : "")
    setCurrency(plan?.currency ?? "usd")
    setDays(plan ? String(plan.durationDays) : "")
    setPriority(plan ? String(plan.priority) : "0")
    setActive(plan?.active ?? true)
    setAttempted(false)
  }
  const dollars = Number(price)
  const duration = Number(days)
  const rank = Number(priority)
  const nameInvalid = !name.trim()
  const priceInvalid =
    !/^\d+(?:\.\d{1,2})?$/.test(price.trim()) ||
    !Number.isFinite(dollars) ||
    dollars <= 0 ||
    dollars > 1_000_000
  const currencyInvalid = !/^[a-zA-Z]{3}$/.test(currency.trim())
  const daysInvalid =
    !Number.isInteger(duration) || duration < 1 || duration > 3650
  const priorityInvalid =
    !Number.isInteger(rank) || rank < -10_000 || rank > 10_000
  const dirty = open && (
    name !== (plan?.name ?? "") || description !== (plan?.description ?? "") ||
    price !== (plan ? String(plan.priceCents / 100) : "") || currency !== (plan?.currency ?? "usd") ||
    days !== (plan ? String(plan.durationDays) : "") || priority !== (plan ? String(plan.priority) : "0") || active !== (plan?.active ?? true)
  )

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{plan ? "Edit featured plan" : "New featured plan"}</DialogTitle>
          <DialogDescription>The saved price is the only price sent to Stripe.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm"><CardHeader><CardTitle>Plan</CardTitle></CardHeader><CardContent className="grid gap-4">
            <div className="grid gap-2"><FieldLabel htmlFor="featured-plan-name">Name</FieldLabel><Input id="featured-plan-name" maxLength={120} aria-invalid={attempted && nameInvalid} value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="grid gap-2"><FieldLabel htmlFor="featured-plan-description">Description</FieldLabel><Textarea id="featured-plan-description" rows={1} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><FieldLabel htmlFor="featured-plan-price">Price</FieldLabel><Input id="featured-plan-price" inputMode="decimal" aria-invalid={attempted && priceInvalid} value={price} onChange={(event) => setPrice(event.target.value)} /></div>
              <div className="grid gap-2"><FieldLabel htmlFor="featured-plan-currency">Currency</FieldLabel><Input id="featured-plan-currency" maxLength={3} aria-invalid={attempted && currencyInvalid} value={currency} onChange={(event) => setCurrency(event.target.value)} /></div>
              <div className="grid gap-2"><FieldLabel htmlFor="featured-plan-days">Days</FieldLabel><Input id="featured-plan-days" inputMode="numeric" aria-invalid={attempted && daysInvalid} value={days} onChange={(event) => setDays(event.target.value)} /></div>
              <div className="grid gap-2"><FieldLabel htmlFor="featured-plan-priority" hint="Higher plans appear before lower plans.">Priority</FieldLabel><Input id="featured-plan-priority" inputMode="numeric" aria-invalid={attempted && priorityInvalid} value={priority} onChange={(event) => setPriority(event.target.value)} /></div>
            </div>
            <label className="flex items-center gap-2"><Checkbox checked={active} onCheckedChange={(checked) => setActive(checked === true)} />Offer this plan</label>
          </CardContent></Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button>
          <Button type="button" disabled={busy} onClick={() => void run(async () => {
            setAttempted(true)
            if (nameInvalid || priceInvalid || currencyInvalid || daysInvalid || priorityInvalid) {
              throw new Error("Check the name, price, days, and priority.")
            }
            await saveFeaturedPlanAction({
              id: plan?.id,
              name,
              description,
              priceCents: Math.round(dollars * 100),
              currency,
              durationDays: duration,
              priority: rank,
              active,
            })
            onClose()
            onSaved()
            toast.success(plan ? "Featured plan saved." : "Featured plan created.")
          })}>{plan ? "Save changes" : "Create plan"}</Button>
        </DialogFooter>
      </DialogContent>}
    </FormDialog>
  )
}
