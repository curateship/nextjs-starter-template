import * as React from "react"
import { format } from "date-fns"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getProxyErrorMessage,
  saveProxy,
  type ProxyView,
} from "@/lib/api/browser/proxies"
import { PROXY_KIND_LABELS } from "@/lib/browser/wording"
import { PROXY_KINDS, PROXY_PROTOCOLS, type ProxyKind, type ProxyProtocol } from "@/lib/social/options"
import { showErrorToast } from "@/lib/toast/error-toast"

type Form = {
  label: string
  kind: ProxyKind
  protocol: ProxyProtocol
  host: string
  port: string
  username: string
  password: string
  /** Dollars a month as typed, or "". */
  monthlyCost: string
  /** "2026-11-03", or "". */
  renewsOn: string
}

function formFrom(proxy: ProxyView | null): Form {
  return {
    label: proxy?.label ?? "",
    kind: proxy?.kind ?? "residential",
    protocol: proxy?.protocol ?? "http",
    host: proxy?.host ?? "",
    port: proxy ? String(proxy.port) : "",
    username: proxy?.username ?? "",
    password: "",
    monthlyCost: proxy?.monthlyCost === null || proxy?.monthlyCost === undefined ? "" : proxy.monthlyCost.toFixed(2),
    renewsOn: proxy?.renewsOn ?? "",
  }
}

/** The proxy form's state for one proxy, or for a new one, and its save. */
function useProxyForm(proxy: ProxyView | null) {
  const initial = React.useMemo(() => formFrom(proxy), [proxy])
  const [form, setForm] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }))

  const costText = form.monthlyCost.replace(/[$,\s]/g, "")
  const cost = costText ? Number(costText) : null
  const costInvalid = cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 100_000)

  /** Saves the form, answering with the proxy's id, or null when it was refused (the toast says why). */
  async function save(): Promise<string | null> {
    const port = Number.parseInt(form.port, 10)
    if (costInvalid) {
      showErrorToast("A proxy's monthly cost has to be an amount from 0 to 100000.")
      return null
    }
    setSaving(true)
    try {
      const { id } = await saveProxy(proxy?.id ?? null, {
        label: form.label,
        kind: form.kind,
        protocol: form.protocol,
        host: form.host,
        port: Number.isFinite(port) ? port : 0,
        username: form.username,
        // Left out when nothing was typed, so the stored password stays.
        ...(form.password ? { password: form.password } : {}),
        monthlyCost: cost,
        renewsOn: form.renewsOn || null,
      })
      return id
    } catch (error) {
      showErrorToast(getProxyErrorMessage(error))
      return null
    } finally {
      setSaving(false)
    }
  }

  return { form, set, dirty, saving, save, costInvalid, reset: () => setForm(initial) }
}

type ProxyForm = ReturnType<typeof useProxyForm>

/**
 * A proxy's fields: what to call it, its kind and protocol, where it is,
 * and what it costs. The password box starts empty on an edit and only a
 * typed password is sent, so saving without retyping it keeps the stored
 * one. The stored one never comes back to the browser at all.
 */
function ProxyFields({ form: { form, set, costInvalid }, proxy }: { form: ProxyForm; proxy: ProxyView | null }) {
  return (
    <div className="grid gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>The proxy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="proxy-label">What to call it</Label>
            <Input
              id="proxy-label"
              value={form.label}
              placeholder="US residential 3"
              onChange={(event) => set("label", event.target.value)}
            />
          </div>
          <div className="grid gap-4 @md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="proxy-kind">Kind</Label>
              <Select value={form.kind} onValueChange={(value) => set("kind", value as ProxyKind)}>
                <SelectTrigger id="proxy-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROXY_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {PROXY_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-protocol">Protocol</Label>
              <Select
                value={form.protocol}
                onValueChange={(value) => set("protocol", value as ProxyProtocol)}
              >
                <SelectTrigger id="proxy-protocol" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROXY_PROTOCOLS.map((protocol) => (
                    <SelectItem key={protocol} value={protocol}>
                      {protocol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Where it is</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 @md:grid-cols-3">
            <div className="grid gap-2 @md:col-span-2">
              <Label htmlFor="proxy-host">Host</Label>
              <Input
                id="proxy-host"
                value={form.host}
                placeholder="gate.example.com"
                onChange={(event) => set("host", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-port">Port</Label>
              <Input
                id="proxy-port"
                inputMode="numeric"
                value={form.port}
                placeholder="8080"
                onChange={(event) => set("port", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 @md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="proxy-username">Username</Label>
              <Input
                id="proxy-username"
                autoComplete="off"
                value={form.username}
                onChange={(event) => set("username", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-password">Password</Label>
              <Input
                id="proxy-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                placeholder={
                  proxy?.hasPassword ? "Stored. Type only to change it." : ""
                }
                onChange={(event) => set("password", event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>What it costs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 @md:grid-cols-2">
            <div className="grid gap-2">
              <FieldLabel htmlFor="proxy-cost" hint="In dollars. Leave it empty if you would rather not say.">
                A month
              </FieldLabel>
              <Input
                id="proxy-cost"
                inputMode="decimal"
                value={form.monthlyCost}
                placeholder="12.00"
                aria-invalid={costInvalid || undefined}
                onChange={(event) => set("monthlyCost", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="proxy-renews" hint="The bell rings three days before.">
                Renews on
              </FieldLabel>
              <DatePicker
                id="proxy-renews"
                placeholder="Not set"
                value={form.renewsOn ? new Date(`${form.renewsOn}T00:00:00`) : undefined}
                onChange={(date) => set("renewsOn", date ? format(date, "yyyy-MM-dd") : "")}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * A new proxy, as a window over the Anti Detect dashboard's Proxies. A proxy
 * that exists opens on the right instead (`ProxyRecord`).
 */
export function ProxyDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const proxyForm = useProxyForm(null)
  return (
    <FormDialog open={open} dirty={proxyForm.dirty} busy={proxyForm.saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Add proxy</DialogTitle>
            <DialogDescription>
              Browser profiles go out through the proxy they are given. A host that points back inside the network is
              refused.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault()
              const id = await proxyForm.save()
              if (id) await onSaved(id)
            }}
          >
            <DialogBody className="@container">
              <ProxyFields form={proxyForm} proxy={null} />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={proxyForm.saving} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={proxyForm.saving}>
                {proxyForm.saving ? <Loader2Icon className="animate-spin" /> : null}
                Create proxy
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
