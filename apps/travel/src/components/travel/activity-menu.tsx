import * as React from "react"
import { CopyIcon, Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react"

import { canRate, ActivityRatingFields } from "@/components/travel/activity-rating-fields"
import { ActivityPictureFields } from "@/components/travel/activity-picture-fields"
import { ActivityPlaceFields } from "@/components/travel/activity-place-fields"
import { CardRainLine, DayOutlook } from "@/components/travel/day-weather"
import { useBoardActions } from "@/components/travel/board-actions"
import { dayLabel } from "@/components/travel/new-activity"
import { SavingInput } from "@/components/travel/saving-fields"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { PickGroup, PickMenuRow, PickRow } from "@/components/travel/pick-rows"
import { TabbedMenu } from "@/components/travel/tabbed-menu"
import { useSaveActivity } from "@/components/travel/use-save-activity"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addTips } from "@/lib/api/travel/place-tips"
import type { Activity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { formatTime } from "@/lib/travel/board"
import { outlookSummary } from "@/lib/travel/weather"
import { DAY_PART_LABEL, DAY_PARTS, formatMoney, parseMoney, type DayPart } from "@/lib/travel/rules"
import type { UpdateActivityInput } from "@/lib/travel/schemas"
import { showErrorToast } from "@/lib/toast/error-toast"

const IDEAS = "ideas"
const NO_PART = "any"
const NO_TYPE = "none"
const ROW = "w-full justify-start font-normal"

/**
 * The open activity's ⋮ menu. Since 6 Nov 2026 it is the tabbed ⋮ of the
 * Admin 3 panel design, as the task ⋮ in Project is (Tyler: "Look at the
 * serttings dropdown, its not ui standard for example. fix them all"):
 * General is grouped rows (Activity, When, Place, Money and picture, How was
 * it). A row with choices picks in one press; a typed value or a whole card
 * opens a small box. The day's weather and holiday sit under When. Then Add
 * tips and Duplicate activity, and Delete activity in red under a line.
 * Before, it was one folding row per part (Tyler, 2 Nov 2026: "All of these
 * are collapsible cards in a 3 dot dropdown ... and move delete there too").
 * Every field saves itself.
 */
export function ActivityMenu({ activity, onNotesChanged }: { activity: Activity; onNotesChanged: () => void }) {
  const { page, typesById, refresh, weather } = useTrip()
  const { trip } = page
  const [open, setOpen] = React.useState(false)
  const actions = useBoardActions()
  const [save] = useSaveActivity(activity.id)
  const type = typeOf(activity, typesById)
  const [runTips, writingTips] = useAsyncAction(getTravelErrorMessage)

  // AI tips go at the end of the notes (More Travel features part 5: "Into the card's notes"). The menu stays
  // open while the AI writes, then the notes show them.
  async function tips() {
    const ok = await runTips(async () => {
      await addTips(activity.id)
      await refresh()
    }, `Added tips to ${activity.title}'s notes.`)
    if (ok) {
      setOpen(false)
      onNotesChanged()
    }
  }

  // The day's weather and holiday live here, not on the day's heading (Tyler, 4 Nov 2026).
  const outlook = activity.day === null ? null : outlookSummary(weather, activity.day)
  const time = activity.startTime ? formatTime(activity.startTime) : null
  const length =
    activity.durationMinutes === null
      ? null
      : [Math.floor(activity.durationMinutes / 60) ? `${Math.floor(activity.durationMinutes / 60)}h` : null, activity.durationMinutes % 60 ? `${activity.durationMinutes % 60}m` : null]
          .filter(Boolean)
          .join(" ")
  const timeLine = [time, length].filter(Boolean).join(" · ")

  const general = (
    <div className="grid">
      <div className="grid gap-5 px-4 py-3">
        <PickGroup title="Activity">
          <PickRow label="Name" value={activity.title}>
            <Label htmlFor={`activity-${activity.id}-title`} className="sr-only">
              Name
            </Label>
            <SavingInput
              id={`activity-${activity.id}-title`}
              value={activity.title}
              maxLength={200}
              autoFocus
              onSave={(title) => save({ title })}
            />
          </PickRow>
          <PickMenuRow
            label="Type"
            empty={!type}
            value={
              type ? (
                <>
                  <ActivityTypeIcon type={type} />
                  {type.name}
                </>
              ) : (
                "None"
              )
            }
            selected={activity.typeId ?? NO_TYPE}
            options={[
              { value: NO_TYPE, label: <span className="text-muted-foreground">No type</span> },
              ...page.types.map((item) => ({
                value: item.id,
                label: (
                  <>
                    <ActivityTypeIcon type={item} />
                    {item.name}
                  </>
                ),
              })),
            ]}
            onPick={(typeId) => void save({ typeId: typeId === NO_TYPE ? null : typeId })}
          />
          {/* More Travel features part 4: AI plans around it, Filter can show only these, and it warns when left in Ideas. */}
          <PickMenuRow
            label="Must do"
            value={activity.mustDo ? "Yes" : "No"}
            empty={!activity.mustDo}
            selected={activity.mustDo ? "yes" : "no"}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            onPick={(value) => void save({ mustDo: value === "yes" })}
          />
        </PickGroup>
        <PickGroup
          title="When"
          after={
            outlook && activity.day !== null ? (
              <div className="grid gap-1.5 px-0.5 text-sm">
                <DayOutlook weather={weather} day={activity.day} />
                <CardRainLine card={activity} forecast={weather.forecast} />
              </div>
            ) : null
          }
        >
          <PickMenuRow
            label="Day"
            value={activity.day === null ? "Ideas" : dayLabel(activity.day, trip.startDate)}
            selected={activity.day === null ? IDEAS : String(activity.day)}
            options={[
              { value: IDEAS, label: "Ideas" },
              ...Array.from({ length: trip.days }, (_, index) => ({
                value: String(index + 1),
                label: dayLabel(index + 1, trip.startDate),
              })),
            ]}
            // Moving to another day can be undone.
            onPick={(value) => void actions.moveTo(activity, value === IDEAS ? null : Number(value))}
          />
          <PickRow label="Time" empty={!timeLine} value={timeLine || "None"}>
            <TimeFields activity={activity} save={save} />
            {type?.builtin === "hotel" || activity.nights ? <NightsField activity={activity} /> : null}
          </PickRow>
          {activity.day !== null && !activity.startTime ? (
            // A rough time for a card with no start time; the day sorts by it (Travel features part 2).
            <PickMenuRow
              label="Part of day"
              empty={!activity.dayPart}
              value={activity.dayPart ? DAY_PART_LABEL[activity.dayPart] : "Any time"}
              selected={activity.dayPart ?? NO_PART}
              options={[{ value: NO_PART, label: "Any time" }, ...DAY_PARTS.map((part) => ({ value: part, label: DAY_PART_LABEL[part] }))]}
              onPick={(value) => void save({ dayPart: value === NO_PART ? null : (value as DayPart) })}
            />
          ) : null}
        </PickGroup>
        <PickGroup title="Place">
          <PickRow
            label="Place"
            empty={!activity.place?.name && !activity.place?.address}
            value={activity.place?.name || activity.place?.address || "None"}
          >
            <ActivityPlaceFields activity={activity} />
          </PickRow>
        </PickGroup>
        <PickGroup title="Money and picture">
          <PickRow
            label="Cost"
            empty={activity.costCents === null}
            value={activity.costCents === null ? "None" : formatMoney(activity.costCents, trip.currency)}
          >
            <CostField activity={activity} />
          </PickRow>
          <PickRow
            label="Picture"
            empty={!activity.photoUrl}
            value={activity.photoUrl ? (activity.photoCredit ? "Unsplash" : "Uploaded") : "None"}
          >
            <ActivityPictureFields activity={activity} />
          </PickRow>
        </PickGroup>
        {canRate(activity, trip) ? (
          <PickGroup title="How was it">
            <PickRow label="Rating" empty={!activity.rating} value={activity.rating ? `${activity.rating} of 5` : "Not rated"}>
              <ActivityRatingFields activity={activity} />
            </PickRow>
          </PickGroup>
        ) : null}
      </div>
      {/* Under the groups, the actions as ghost rows, then Delete in red under a line of its own. */}
      <div className="grid gap-1 px-2 pb-2">
        <Button type="button" variant="ghost" className={ROW} disabled={writingTips} onClick={() => void tips()}>
          {writingTips ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
          {writingTips ? "Writing tips…" : "Add tips"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={ROW}
          disabled={actions.busy}
          onClick={() => {
            setOpen(false)
            void actions.duplicate(activity)
          }}
        >
          <CopyIcon className="size-4" />
          Duplicate activity
        </Button>
      </div>
      <div className="grid border-t p-2">
        <Button
          type="button"
          variant="ghost"
          className={`${ROW} text-destructive hover:text-destructive`}
          disabled={actions.busy}
          onClick={() => {
            setOpen(false)
            void actions.remove([activity.id])
          }}
        >
          <Trash2Icon className="size-4" />
          Delete activity
        </Button>
      </div>
    </div>
  )

  return (
    <TabbedMenu
      label="More for this activity"
      align="end"
      width="20.4rem"
      open={open}
      onOpenChange={setOpen}
      tabs={[{ value: "general", label: "General", content: general }]}
    />
  )
}

/** Nights, for a stay (task part 9), under its time. */
function NightsField({ activity }: { activity: Activity }) {
  const [save] = useSaveActivity(activity.id)
  const id = `activity-${activity.id}-nights`
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Nights</Label>
      <SavingInput
        id={id}
        inputMode="numeric"
        className="w-20"
        value={activity.nights === null ? "" : String(activity.nights)}
        onSave={(next) => {
          const nights = next.trim() === "" ? null : Number(next)
          if (nights !== null && (!Number.isInteger(nights) || nights < 1 || nights > 60)) {
            showErrorToast("Nights is a whole number from 1 to 60.")
            return Promise.resolve(false)
          }
          return save({ nights })
        }}
      />
    </div>
  )
}

/** The cost in the trip's one currency, which the trip's Money card adds up. */
function CostField({ activity }: { activity: Activity }) {
  const { page } = useTrip()
  const currency = page.trip.currency
  const [save] = useSaveActivity(activity.id)
  const id = `activity-${activity.id}-cost`
  return (
    <div className="grid gap-2">
      {/* The row already says Cost (Tyler, 4 Nov 2026: "Remove all these duplicate labels"). */}
      <Label htmlFor={id} className="sr-only">
        Cost ({currency})
      </Label>
      <SavingInput
        id={id}
        inputMode="decimal"
        value={activity.costCents === null ? "" : formatMoney(activity.costCents, currency)}
        placeholder={`0 ${currency}`}
        onSave={(next) => {
          const text = next.replace(/[^\d.,]/g, "")
          if (!text) return save({ costCents: null })
          const cents = parseMoney(text)
          if (cents === null) {
            showErrorToast("Type the cost as a number, such as 1200 or 12.50.")
            return Promise.resolve(false)
          }
          return save({ costCents: cents })
        }}
      />
    </div>
  )
}

/** Start time and length (task part 4), and nights for a stay (task part 9). */
function TimeFields({
  activity,
  save,
}: {
  activity: Activity
  save: (patch: Omit<UpdateActivityInput, "activityId">) => Promise<boolean>
}) {
  const idBase = `activity-${activity.id}`
  const [time, setTime] = React.useState(activity.startTime ?? "")
  const [savedTime, setSavedTime] = React.useState(activity.startTime)
  if (activity.startTime !== savedTime) {
    setSavedTime(activity.startTime)
    setTime(activity.startTime ?? "")
  }
  const hours = activity.durationMinutes === null ? "" : String(Math.floor(activity.durationMinutes / 60))
  const minutes = activity.durationMinutes === null ? "" : String(activity.durationMinutes % 60)

  function saveLength(nextHours: string, nextMinutes: string) {
    const total = (Number(nextHours) || 0) * 60 + (Number(nextMinutes) || 0)
    const durationMinutes = nextHours === "" && nextMinutes === "" ? null : total || null
    if (durationMinutes === activity.durationMinutes) return
    void save({ durationMinutes })
  }

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-time`}>Start time</Label>
        <Input
          id={`${idBase}-time`}
          type="time"
          value={time}
          disabled={activity.day === null}
          onChange={(event) => setTime(event.target.value)}
          onBlur={() => {
            const next = time || null
            if (next !== activity.startTime) void save({ startTime: next })
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-hours`}>Length</Label>
        <div className="flex items-center gap-2">
          <SavingInput
            id={`${idBase}-hours`}
            aria-label="Hours"
            inputMode="numeric"
            className="w-16"
            value={hours}
            onSave={async (next) => {
              saveLength(next.replace(/\D/g, ""), minutes)
              return true
            }}
          />
          <span className="text-sm text-muted-foreground">h</span>
          <SavingInput
            id={`${idBase}-minutes`}
            aria-label="Minutes"
            inputMode="numeric"
            className="w-16"
            value={minutes}
            onSave={async (next) => {
              saveLength(hours, next.replace(/\D/g, ""))
              return true
            }}
          />
          <span className="text-sm text-muted-foreground">m</span>
        </div>
      </div>
    </>
  )
}
