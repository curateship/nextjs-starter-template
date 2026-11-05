import * as React from "react"

import { dayLabel } from "@/components/travel/new-activity"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Activity } from "@/lib/api/travel/trips"
import { boardColumns, dayOfColumn, formatWhen } from "@/lib/travel/board"
import { MAP_BLOCK_MAX_CARDS } from "@/lib/travel/note-blocks"
import { showErrorToast } from "@/lib/toast/error-toast"

function hasPosition(activity: Activity) {
  return typeof activity.place?.lat === "number" && typeof activity.place?.lng === "number"
}

/**
 * Picks the trip's own cards for a note's "/" block: one card for Place
 * (Travel features 3, part 2), any number for Map (part 4; Tyler: "Pick
 * cards"). Cards are listed day by day as the board shows them, Ideas last,
 * and a search narrows them by name. A Map can only take cards that have a
 * place on the map.
 */
export function NoteCardPicker({
  open,
  mode,
  picked: startPicked = [],
  onClose,
  onPick,
}: {
  open: boolean
  mode: "place" | "map"
  /** The cards already on the map, when changing a Map block. */
  picked?: string[]
  onClose: () => void
  onPick: (activityIds: string[]) => void
}) {
  const { page, typesById } = useTrip()
  const { trip } = page
  const [query, setQuery] = React.useState("")
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set(startPicked))
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQuery("")
      setPicked(new Set(startPicked))
    }
  }

  const words = query.trim().toLowerCase()
  const columns = [...boardColumns(trip.days, page.activities).entries()]
  // Ideas sits first on the board; here the days come first and Ideas last.
  const inOrder = [...columns.slice(1), columns[0]]
  const groups = inOrder
    .map(([key, cards]) => ({
      day: dayOfColumn(key),
      cards: cards.filter((card) => !words || card.title.toLowerCase().includes(words) || card.place?.name.toLowerCase().includes(words)),
    }))
    .filter((group) => group.cards.length)
  const changing = startPicked.length > 0

  function toggle(card: Activity) {
    setPicked((was) => {
      const next = new Set(was)
      if (next.has(card.id)) next.delete(card.id)
      else if (next.size >= MAP_BLOCK_MAX_CARDS) {
        showErrorToast(`A map holds up to ${MAP_BLOCK_MAX_CARDS} cards.`)
        return was
      } else next.add(card.id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "place" ? "Link a card" : changing ? "Cards on the map" : "Add a map"}</DialogTitle>
          <DialogDescription>
            {mode === "place"
              ? "Pick one of the trip's cards. Clicking it in the note opens the card."
              : "Tick the cards to show on the map. Only cards with a place can go on it."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="note-card-search">Search cards</Label>
                <Input
                  id="note-card-search"
                  value={query}
                  placeholder="Search by name"
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <ScrollArea viewportClassName="max-h-80">
                {groups.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    {page.activities.length ? "No card matches that search." : "This trip has no cards yet."}
                  </p>
                ) : (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
                    {groups.map((group) => (
                      <section key={group.day ?? "ideas"} className="grid grid-cols-[minmax(0,1fr)] gap-1">
                        <h3 className="text-xs font-medium text-muted-foreground">
                          {group.day === null ? "Ideas" : dayLabel(group.day, trip.startDate)}
                        </h3>
                        {group.cards.map((card) => {
                          const when = formatWhen(card)
                          const row = (
                            <>
                              <ActivityTypeIcon type={typeOf(card, typesById)} />
                              <span className="grid min-w-0 flex-1 text-left">
                                <span className="truncate text-sm">{card.title}</span>
                                {mode === "map" && !hasPosition(card) ? (
                                  <span className="truncate text-xs text-muted-foreground">No place yet</span>
                                ) : when ? (
                                  <span className="truncate text-xs text-muted-foreground">{when}</span>
                                ) : null}
                              </span>
                            </>
                          )
                          if (mode === "place") {
                            return (
                              <button
                                key={card.id}
                                type="button"
                                className="flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                                onClick={() => onPick([card.id])}
                              >
                                {row}
                              </button>
                            )
                          }
                          const checkId = `note-map-card-${card.id}`
                          return (
                            <label
                              key={card.id}
                              htmlFor={checkId}
                              className="flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent has-[:disabled]:opacity-60"
                            >
                              <Checkbox
                                id={checkId}
                                checked={picked.has(card.id)}
                                disabled={!hasPosition(card)}
                                onCheckedChange={() => toggle(card)}
                              />
                              {row}
                            </label>
                          )
                        })}
                      </section>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {mode === "map" ? (
            <Button
              type="button"
              onClick={() => {
                if (!picked.size) {
                  showErrorToast("Tick at least one card for the map.")
                  return
                }
                // In the board's order, so the map's numbers follow the days.
                // Every ticked card counts, including any the search is hiding.
                onPick(inOrder.flatMap(([, cards]) => cards).filter((card) => picked.has(card.id)).map((card) => card.id))
              }}
            >
              {changing ? "Save changes" : "Add map"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
