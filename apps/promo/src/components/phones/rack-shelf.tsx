import * as React from "react"
import { BanIcon } from "lucide-react"

import { Hint } from "@/components/social/hint"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import type { PhoneRecord } from "@/lib/api/phones/phones"
import { bannedOnWords } from "@/lib/bans/options"
import { PHONE_STATUS_WORDS } from "@/lib/phones/options"
import { slotOnShelf, slotPlace } from "@/lib/phones/shelf"
import { STATUS_DOT } from "@/lib/phones/status-dot"
import { cn } from "@/lib/utils"

type ShelfPhone = Pick<PhoneRecord, "id" | "name" | "status" | "shelfSlot" | "bannedOn">

/**
 * The shelf map, a card on the rack's left panel (part 60 of the phone farm;
 * Racks dashboard, parts 92 and 93): the shelf as a grid of the rows and
 * columns typed in Settings → Phones (Tyler, 18 Oct 2026), slots numbered left
 * to right, top to bottom, each of this rack's phones in its slot with its
 * status dot and the status word for a screen reader. A phone with no slot,
 * or a slot outside the shelf, is listed under the grid. Clicking a phone
 * opens it on the right; clicking an empty slot lists the phones with no
 * slot, and picking one puts it there. A shelf too wide for the panel
 * scrolls sideways inside the card.
 */
export function RackShelf({
  phones,
  rows,
  columns,
  openId,
  onOpen,
  onPlace,
}: {
  phones: ShelfPhone[]
  rows: number
  columns: number
  openId: string | undefined
  onOpen: (phoneId: string) => void
  /** Saves `slot` as the phone's shelf slot. */
  onPlace: (phoneId: string, slot: number) => Promise<void>
}) {
  const bySlot = new Map<number, ShelfPhone[]>()
  const elsewhere: Array<{ phone: ShelfPhone; why: string }> = []
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
  const slotless = phones.filter((phone) => !phone.shelfSlot.trim())
  const slots = Array.from({ length: rows * columns }, (_, index) => index + 1)

  return (
    <div className="grid min-w-0 gap-3">
      <ScrollArea className="min-w-0">
        <ol
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(2.75rem, 1fr))` }}
          aria-label={`The shelf, ${rows} ${rows === 1 ? "row" : "rows"} of ${columns}`}
        >
          {slots.map((slot) => {
            const { row, column } = slotPlace(slot, columns)
            const here = bySlot.get(slot) ?? []
            const banned = here.map((phone) => bannedOnWords(phone.bannedOn)).filter(Boolean).join("; ")
            return (
              <li
                key={slot}
                data-slot={slot}
                data-row={row}
                data-column={column}
                className="relative grid min-h-12 min-w-0 content-start gap-0.5 rounded-md border bg-background p-1"
              >
                <span className="flex items-center justify-between gap-1">
                  <span className={cn("text-[11px]", here.length ? "text-muted-foreground" : "text-muted-foreground/50")}>{slot}</span>
                  {banned ? (
                    <Hint label={`Banned on: ${banned}`}>
                      <span tabIndex={0} role="img" className="inline-flex text-destructive" aria-label={`Slot ${slot}: banned on ${banned}`}>
                        <BanIcon className="size-3" aria-hidden="true" />
                      </span>
                    </Hint>
                  ) : null}
                </span>
                {here.map((phone) => (
                  // A slot is narrow, so its name is cut short; hovering shows it whole
                  // (Tyler, 6 Nov 2026: "show full name on hover").
                  <Hint key={phone.id} label={phone.name}>
                    <button
                      type="button"
                      className={cn(
                        "flex min-w-0 items-center gap-1 rounded-sm text-left text-xs hover:underline",
                        phone.id === openId && "font-semibold"
                      )}
                      aria-label={`Open ${phone.name}, slot ${slot}, ${PHONE_STATUS_WORDS[phone.status]}`}
                      aria-pressed={phone.id === openId}
                      onClick={() => onOpen(phone.id)}
                    >
                      <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[phone.status]}`} />
                      <span className="truncate">{phone.name}</span>
                    </button>
                  </Hint>
                ))}
                {here.length === 0 && slotless.length ? (
                  <PlaceInSlot slot={slot} phones={slotless} onPlace={onPlace} />
                ) : null}
              </li>
            )
          })}
        </ol>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {elsewhere.length ? (
        <div className="grid gap-1 text-sm">
          <p className="font-medium">Not on the shelf</p>
          <ul className="grid gap-1">
            {elsewhere.map(({ phone, why }) => (
              <li key={phone.id} className="flex min-w-0 flex-wrap items-center gap-x-2">
                <button
                  type="button"
                  className="inline-flex min-w-0 items-center gap-1.5 text-left hover:underline"
                  aria-label={`Open ${phone.name}`}
                  onClick={() => onOpen(phone.id)}
                >
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[phone.status]}`} />
                  <span className="truncate font-medium">{phone.name}</span>
                </button>
                <span className="text-xs text-muted-foreground">{why}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** An empty slot's button: the phones with no slot, one of which goes here. */
function PlaceInSlot({
  slot,
  phones,
  onPlace,
}: {
  slot: number
  phones: ShelfPhone[]
  onPlace: (phoneId: string, slot: number) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute inset-0 rounded-md hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Put a phone in slot ${slot}`}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-0 p-1">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Put in slot {slot}</p>
        {phones.map((phone) => (
          <button
            key={phone.id}
            type="button"
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            onClick={() => {
              setOpen(false)
              void onPlace(phone.id, slot)
            }}
          >
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[phone.status]}`} />
            <span className="truncate">{phone.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
