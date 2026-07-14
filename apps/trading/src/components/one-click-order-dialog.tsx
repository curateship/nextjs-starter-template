import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  createOrderTemplate,
  getOrderTemplateErrorMessage,
  updateOrderTemplate,
  type OrderTemplateItem,
} from "@/lib/api/order-templates"

type Form = {
  name: string
  walletSizePct: string
  riskPct: string
  sizingMode: "wallet" | "risk"
  leverage: string
  stopLossPct: string
  takeProfitPct: string
  useLimitOrder: boolean
  isDefault: boolean
}

const emptyForm: Form = {
  name: "",
  walletSizePct: "10",
  riskPct: "1",
  sizingMode: "wallet",
  leverage: "5",
  stopLossPct: "2",
  takeProfitPct: "5",
  useLimitOrder: false,
  isDefault: false,
}

export function OneClickOrderDialog({
  open,
  template,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  template: OrderTemplateItem | null
  onOpenChange: (open: boolean) => void
  onSaved: (templates: OrderTemplateItem[]) => void
}) {
  const [form, setForm] = React.useState<Form>(() =>
    template
      ? {
          name: template.name,
          walletSizePct:
            template.sizingMode === "wallet"
              ? String(template.orderSizePct)
              : "10",
          riskPct:
            template.sizingMode === "risk"
              ? String(template.orderSizePct)
              : "1",
          sizingMode: template.sizingMode,
          leverage: String(template.leverage),
          stopLossPct: String(template.stopLossPct),
          takeProfitPct: String(template.takeProfitPct),
          useLimitOrder: template.useLimitOrder,
          isDefault: template.isDefault,
        }
      : emptyForm
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    const values = {
      name: form.name.trim(),
      orderSizePct: Number(
        form.sizingMode === "risk" ? form.riskPct : form.walletSizePct
      ),
      sizingMode: form.sizingMode,
      leverage: Number(form.leverage),
      stopLossPct: Number(form.stopLossPct),
      takeProfitPct: Number(form.takeProfitPct),
      useLimitOrder: form.useLimitOrder,
      isDefault: form.isDefault,
    }
    if (!values.name) {
      setError("Template name is required.")
      return
    }
    if (
      !(values.orderSizePct > 0 && values.orderSizePct <= 100) ||
      !(values.leverage >= 1 && Number.isInteger(values.leverage)) ||
      !(values.stopLossPct > 0 && values.stopLossPct < 100) ||
      !(values.takeProfitPct > 0 && values.takeProfitPct < 100)
    ) {
      setError("Enter valid percentages and a whole-number leverage.")
      return
    }

    setBusy(true)
    setError(null)
    try {
      const templates = template
        ? await updateOrderTemplate(template.id, values)
        : await createOrderTemplate(values)
      onSaved(templates)
      onOpenChange(false)
    } catch (error) {
      setError(getOrderTemplateErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function field(key: keyof Form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            {template ? "Edit order template" : "New order template"}
          </DialogTitle>
          <DialogDescription>
            Set the sizing, leverage, and protection used by one-click orders.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Order settings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TemplateField label="Name" id="template-name">
                <Input
                  id="template-name"
                  value={form.name}
                  maxLength={80}
                  disabled={busy}
                  placeholder="Balanced 5x"
                  onChange={(event) => field("name", event.target.value)}
                />
              </TemplateField>
              <TemplateField label="Leverage" id="template-leverage">
                <Input
                  id="template-leverage"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={form.leverage}
                  disabled={busy}
                  onChange={(event) => field("leverage", event.target.value)}
                />
              </TemplateField>
              <TemplateField
                label={
                  form.sizingMode === "risk"
                    ? "Stop loss (%) — required"
                    : "Stop loss (%)"
                }
                id="template-stop"
              >
                <Input
                  id="template-stop"
                  type="number"
                  min="0.01"
                  max="99.99"
                  step="0.01"
                  value={form.stopLossPct}
                  disabled={busy}
                  onChange={(event) => field("stopLossPct", event.target.value)}
                />
              </TemplateField>
              <TemplateField label="Take profit (%)" id="template-profit">
                <Input
                  id="template-profit"
                  type="number"
                  min="0.01"
                  max="99.99"
                  step="0.01"
                  value={form.takeProfitPct}
                  disabled={busy}
                  onChange={(event) =>
                    field("takeProfitPct", event.target.value)
                  }
                />
              </TemplateField>
              <div className="flex items-center gap-2 self-end pb-2">
                <Checkbox
                  id="template-limit"
                  checked={form.useLimitOrder}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    field("useLimitOrder", checked === true)
                  }
                />
                <Label htmlFor="template-limit">Use limit entry</Label>
              </div>
              {form.useLimitOrder ? (
                <p className="self-end pb-2 text-xs text-muted-foreground">
                  Right-click a chart price to place the complete order in one
                  click.
                </p>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="text-sm text-destructive sm:col-span-2"
                >
                  {error}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Sizing</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div
                className="flex items-center gap-4 sm:col-span-2"
                role="group"
                aria-label="Sizing method"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="template-sizing-wallet"
                    checked={form.sizingMode === "wallet"}
                    disabled={busy}
                    onCheckedChange={(checked) => {
                      if (checked === true) field("sizingMode", "wallet")
                    }}
                  />
                  <Label htmlFor="template-sizing-wallet">Wallet size</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="template-sizing-risk"
                    checked={form.sizingMode === "risk"}
                    disabled={busy}
                    onCheckedChange={(checked) => {
                      if (checked === true) field("sizingMode", "risk")
                    }}
                  />
                  <Label htmlFor="template-sizing-risk">Risk</Label>
                </div>
              </div>
              <TemplateField
                label={
                  form.sizingMode === "risk"
                    ? "Risk per wallet (%)"
                    : "Wallet size (%)"
                }
                id="template-size"
              >
                <Input
                  id="template-size"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={
                    form.sizingMode === "risk"
                      ? form.riskPct
                      : form.walletSizePct
                  }
                  disabled={busy}
                  onChange={(event) =>
                    field(
                      form.sizingMode === "risk" ? "riskPct" : "walletSizePct",
                      event.target.value
                    )
                  }
                />
              </TemplateField>
              {form.sizingMode === "risk" ? (
                <p className="self-end pb-2 text-xs text-muted-foreground">
                  Position size is recalculated from this amount and the stop
                  loss each time an order is placed.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {busy ? "Saving..." : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TemplateField({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
