import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  LISTING_WEEKDAY_LABELS,
  LISTING_WEEKDAYS,
  type ListingHours,
  type ListingShift,
  type ListingWeekday,
} from "@/lib/directory/listing-details"

/**
 * A week of times, one row per weekday: a switch, a start and an end, and a
 * second stretch when somebody asks for one. A listing's opening hours and a
 * deal's times both use it, because they are the same shape and a deal can
 * copy a listing's hours straight across.
 */
export function WeekdayHoursFields({
  idPrefix,
  words,
  newDay,
  hours,
  disabled,
  onChange,
}: {
  /** Unique on the page, like "listing-hours". */
  idPrefix: string
  /** The column headings, like "Opens" and "Closes". */
  words: { start: string; end: string }
  /** The times a day gets when it is switched on. */
  newDay: ListingShift
  hours: ListingHours
  disabled: boolean
  onChange: (hours: ListingHours) => void
}) {
  const updateDay = (day: ListingWeekday, next: ListingHours[ListingWeekday]) =>
    onChange({ ...hours, [day]: next })

  return (
    <>
      <div className="hidden grid-cols-[minmax(8rem,1fr)_1fr_1fr] gap-4 text-sm font-medium sm:grid">
        <span>Day</span>
        <span>{words.start}</span>
        <span>{words.end}</span>
      </div>
      <div className="grid gap-4">
        {LISTING_WEEKDAYS.map((day) => (
          <WeekdayRow
            key={day}
            idPrefix={idPrefix}
            words={words}
            newDay={newDay}
            day={day}
            value={hours[day]}
            disabled={disabled}
            onChange={(next) => updateDay(day, next)}
          />
        ))}
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !hours.monday}
          onClick={() => {
            const monday = hours.monday
            if (!monday) return
            // A copy per day, second stretch included, so editing Tuesday
            // afterwards does not also edit Wednesday.
            const copy = () => ({
              ...monday,
              second: monday.second ? { ...monday.second } : null,
            })
            onChange({
              ...hours,
              tuesday: copy(),
              wednesday: copy(),
              thursday: copy(),
              friday: copy(),
            })
          }}
        >
          Copy Monday to weekdays
        </Button>
      </div>
    </>
  )
}

/**
 * One weekday: the switch, its times, and a second stretch for a day that
 * stops in the middle and starts again.
 *
 * The second stretch is added by hand and is off until somebody asks for it,
 * so a day with one stretch still looks like one row.
 */
function WeekdayRow({
  idPrefix,
  words,
  newDay,
  day,
  value,
  disabled,
  onChange,
}: {
  idPrefix: string
  words: { start: string; end: string }
  newDay: ListingShift
  day: ListingWeekday
  value: ListingHours[ListingWeekday]
  disabled: boolean
  onChange: (value: ListingHours[ListingWeekday]) => void
}) {
  const name = LISTING_WEEKDAY_LABELS[day]
  const start = words.start.toLowerCase()
  const end = words.end.toLowerCase()
  const openId = `${idPrefix}-${day}-open`
  const closeId = `${idPrefix}-${day}-close`
  const secondOpenId = `${idPrefix}-${day}-second-open`
  const secondCloseId = `${idPrefix}-${day}-second-close`

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(8rem,1fr)_1fr_1fr] sm:items-end sm:gap-4">
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id={`${idPrefix}-${day}`}
            checked={Boolean(value)}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(checked ? { ...newDay, second: null } : null)
            }
          />
          <Label htmlFor={`${idPrefix}-${day}`}>{name}</Label>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={openId} className="sm:sr-only">
            {name} {start}
          </Label>
          <Input
            id={openId}
            type="time"
            value={value?.open ?? ""}
            disabled={disabled || !value}
            onChange={(event) =>
              value && onChange({ ...value, open: event.target.value })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={closeId} className="sm:sr-only">
            {name} {end}
          </Label>
          <Input
            id={closeId}
            type="time"
            value={value?.close ?? ""}
            disabled={disabled || !value}
            onChange={(event) =>
              value && onChange({ ...value, close: event.target.value })
            }
          />
        </div>
      </div>

      {value?.second ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(8rem,1fr)_1fr_1fr] sm:items-end sm:gap-4">
          <div className="flex h-8 items-center">
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange({ ...value, second: null })}
            >
              <Trash2Icon aria-hidden="true" />
              Remove second time
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={secondOpenId} className="sm:sr-only">
              {name} {start} again
            </Label>
            <Input
              id={secondOpenId}
              type="time"
              value={value.second.open}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  second: { ...value.second!, open: event.target.value },
                })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={secondCloseId} className="sm:sr-only">
              {name} {end} again
            </Label>
            <Input
              id={secondCloseId}
              type="time"
              value={value.second.close}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  second: { ...value.second!, close: event.target.value },
                })
              }
            />
          </div>
        </div>
      ) : value ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...value,
                second: { open: "17:00", close: "22:00" },
              })
            }
          >
            <PlusIcon aria-hidden="true" />
            Add a second time on {name}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
