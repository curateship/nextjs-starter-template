import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PhoneActionsPanel } from "@/components/phones/phone-actions-panel"
import { PhoneHealthPanel } from "@/components/phones/phone-health-panel"
import { PhoneHistoryPanel } from "@/components/phones/phone-history-panel"
import { PhoneSetupPanel } from "@/components/phones/phone-setup-panel"
import { PhoneStatusText } from "@/components/phones/phone-status"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  getPhoneErrorMessage,
  savePhone,
  type PhoneRecord,
  type PhonesPage,
} from "@/lib/api/phones/phones"
import { NONE } from "@/lib/browser/sorting"
import { signedInWords } from "@/lib/browser/wording"
import type { PhoneConnection } from "@/lib/phones/options"
import { showErrorToast } from "@/lib/toast/error-toast"

type Form = {
  name: string
  model: string
  androidVersion: string
  serial: string
  simCarrier: string
  simNumber: string
  connection: PhoneConnection
  proxyId: string
  notes: string
  folderId: string
  labelId: string
  tags: string
  shelfSlot: string
}

function formFrom(phone: PhoneRecord | null): Form {
  return {
    name: phone?.name ?? "",
    model: phone?.model ?? "",
    androidVersion: phone?.androidVersion ?? "",
    serial: phone?.serial ?? "",
    simCarrier: phone?.simCarrier ?? "",
    simNumber: phone?.simNumber ?? "",
    connection: phone?.connection ?? "sim",
    proxyId: phone?.proxy?.id ?? NONE,
    notes: phone?.notes ?? "",
    folderId: phone?.folderId ?? NONE,
    labelId: phone?.labelId ?? NONE,
    tags: phone?.tags.join(", ") ?? "",
    shelfSlot: phone?.shelfSlot ?? "",
  }
}

const orNull = (value: string) => (value === NONE ? null : value)

type Tab = "settings" | "setup" | "health" | "actions" | "history"

/**
 * One phone, as a window over the list: its settings, its setup (the setup
 * check, what the platform sees, and wiping), its health (battery,
 * heat, storage, signal, the four-week chart and its app versions), its
 * actions with a picture of each step, and its history. A new phone has only
 * the settings: the rest need the rack to have seen it.
 *
 * The model, Android version and serial fill in by themselves when the phone
 * is plugged into the rack. Typing the serial by hand ties a record made
 * here to the phone when it is plugged in later.
 */
export function PhoneDialog({
  open,
  phone,
  page,
  onDelete,
  onClose,
  onSaved,
  onChanged,
}: {
  open: boolean
  /** Null to add one by hand. */
  phone: PhoneRecord | null
  page: PhonesPage
  onDelete: (phone: PhoneRecord) => void
  onClose: () => void
  onSaved: (id: string) => Promise<void>
  /** Something changed behind the window without a save: a check finished. */
  onChanged: () => Promise<void>
}) {
  // What the window opened with. The dashboard reads the list again every 10
  // seconds, so comparing against the newest copy would call a window nobody
  // touched "changed" whenever the rack updated the phone.
  const [initial] = React.useState(() => formFrom(phone))
  const [form, setForm] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [tab, setTab] = React.useState<Tab>("settings")
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  async function save() {
    if (!form.name.trim()) {
      setNameInvalid(true)
      setTab("settings")
      showErrorToast("Give the phone a name first.")
      return
    }
    setSaving(true)
    try {
      const { id } = await savePhone(phone?.id ?? null, {
        name: form.name,
        model: form.model,
        androidVersion: form.androidVersion,
        serial: form.serial,
        simCarrier: form.simCarrier,
        simNumber: form.simNumber,
        connection: form.connection,
        proxyId: form.connection === "wifi" ? orNull(form.proxyId) : null,
        notes: form.notes,
        folderId: orNull(form.folderId),
        labelId: orNull(form.labelId),
        tags: form.tags.split(","),
        shelfSlot: form.shelfSlot,
      })
      toast.success(phone ? "Phone saved." : "Phone added.")
      await onSaved(id)
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="h-[48rem]">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as Tab)}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <DialogTitle>{phone ? phone.name : "New phone"}</DialogTitle>
                {phone ? (
                  <TabsList>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                    <TabsTrigger value="setup">Setup</TabsTrigger>
                    <TabsTrigger value="health">Health</TabsTrigger>
                    <TabsTrigger value="actions">Actions</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>
                ) : null}
              </div>
              <DialogDescription>
                A real Android phone on the rack. A Reddit account runs on it in place of a
                browser profile, picked on the Reddit accounts dashboard.
              </DialogDescription>
            </DialogHeader>

            <form
              id="phone-form"
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <DialogBody>
                <TabsContent value="settings" className="min-w-0" forceMount hidden={tab !== "settings"}>
                  <div className="grid gap-6">
                    <Card size="sm">
                      <CardHeader>
                        <CardTitle>The phone</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        {phone ? <PhoneStatusText phone={phone} /> : null}
                        <div className="grid gap-2">
                          <Label htmlFor="phone-name">Name</Label>
                          <Input
                            id="phone-name"
                            value={form.name}
                            placeholder="Pixel 8a"
                            aria-invalid={nameInvalid || undefined}
                            onChange={(event) => {
                              set("name", event.target.value)
                              setNameInvalid(false)
                            }}
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor="phone-model">Model</Label>
                            <Input id="phone-model" value={form.model} onChange={(event) => set("model", event.target.value)} />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="phone-android">Android version</Label>
                            <Input
                              id="phone-android"
                              value={form.androidVersion}
                              onChange={(event) => set("androidVersion", event.target.value)}
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="phone-serial">Serial number</Label>
                          <Input
                            id="phone-serial"
                            value={form.serial}
                            placeholder="Filled in when the rack sees it"
                            onChange={(event) => set("serial", event.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="phone-notes">Notes</Label>
                          <Textarea
                            id="phone-notes"
                            rows={1}
                            value={form.notes}
                            onChange={(event) => set("notes", event.target.value)}
                          />
                        </div>
                        {phone ? (
                          <p className="text-sm text-muted-foreground">
                            {phone.accounts.length
                              ? `On it: ${phone.accounts.map(signedInWords).join(", ")}.`
                              : "No account runs on it yet."}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card size="sm">
                      <CardHeader>
                        <CardTitle>Where it sits</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor="phone-slot">Shelf slot</Label>
                            <Input
                              id="phone-slot"
                              value={form.shelfSlot}
                              placeholder="4"
                              onChange={(event) => set("shelfSlot", event.target.value)}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="phone-usb">USB port</Label>
                            <Input id="phone-usb" value={phone?.usbPort || "Not plugged in yet"} readOnly disabled />
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Type the slot once. The rack fills in the USB port, and moving the cable
                          updates it by itself.
                        </p>
                      </CardContent>
                    </Card>

                    <Card size="sm">
                      <CardHeader>
                        <CardTitle>How it goes online</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="phone-connection">Connection</Label>
                          <Select
                            value={form.connection}
                            onValueChange={(value) => set("connection", value as PhoneConnection)}
                          >
                            <SelectTrigger id="phone-connection" className="w-full sm:w-fit sm:min-w-64">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sim">Its own SIM</SelectItem>
                              <SelectItem value="wifi">The house Wi-Fi</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {form.connection === "sim" ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                              <Label htmlFor="phone-carrier">SIM carrier</Label>
                              <Input
                                id="phone-carrier"
                                value={form.simCarrier}
                                placeholder="Mint Mobile"
                                onChange={(event) => set("simCarrier", event.target.value)}
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="phone-number">SIM number</Label>
                              <Input
                                id="phone-number"
                                value={form.simNumber}
                                inputMode="tel"
                                onChange={(event) => set("simNumber", event.target.value)}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-2">
                            <Label htmlFor="phone-proxy">Goes out through</Label>
                            <Select value={form.proxyId} onValueChange={(value) => set("proxyId", value)}>
                              <SelectTrigger id="phone-proxy" className="w-full sm:w-fit sm:min-w-64">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>The house&apos;s own address</SelectItem>
                                {page.proxies.map((proxy) => (
                                  <SelectItem key={proxy.id} value={proxy.id}>
                                    {proxy.label || proxy.host}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card size="sm">
                      <CardHeader>
                        <CardTitle>Sorting</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor="phone-folder">Folder</Label>
                            <Select value={form.folderId} onValueChange={(value) => set("folderId", value)}>
                              <SelectTrigger id="phone-folder" className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>No folder</SelectItem>
                                {page.folders.map((folder) => (
                                  <SelectItem key={folder.id} value={folder.id}>
                                    {folder.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="phone-label">Label</Label>
                            <Select value={form.labelId} onValueChange={(value) => set("labelId", value)}>
                              <SelectTrigger id="phone-label" className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>No label</SelectItem>
                                {page.labels.map((label) => (
                                  <SelectItem key={label.id} value={label.id}>
                                    {label.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="phone-tags">Tags, with commas between them</Label>
                          <Input
                            id="phone-tags"
                            value={form.tags}
                            placeholder="important, us-east"
                            onChange={(event) => set("tags", event.target.value)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                {phone ? (
                  <>
                    <TabsContent value="setup" className="min-w-0">
                      {tab === "setup" ? <PhoneSetupPanel phone={phone} onChanged={onChanged} /> : null}
                    </TabsContent>
                    <TabsContent value="health" className="min-w-0">
                      {tab === "health" ? <PhoneHealthPanel phone={phone} /> : null}
                    </TabsContent>
                    <TabsContent value="actions" className="min-w-0">
                      {tab === "actions" ? <PhoneActionsPanel phone={phone} onChanged={onChanged} /> : null}
                    </TabsContent>
                    <TabsContent value="history" className="min-w-0">
                      {tab === "history" ? <PhoneHistoryPanel phoneId={phone.id} /> : null}
                    </TabsContent>
                  </>
                ) : null}
              </DialogBody>
            </form>

            <DialogFooter>
              {phone ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={saving}
                  onClick={() => onDelete(phone)}
                >
                  <Trash2Icon />
                  Delete
                </Button>
              ) : null}
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" form="phone-form" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {phone ? "Save changes" : "Create phone"}
              </Button>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      )}
    </FormDialog>
  )
}
