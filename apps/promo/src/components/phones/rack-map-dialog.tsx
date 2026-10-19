import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PhoneRecord } from "@/lib/api/phones/phones"
import { PHONE_STATUS_WORDS } from "@/lib/phones/options"
import { slotOnShelf, slotPlace } from "@/lib/phones/shelf"
import { STATUS_DOT } from "@/lib/phones/status-dot"

type MapPhone = Pick<PhoneRecord, "id" | "name" | "status" | "shelfSlot">

/**
 * The rack map (part 60 of the phone farm): the shelf drawn as a grid of the
 * rows and columns typed in Settings → Phones (Tyler, 18 Oct 2026), slots
 * numbered left to right, top to bottom, each phone in its slot with its
 * status dot, the status word beside the colour, and its name. A phone with
 * no slot, or a slot outside the shelf, is listed under the grid. Clicking a
 * phone opens its window.
 */
export function RackMapDialog({
  open,
  phones,
  rows,
  columns,
  onClose,
  onOpen,
}: {
  open: boolean
  phones: MapPhone[]
  rows: number
  columns: number
  onClose: () => void
  onOpen: (phoneId: string) => void
}) {
  const bySlot = new Map<number, MapPhone[]>()
  const elsewhere: Array<{ phone: MapPhone; why: string }> = []
  for (const phone of phones) {
    const slot = slotOnShelf(phone.shelfSlot, rows, columns)
    if (slot === null) {
      elsewhere.push({
        phone,
        why: phone.shelfSlot.trim() ? `slot ${phone.shelfSlot.trim()} is not on the shelf` : "no slot typed",
      })
      continue
    }
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), phone])
  }
  const slots = Array.from({ length: rows * columns }, (_, index) => index + 1)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent variant="admin" className="data-[variant=admin]:sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Map</DialogTitle>
          <DialogDescription>
            The shelf, {rows} {rows === 1 ? "row" : "rows"} of {columns}, numbered left to right, top to
            bottom. Each phone sits in the slot typed on its window; the rows and columns are typed in
            Settings, Phones. Click a phone to open it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-6">
            <ol
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              aria-label="The shelf"
            >
              {slots.map((slot) => {
                const { row, column } = slotPlace(slot, columns)
                const here = bySlot.get(slot) ?? []
                return (
                  <li
                    key={slot}
                    data-slot={slot}
                    data-row={row}
                    data-column={column}
                    className="grid min-h-20 min-w-0 content-start gap-1 rounded-md border p-2"
                  >
                    <span className={`text-xs ${here.length ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                      {slot}
                    </span>
                    {here.map((phone) => (
                      <button
                        key={phone.id}
                        type="button"
                        className="grid min-w-0 text-left hover:underline"
                        aria-label={`Open ${phone.name}, slot ${slot}`}
                        onClick={() => onOpen(phone.id)}
                      >
                        <span className="truncate text-sm font-medium">{phone.name}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[phone.status]}`} />
                          <span className="truncate">{PHONE_STATUS_WORDS[phone.status]}</span>
                        </span>
                      </button>
                    ))}
                  </li>
                )
              })}
            </ol>
            {elsewhere.length ? (
              <div className="grid gap-2 text-sm">
                <p className="font-medium">Not on the shelf</p>
                <ul className="grid gap-1">
                  {elsewhere.map(({ phone, why }) => (
                    <li key={phone.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <button
                        type="button"
                        className="inline-flex min-w-0 items-center gap-1.5 text-left hover:underline"
                        aria-label={`Open ${phone.name}`}
                        onClick={() => onOpen(phone.id)}
                      >
                        <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[phone.status]}`} />
                        <span className="truncate font-medium">{phone.name}</span>
                      </button>
                      <span className="text-muted-foreground">
                        {PHONE_STATUS_WORDS[phone.status]}, {why}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
