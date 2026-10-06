import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { PROXY_KIND_LABELS, addressWords, namesList } from "@/lib/browser/wording"
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
  }
}

/**
 * Adding or editing one proxy, as a window over the list.
 *
 * The password box starts empty on an edit and only a typed password is sent,
 * so saving without retyping it keeps the stored one. The stored one never
 * comes back to the browser at all.
 */
export function ProxyDialog({
  open,
  proxy,
  testing,
  onTest,
  onDelete,
  onClose,
  onSaved,
}: {
  open: boolean
  /** Null to add a new one. */
  proxy: ProxyView | null
  testing: boolean
  onTest: (proxy: ProxyView) => void
  onDelete: (proxy: ProxyView) => void
  onClose: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const initial = React.useMemo(() => formFrom(proxy), [proxy])
  const [form, setForm] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  async function save() {
    const port = Number.parseInt(form.port, 10)
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
      })
      toast.success(proxy ? "Proxy saved." : "Proxy added.")
      await onSaved(id)
    } catch (error) {
      showErrorToast(getProxyErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{proxy ? "Edit proxy" : "Add proxy"}</DialogTitle>
            <DialogDescription>
              Browser profiles go out through the proxy they are given. A host
              that points back inside the network is refused.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
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
                    <div className="grid gap-4 sm:grid-cols-2">
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
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="grid gap-2 sm:col-span-2">
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
                    <div className="grid gap-4 sm:grid-cols-2">
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

                {proxy ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>How it is doing</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <ProxyTestBadge result={proxy.lastTestResult} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={testing}
                          onClick={() => onTest(proxy)}
                        >
                          {testing ? <Loader2Icon className="animate-spin" /> : null}
                          Test it
                        </Button>
                      </div>
                      <p className="text-muted-foreground">{addressWords(proxy.addresses)}</p>
                      <p className="text-muted-foreground">
                        {proxy.usedBy.length
                          ? `Used by ${namesList(proxy.usedBy.map((one) => one.name))}.`
                          : "No browser profile uses it yet."}
                      </p>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </DialogBody>
            <DialogFooter>
              {proxy ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={saving}
                  onClick={() => onDelete(proxy)}
                >
                  <Trash2Icon />
                  Delete
                </Button>
              ) : null}
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {proxy ? "Save changes" : "Create proxy"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
