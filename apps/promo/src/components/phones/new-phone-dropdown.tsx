import * as React from "react"
import { PlusIcon } from "lucide-react"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addPhone, checkPhoneSerial, getPhoneErrorMessage } from "@/lib/api/phones/phones"
import { PHONE_KIND_WORDS, PHONE_KINDS, type PhoneConnection, type PhoneKind } from "@/lib/phones/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The serial is checked this long after the last letter (part 103). */
const SERIAL_CHECK_MS = 400

/**
 * New phone, the middle header's one primary button (Racks dashboard, part
 * 102; Tyler, 5 Nov 2026: "middle phones (header create new phone)"). A
 * dropdown in the UI standard's New shape, not a window: the name first, then
 * the serial and kind, then the shelf slot and how it goes online, with
 * Create phone at the bottom right and Enter in any field pressing it. The
 * phone is made on the rack picked in the Rack filter, or, with none picked,
 * on the rack chosen in its Rack field (the first, until another is chosen),
 * and opens on the right; the rest of its fields
 * are on its Settings tab.
 *
 * The serial is checked as it is typed, so one another phone has says so
 * under the box before Create is pressed (part 103). Create still refuses it.
 * Clicking away keeps what was typed for the next opening.
 */
export function NewPhoneDropdown({
  racks,
  rackId,
  onCreated,
}: {
  racks: { id: string; name: string }[]
  /** The rack the Rack filter picked, or null to choose one here. */
  rackId: string | null
  onCreated: (phoneId: string) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [chosenRack, setChosenRack] = React.useState("")
  const onRack = rackId ?? (racks.some((rack) => rack.id === chosenRack) ? chosenRack : (racks[0]?.id ?? ""))
  const [name, setName] = React.useState("")
  const [serial, setSerial] = React.useState("")
  const [kind, setKind] = React.useState<PhoneKind>("android")
  const [shelfSlot, setShelfSlot] = React.useState("")
  const [connection, setConnection] = React.useState<PhoneConnection>("sim")
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [serialTaken, setSerialTaken] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Whether another phone has the serial, asked once the typing settles.
  React.useEffect(() => {
    const typed = serial.trim()
    if (!typed) return
    let live = true
    const timer = setTimeout(() => {
      checkPhoneSerial(typed).then(
        ({ taken }) => {
          if (live) setSerialTaken(taken ? typed : null)
        },
        () => {}
      )
    }, SERIAL_CHECK_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [serial])
  const takenNow = Boolean(serialTaken && serialTaken === serial.trim())

  async function create() {
    if (!name.trim()) {
      setNameInvalid(true)
      showErrorToast("Give the phone a name first.")
      return
    }
    if (!onRack) {
      showErrorToast("Make a rack first, with New rack in the Racks block's ⋮. A phone is added on a rack.")
      return
    }
    setBusy(true)
    try {
      const { id } = await addPhone(onRack, {
        name: name.trim(),
        kind,
        serial,
        shelfSlot,
        connection,
        proxyId: null,
        folderId: null,
        labelId: null,
      })
      setName("")
      setSerial("")
      setShelfSlot("")
      setKind("android")
      setConnection("sim")
      setSerialTaken(null)
      setOpen(false)
      await onCreated(id)
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <NewRecordDropdown
      label="New phone"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create phone"
      busy={busy}
      onSubmit={() => void create()}
      trigger={
        <DashboardToolbarButton type="button" aria-label="New phone">
          <PlusIcon className="size-4" />
          {/* In a narrow panel the button keeps its icon and drops its word. */}
          <span className="@max-3xl:sr-only">New phone</span>
        </DashboardToolbarButton>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="new-phone-name">Name</Label>
        <Input
          id="new-phone-name"
          autoFocus
          value={name}
          maxLength={120}
          placeholder="Pixel 8a"
          aria-invalid={nameInvalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setNameInvalid(false)
          }}
        />
      </div>
      {rackId || racks.length < 2 ? null : (
        <div className="grid gap-2">
          <Label htmlFor="new-phone-rack">Rack</Label>
          <Select value={onRack} onValueChange={setChosenRack}>
            <SelectTrigger id="new-phone-rack" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {racks.map((rack) => (
                <SelectItem key={rack.id} value={rack.id}>
                  {rack.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="new-phone-serial">{kind === "iphone" ? "UDID" : "Serial"}</Label>
          <Input
            id="new-phone-serial"
            value={serial}
            maxLength={120}
            placeholder="Optional"
            aria-invalid={takenNow || undefined}
            aria-describedby={takenNow ? "new-phone-serial-taken" : undefined}
            onChange={(event) => setSerial(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-phone-kind">Kind</Label>
          <Select value={kind} onValueChange={(next) => setKind(next as PhoneKind)}>
            <SelectTrigger id="new-phone-kind" className="w-full">
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
      </div>
      {takenNow ? (
        <p id="new-phone-serial-taken" role="alert" className="-mt-2 text-xs text-destructive">
          Another phone already has that serial.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="new-phone-slot">Shelf slot</Label>
          <Input id="new-phone-slot" value={shelfSlot} maxLength={20} placeholder="4" onChange={(event) => setShelfSlot(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-phone-connection">Goes online</Label>
          <Select value={connection} onValueChange={(next) => setConnection(next as PhoneConnection)}>
            <SelectTrigger id="new-phone-connection" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sim">Its own SIM</SelectItem>
              <SelectItem value="wifi">House Wi-Fi</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </NewRecordDropdown>
  )
}
