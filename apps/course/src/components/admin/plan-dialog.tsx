import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import {
  archiveAdminPlan,
  createAdminPlan,
  getPlanErrorMessage,
  updateAdminPlan,
  type AdminPlan,
} from "@/lib/api/billing/admin-plans"
import { AI_ALLOWANCE_FEATURE_KEY } from "@/lib/ai/ai-models"
import type { PlanFeatures } from "@/lib/billing/plan-features"

/**
 * The window a plan is made and changed in: its name, prices, Stripe price
 * ids, allowance and pricing page options. Opened from the Admin dashboard's
 * Plans tab in the left panel's ⋮ and from its Plans block (Tyler, 8 Nov 2026:
 * "The plans doesnt need a full table"). Archive lives here too, at the foot
 * of a plan that can be archived.
 */

function planArchiveReason(plan: AdminPlan) {
  return plan.isDefault
    ? "This is the default plan, which everyone falls back to. Make another plan the default first."
    : "This plan is already archived."
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
  usageMeter: string
  trialDays: string
  /** Dollars of AI a month, its own field so nobody has to hand-edit JSON. */
  aiDollars: string
  features: string
  isDefault: boolean
  isPublic: boolean
  sortOrder: string
  highlightBadgeText: string
  checkoutButtonText: string
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
  usageMeter: "",
  trialDays: "0",
  aiDollars: "",
  features: "{}",
  isDefault: false,
  isPublic: true,
  sortOrder: "0",
  highlightBadgeText: "",
  checkoutButtonText: "",
  active: true,
}


export function PlanDialog({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean
  plan: AdminPlan | null
  onClose: () => void
  /** After a save or an archive, with the window already closing. */
  onSaved: () => Promise<void>
}) {
  const [archiveOpen, setArchiveOpen] = React.useState(false)
  const [archiving, setArchiving] = React.useState(false)
  // Mounted fresh per plan by its key in the parent, so the draft starts from
  // the right plan without an effect resetting it after the first render.
  const [draft, setDraft] = React.useState<PlanDraft>(() =>
    plan ? toDraft(plan) : emptyDraft
  )
  const [saving, setSaving] = React.useState(false)
  const [nameTouched, setNameTouched] = React.useState(false)
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)
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
    setAttempted(true)

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
      usageMeter: draft.usageMeter.trim() || null,
      trialDays: Number.parseInt(draft.trialDays || "0", 10) || 0,
      features,
      isDefault: draft.isDefault,
      isPublic: draft.isPublic,
      sortOrder: Number.parseInt(draft.sortOrder || "0", 10) || 0,
      highlightBadgeText: draft.highlightBadgeText.trim() || null,
      checkoutButtonText: draft.checkoutButtonText.trim() || null,
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
                <CardTitle>Pricing page</CardTitle>
                <CardDescription>
                  Highlight one plan to help people choose. Leave either field empty
                  to keep the usual pricing card.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Highlight badge"
                  htmlFor="plan-highlight-badge"
                  help="Only one plan can have a badge at a time. For example: Most popular."
                >
                  <Input
                    id="plan-highlight-badge"
                    maxLength={50}
                    placeholder="Most popular"
                    value={draft.highlightBadgeText}
                    onChange={(event) =>
                      update("highlightBadgeText", event.target.value)
                    }
                  />
                </Field>
                <Field
                  label="Checkout button text"
                  htmlFor="plan-checkout-button-text"
                  help="Shown only on this plan's available checkout button."
                >
                  <Input
                    id="plan-checkout-button-text"
                    maxLength={60}
                    placeholder="Use the usual button text"
                    value={draft.checkoutButtonText}
                    onChange={(event) =>
                      update("checkoutButtonText", event.target.value)
                    }
                  />
                </Field>
              </CardContent>
            </Card>

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
                      onBlur={() => setNameTouched(true)}
                      aria-invalid={
                        (!draft.name.trim() && (nameTouched || attempted)) ||
                        undefined
                      }
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
                      onBlur={() => setSlugTouched(true)}
                      aria-invalid={
                        (!draft.slug.trim() && (slugTouched || attempted)) ||
                        undefined
                      }
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
                  label="Stripe meter event name"
                  htmlFor="plan-usage-meter"
                  help="Leave empty for a fixed recurring price. For usage pricing, copy the event name from Stripe and keep its default customer and value payload keys."
                >
                  <Input
                    id="plan-usage-meter"
                    placeholder="api_requests"
                    value={draft.usageMeter}
                    onChange={(event) => update("usageMeter", event.target.value)}
                  />
                </Field>
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
            {plan ? (
              <DisabledReason disabled={plan.isDefault || !plan.active} reason={planArchiveReason(plan)}>
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto text-destructive hover:text-destructive"
                  disabled={saving || plan.isDefault || !plan.active}
                  onClick={() => setArchiveOpen(true)}
                >
                  Archive plan
                </Button>
              </DisabledReason>
            ) : null}
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
          {plan ? (
            <ConfirmDialog
              open={archiveOpen}
              onOpenChange={setArchiveOpen}
              title="Archive this plan?"
              description={`${plan.name} disappears from the pricing page. People already on it keep it until their subscription ends.`}
              confirmLabel="Archive plan"
              loading={archiving}
              onConfirm={async () => {
                setArchiving(true)
                try {
                  await archiveAdminPlan(plan.id)
                  toast.success("Plan archived.")
                  setArchiveOpen(false)
                  await onSaved()
                } catch (archiveError) {
                  showErrorToast(getPlanErrorMessage(archiveError))
                } finally {
                  setArchiving(false)
                }
              }}
            />
          ) : null}
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
    usageMeter: plan.usageMeter ?? "",
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
    highlightBadgeText: plan.highlightBadgeText ?? "",
    checkoutButtonText: plan.checkoutButtonText ?? "",
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
