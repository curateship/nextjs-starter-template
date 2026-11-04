import * as React from "react"
import { toast } from "sonner"

import { ActivityTypeSelect } from "@/components/travel/type-icon"
import { filledLine } from "@/components/travel/activity-place-fields"
import { useTrip } from "@/components/travel/trip-context"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { makeActivityFromLink } from "@/lib/api/travel/maps-link"
import { makeActivity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dateOfDay, formatDayDate } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

const IDEAS = "ideas"

/** "Day 2 · Tue 4 Mar", or "Day 2" on a trip with no dates. */
export function dayLabel(day: number, startDate: string | null) {
  const date = dateOfDay(startDate, day)
  return date ? `Day ${day} · ${formatDayDate(date)}` : `Day ${day}`
}

/**
 * The "New activity" dropdown (UI standard: the New button opens a dropdown,
 * not a window). The header's button and each column's "+" open the same
 * one, the "+" already set to its day. The typed title is kept when it's
 * clicked away from, and the rest starts again from where it was opened.
 */
export function useNewActivity() {
  const { page, refresh, openActivity } = useTrip()
  const [anchor, setAnchor] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState("")
  const [day, setDay] = React.useState<string>("1")
  const [typeId, setTypeId] = React.useState<string | null>(null)
  const [startTime, setStartTime] = React.useState("")
  const [link, setLink] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)

  async function create() {
    // With a Maps link the name comes from Google, so it may be left empty.
    if (!title.trim() && !link.trim()) {
      setInvalid(true)
      showErrorToast("Give the activity a name, or paste a Google Maps link.")
      return
    }
    let id = ""
    let filled: { title: string; partial: boolean; failed?: string } | null = null
    const dayPicked = day === IDEAS ? null : Number(day)
    await run(async () => {
      if (link.trim()) {
        // Filled from the link on the server. One already on the trip makes no card and says where it is.
        const result = await makeActivityFromLink({
          tripId: page.trip.id,
          link,
          day: dayPicked,
          title: title.trim(),
          typeId,
          startTime: dayPicked === null ? null : startTime || null,
        })
        filled = result
        id = result.id
      } else {
        id = (
          await makeActivity({
            tripId: page.trip.id,
            day: dayPicked,
            title: title.trim(),
            typeId,
            startTime: dayPicked === null ? null : startTime || null,
          })
        ).id
      }
      await refresh()
    })
    // Made, even when the link couldn't be read: it closes and opens, and the error toast says why.
    if (!id) return
    const made = filled as { title: string; partial: boolean; failed?: string } | null
    setAnchor(null)
    setTitle("")
    setStartTime("")
    setTypeId(null)
    setLink("")
    openActivity(id)
    if (made?.failed) showErrorToast(getTravelErrorMessage(new Error(made.failed)))
    else if (made) toast.success(filledLine(made))
  }

  /** Opens one trigger's dropdown, set to the column it was opened from; null is Ideas. */
  function openFor(key: string, startDay: number | null) {
    setAnchor(key)
    setDay(startDay === null ? IDEAS : String(startDay))
    setInvalid(false)
  }

  /** One trigger's dropdown. `startDay` is the column it was opened from; null is Ideas. */
  function render(key: string, startDay: number | null, trigger: React.ReactNode) {
    const idBase = `new-activity-${key}`
    return (
      <NewRecordDropdown
        label="New activity"
        open={anchor === key}
        onOpenChange={(open) => (open ? openFor(key, startDay) : setAnchor(null))}
        submitLabel="Create activity"
        busy={busy}
        onSubmit={() => void create()}
        trigger={trigger}
      >
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-title`}>Name</Label>
          <Input
            id={`${idBase}-title`}
            autoFocus
            value={title}
            maxLength={200}
            placeholder="Senso-ji temple"
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setTitle(event.target.value)
              setInvalid(false)
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-link`}>Google Maps link</Label>
          <Input
            id={`${idBase}-link`}
            type="url"
            inputMode="url"
            value={link}
            maxLength={2000}
            placeholder="Paste to fill everything in"
            onChange={(event) => setLink(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${idBase}-day`}>Day</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger id={`${idBase}-day`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={IDEAS}>Ideas</SelectItem>
                {Array.from({ length: page.trip.days }, (_, index) => (
                  <SelectItem key={index} value={String(index + 1)}>
                    {dayLabel(index + 1, page.trip.startDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${idBase}-time`}>Start time</Label>
            <Input
              id={`${idBase}-time`}
              type="time"
              value={startTime}
              disabled={day === IDEAS}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-type`}>Type</Label>
          <ActivityTypeSelect id={`${idBase}-type`} types={page.types} value={typeId} onChange={setTypeId} />
        </div>
      </NewRecordDropdown>
    )
  }

  // `open` opens a dropdown from somewhere other than its own trigger, such as "+ Add" → New activity.
  return Object.assign(render, { open: openFor })
}
