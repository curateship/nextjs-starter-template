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
  orderSizePct: string
  leverage: string
  stopLossPct: string
  takeProfitPct: string
  isDefault: boolean
}

const emptyForm: Form = {
  name: "",
  orderSizePct: "10",
  leverage: "5",
  stopLossPct: "2",
  takeProfitPct: "5",
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
          orderSizePct: String(template.orderSizePct),
          leverage: String(template.leverage),
          stopLossPct: String(template.stopLossPct),
          takeProfitPct: String(template.takeProfitPct),
          isDefault: template.isDefault,
        }
      : emptyForm
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    const values = {
      name: form.name.trim(),
      orderSizePct: Number(form.orderSizePct),
      leverage: Number(form.leverage),
      stopLossPct: Number(form.stopLossPct),
      takeProfitPct: Number(form.takeProfitPct),
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
            Set the wallet share, leverage, and protection used by one-click
            orders.
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
              <TemplateField label="Wallet size (%)" id="template-size">
                <Input
                  id="template-size"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={form.orderSizePct}
                  disabled={busy}
                  onChange={(event) =>
                    field("orderSizePct", event.target.value)
                  }
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
              <TemplateField label="Stop loss (%)" id="template-stop">
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
                  id="template-default"
                  checked={form.isDefault}
                  disabled={busy || template?.isDefault}
                  onCheckedChange={(checked) =>
                    field("isDefault", checked === true)
                  }
                />
                <Label htmlFor="template-default">Make default</Label>
              </div>
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
