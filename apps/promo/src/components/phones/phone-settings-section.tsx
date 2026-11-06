import * as React from "react"

import { PhoneStatusText } from "@/components/phones/phone-status"
import { usePromoSaveStatus } from "@/components/social/guest/guest-mode"
import { PanelCard } from "@/components/shared/panel-card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getPhoneErrorMessage,
  savePhoneFields,
  type PhoneFormInput,
  type PhoneRecord,
  type RackPage,
} from "@/lib/api/phones/phones"
import { bannedOnWords } from "@/lib/bans/options"
import { NONE } from "@/lib/browser/sorting"
import { signedInWords } from "@/lib/browser/wording"
import { formatTimeAgo } from "@/lib/format/format-time"
import { PHONE_KIND_WORDS, PHONE_KINDS, type PhoneConnection, type PhoneKind } from "@/lib/phones/options"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A typed field saves this long after the last letter, as every setting does. */
const SAVE_AFTER_MS = 700

type TextField = "name" | "model" | "androidVersion" | "serial" | "simCarrier" | "simNumber" | "notes" | "shelfSlot" | "tags"

/**
 * The phone's Settings, in its ⋮ on its rack's page (Racks dashboard, part 111):
 * every field saves itself, 700ms after the last letter, at once when it is
 * left, and a pick the moment it changes, with Saving… and Saved in the page
 * header. There is no Save button. Only the field that changed is sent, so
 * the rack's own readings, such as the system version, are never written
 * back from an older copy. A refused save keeps what was typed and says why.
 *
 * Keyed by the phone, so picking another phone starts from that phone's
 * values; the list's 10-second refresh never resets what is being typed.
 */
export function PhoneSettingsSection({
  phone,
  page,
  onSaved,
}: {
  phone: PhoneRecord
  page: Pick<RackPage, "folders" | "labels" | "proxies">
  onSaved: () => Promise<void>
}) {
  const setSaveStatus = usePromoSaveStatus()
  const [text, setText] = React.useState<Record<TextField, string>>(() => ({
    name: phone.name,
    model: phone.model,
    androidVersion: phone.androidVersion,
    serial: phone.serial,
    simCarrier: phone.simCarrier,
    simNumber: phone.simNumber,
    notes: phone.notes,
    shelfSlot: phone.shelfSlot,
    tags: phone.tags.join(", "),
  }))
  const [kind, setKind] = React.useState<PhoneKind>(phone.kind)
  const [connection, setConnection] = React.useState<PhoneConnection>(phone.connection)
  const [proxyId, setProxyId] = React.useState(phone.proxy?.id ?? NONE)
  const [folderId, setFolderId] = React.useState(phone.folderId ?? NONE)
  const [labelId, setLabelId] = React.useState(phone.labelId ?? NONE)
  const [invalid, setInvalid] = React.useState<TextField | null>(null)
  // What was last saved for each typed field, so leaving one unchanged sends nothing.
  const saved = React.useRef({ ...text })
  const timers = React.useRef(new Map<TextField, ReturnType<typeof setTimeout>>())
  const pending = React.useRef(new Map<TextField, string>())

  const send = React.useCallback(
    async (patch: Partial<PhoneFormInput>, undo?: () => void) => {
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        await savePhoneFields(phone.id, patch)
        setSaveStatus("saved")
        await onSaved()
        return true
      } catch (error) {
        setSaveStatus("idle")
        undo?.()
        showErrorToast(getPhoneErrorMessage(error))
        return false
      }
    },
    [onSaved, phone.id, setSaveStatus]
  )

  const flush = React.useCallback(
    (field: TextField) => {
      clearTimeout(timers.current.get(field))
      timers.current.delete(field)
      const value = pending.current.get(field)
      pending.current.delete(field)
      if (value === undefined || value === saved.current[field]) return
      if (field === "name" && !value.trim()) {
        setInvalid("name")
        showErrorToast("A phone needs a name. What was there before is kept until you type one.")
        return
      }
      const patch: Partial<PhoneFormInput> = field === "tags" ? { tags: value.split(",") } : { [field]: value }
      void send(patch).then((ok) => {
        if (ok) saved.current = { ...saved.current, [field]: value }
        else setInvalid(field)
      })
    },
    [send]
  )

  // Leaving the phone saves what was typed, as leaving a field does.
  React.useEffect(() => {
    const waiting = timers.current
    const fields = pending.current
    return () => {
      for (const field of Array.from(fields.keys())) {
        clearTimeout(waiting.get(field))
        const value = fields.get(field)
        if (value === undefined || value === saved.current[field] || (field === "name" && !value.trim())) continue
        void savePhoneFields(phone.id, field === "tags" ? { tags: value.split(",") } : { [field]: value }).catch(() => {})
      }
    }
  }, [phone.id])

  function type(field: TextField, value: string) {
    setText((current) => ({ ...current, [field]: value }))
    if (invalid === field) setInvalid(null)
    pending.current.set(field, value)
    clearTimeout(timers.current.get(field))
    timers.current.set(
      field,
      setTimeout(() => flush(field), SAVE_AFTER_MS)
    )
  }

  const orNull = (value: string) => (value === NONE ? null : value)
  const iphone = kind === "iphone"

  return (
    <div className="grid min-w-0 gap-3">
      <PanelCard storageId="promo-phone-settings-phone" title="The phone">
        <div className="grid gap-4">
          <PhoneStatusText phone={phone} />
          <div className="grid gap-2">
            <Label htmlFor={`phone-name-${phone.id}`}>Name</Label>
            <SavingBox
              id={`phone-name-${phone.id}`}
              value={text.name}
              invalid={invalid === "name"}
              onValue={(value) => type("name", value)}
              onLeave={() => flush("name")} placeholder="Pixel 8a" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`phone-kind-${phone.id}`}>Kind</Label>
            <Select
              value={kind}
              onValueChange={(next) => {
                const before = kind
                setKind(next as PhoneKind)
                void send({ kind: next as PhoneKind }, () => setKind(before))
              }}
            >
              <SelectTrigger id={`phone-kind-${phone.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHONE_KINDS.map((one) => (
                  <SelectItem key={one} value={one}>
                    {PHONE_KIND_WORDS[one]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`phone-model-${phone.id}`}>Model</Label>
            <SavingBox
              id={`phone-model-${phone.id}`}
              value={text.model}
              invalid={invalid === "model"}
              onValue={(value) => type("model", value)}
              onLeave={() => flush("model")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`phone-androidVersion-${phone.id}`}>{iphone ? "iOS version" : "Android version"}</Label>
            <SavingBox
              id={`phone-androidVersion-${phone.id}`}
              value={text.androidVersion}
              invalid={invalid === "androidVersion"}
              onValue={(value) => type("androidVersion", value)}
              onLeave={() => flush("androidVersion")} placeholder={iphone ? "17.6" : "16"} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`phone-serial-${phone.id}`}>{iphone ? "UDID" : "Serial number"}</Label>
            <SavingBox
              id={`phone-serial-${phone.id}`}
              value={text.serial}
              invalid={invalid === "serial"}
              onValue={(value) => type("serial", value)}
              onLeave={() => flush("serial")} placeholder="Filled in when the rack sees it" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`phone-notes-${phone.id}`}>Notes</Label>
            <SavingBox
              id={`phone-notes-${phone.id}`}
              value={text.notes}
              invalid={invalid === "notes"}
              onValue={(value) => type("notes", value)}
              onLeave={() => flush("notes")} multiline />
          </div>
          <p className="text-sm text-muted-foreground">
            {phone.accounts.length ? `On it: ${phone.accounts.map(signedInWords).join(", ")}.` : "No account runs on it yet."}
          </p>
          {bannedOnWords(phone.bannedOn) ? (
            <p className="text-sm text-destructive">Banned on: {bannedOnWords(phone.bannedOn)}.</p>
          ) : null}
        </div>
      </PanelCard>

      <PanelCard storageId="promo-phone-settings-place" title="Where it sits">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`phone-shelfSlot-${phone.id}`}>Shelf slot</Label>
            <SavingBox
              id={`phone-shelfSlot-${phone.id}`}
              value={text.shelfSlot}
              invalid={invalid === "shelfSlot"}
              onValue={(value) => type("shelfSlot", value)}
              onLeave={() => flush("shelfSlot")} placeholder="4" />
          </div>
          <dl className="grid gap-1 text-sm">
            <dt className="text-muted-foreground">USB port, from the rack</dt>
            <dd>{phone.usbPort || "Not plugged in yet"}</dd>
            <dt className="text-muted-foreground">Last seen</dt>
            <dd>{phone.lastSeenAt ? formatTimeAgo(phone.lastSeenAt) : "Never"}</dd>
          </dl>
          <p className="text-sm text-muted-foreground">
            Type the slot once, or click an empty slot on the shelf map. The rack fills in the USB port, and moving the
            cable updates it by itself.
          </p>
        </div>
      </PanelCard>

      <PanelCard storageId="promo-phone-settings-online" title="How it goes online">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`phone-connection-${phone.id}`}>Connection</Label>
            <Select
              value={connection}
              onValueChange={(next) => {
                const before = connection
                setConnection(next as PhoneConnection)
                void send(
                  { connection: next as PhoneConnection, proxyId: next === "wifi" ? orNull(proxyId) : null },
                  () => setConnection(before)
                )
              }}
            >
              <SelectTrigger id={`phone-connection-${phone.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Its own SIM</SelectItem>
                <SelectItem value="wifi">The house Wi-Fi</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {connection === "sim" ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor={`phone-simCarrier-${phone.id}`}>SIM carrier</Label>
                <SavingBox
              id={`phone-simCarrier-${phone.id}`}
              value={text.simCarrier}
              invalid={invalid === "simCarrier"}
              onValue={(value) => type("simCarrier", value)}
              onLeave={() => flush("simCarrier")} placeholder="Mint Mobile" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`phone-simNumber-${phone.id}`}>SIM number</Label>
                <SavingBox
              id={`phone-simNumber-${phone.id}`}
              value={text.simNumber}
              invalid={invalid === "simNumber"}
              onValue={(value) => type("simNumber", value)}
              onLeave={() => flush("simNumber")} inputMode="tel" />
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor={`phone-proxy-${phone.id}`}>Goes out through</Label>
              <Select
                value={proxyId}
                onValueChange={(next) => {
                  const before = proxyId
                  setProxyId(next)
                  void send({ proxyId: orNull(next) }, () => setProxyId(before))
                }}
              >
                <SelectTrigger id={`phone-proxy-${phone.id}`} className="w-full">
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
        </div>
      </PanelCard>

      <PanelCard storageId="promo-phone-settings-sorting" title="Sorting">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`phone-folder-${phone.id}`}>Folder</Label>
            <Select
              value={folderId}
              onValueChange={(next) => {
                const before = folderId
                setFolderId(next)
                void send({ folderId: orNull(next) }, () => setFolderId(before))
              }}
            >
              <SelectTrigger id={`phone-folder-${phone.id}`} className="w-full">
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
            <Label htmlFor={`phone-label-${phone.id}`}>Label</Label>
            <Select
              value={labelId}
              onValueChange={(next) => {
                const before = labelId
                setLabelId(next)
                void send({ labelId: orNull(next) }, () => setLabelId(before))
              }}
            >
              <SelectTrigger id={`phone-label-${phone.id}`} className="w-full">
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
          <div className="grid gap-2">
            <Label htmlFor={`phone-tags-${phone.id}`}>Tags, with commas between them</Label>
            <SavingBox
              id={`phone-tags-${phone.id}`}
              value={text.tags}
              invalid={invalid === "tags"}
              onValue={(value) => type("tags", value)}
              onLeave={() => flush("tags")} placeholder="important, us-east" />
          </div>
        </div>
      </PanelCard>
    </div>
  )
}

/** One typed field: it saves when it is left or Enter is pressed, and as typing stops. */
function SavingBox({
  id,
  value,
  invalid,
  multiline = false,
  placeholder,
  inputMode,
  onValue,
  onLeave,
}: {
  id: string
  value: string
  invalid: boolean
  multiline?: boolean
  placeholder?: string
  inputMode?: "tel"
  onValue: (value: string) => void
  onLeave: () => void
}) {
  if (multiline) {
    return (
      <Textarea
        id={id}
        rows={1}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(event) => onValue(event.target.value)}
        onBlur={onLeave}
      />
    )
  }
  return (
    <Input
      id={id}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      aria-invalid={invalid || undefined}
      onChange={(event) => onValue(event.target.value)}
      onBlur={onLeave}
      onKeyDown={(event) => {
        if (event.key === "Enter") onLeave()
      }}
    />
  )
}
