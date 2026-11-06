import * as React from "react"
import { CopyIcon, Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react"

import { canRate, ActivityRatingFields } from "@/components/travel/activity-rating-fields"
import { ActivityPictureFields } from "@/components/travel/activity-picture-fields"
import { ActivityPlaceFields } from "@/components/travel/activity-place-fields"
import { CardRainLine, DayOutlook } from "@/components/travel/day-weather"
import { useBoardActions } from "@/components/travel/board-actions"
import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { dayLabel } from "@/components/travel/new-activity"
import { SavingInput } from "@/components/travel/saving-fields"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeSelect } from "@/components/travel/type-icon"
import { useSaveActivity } from "@/components/travel/use-save-activity"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

type Section = "name" | "when" | "weather" | "place" | "cost" | "picture" | "rating"

/**
 * The open activity's ⋮ menu (Tyler, 2 Nov 2026: "All of these are
 * collapsible cards in a 3 dot dropdown ... and move delete there too"):
 * one folding row per part of the activity, each with what it holds now on
 * the right. Every field saves itself. Duplicate and Delete activity end it.
 * Its look is Travel's one ⋮ menu, `FoldingMenu`, shared with the trip's.
 */
export function ActivityMenu({ activity, onNotesChanged }: { activity: Activity; onNotesChanged: () => void }) {
  const { page, typesById, refresh, weather } = useTrip()
  const { trip } = page
  const [open, setOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<Section>()
  const actions = useBoardActions()
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
  const when =
    activity.day === null
      ? "Ideas"
      : [
          `Day ${activity.day}`,
          activity.startTime ? formatTime(activity.startTime) : activity.dayPart ? DAY_PART_LABEL[activity.dayPart] : null,
        ]
          .filter(Boolean)
          .join(" · ")

  return (
    <FoldingMenu label="More for this activity" busy={actions.busy} open={open} onOpenChange={setOpen}>
      <MenuSection
        label="Name and type"
        value={[type?.name ?? "No type", activity.mustDo ? "Must do" : null].filter(Boolean).join(" · ")}
        open={shown.has("name")}
        onToggle={() => toggle("name")}
      >
        <NameFields activity={activity} />
      </MenuSection>
      <MenuSection label="When" value={when} open={shown.has("when")} onToggle={() => toggle("when")}>
        <WhenFields activity={activity} />
      </MenuSection>
      {outlook && activity.day !== null ? (
        <MenuSection label="Weather" value={outlook} open={shown.has("weather")} onToggle={() => toggle("weather")}>
          <div className="grid gap-1.5">
            <DayOutlook weather={weather} day={activity.day} />
            <CardRainLine card={activity} forecast={weather.forecast} />
          </div>
        </MenuSection>
      ) : null}
      <MenuSection
        label="Place"
        value={activity.place?.name || activity.place?.address || "Not set"}
        open={shown.has("place")}
        onToggle={() => toggle("place")}
      >
        <ActivityPlaceFields activity={activity} />
      </MenuSection>
      <MenuSection
        label="Cost"
        value={activity.costCents === null ? "None" : formatMoney(activity.costCents, trip.currency)}
        open={shown.has("cost")}
        onToggle={() => toggle("cost")}
      >
        <CostField activity={activity} />
      </MenuSection>
      <MenuSection
        label="Picture"
        value={activity.photoUrl ? (activity.photoCredit ? "Unsplash" : "Uploaded") : "None"}
        open={shown.has("picture")}
        onToggle={() => toggle("picture")}
      >
        <ActivityPictureFields activity={activity} />
      </MenuSection>
      {canRate(activity, trip) ? (
        <MenuSection
          label="How was it"
          value={activity.rating ? `${activity.rating} of 5` : "Not rated"}
          open={shown.has("rating")}
          onToggle={() => toggle("rating")}
        >
          <ActivityRatingFields activity={activity} />
        </MenuSection>
      ) : null}
      <MenuLine />
      <MenuAction
        icon={writingTips ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
        disabled={writingTips}
        onClick={() => void tips()}
      >
        {writingTips ? "Writing tips…" : "Add tips"}
      </MenuAction>
      <MenuAction
        icon={<CopyIcon className="size-4" />}
        disabled={actions.busy}
        onClick={() => {
          setOpen(false)
          void actions.duplicate(activity)
        }}
      >
        Duplicate activity
      </MenuAction>
      <MenuAction
        icon={<Trash2Icon className="size-4" />}
        destructive
        disabled={actions.busy}
        onClick={() => {
          setOpen(false)
          void actions.remove([activity.id])
        }}
      >
        Delete activity
      </MenuAction>
    </FoldingMenu>
  )
}

function NameFields({ activity }: { activity: Activity }) {
  const { page } = useTrip()
  const [save] = useSaveActivity(activity.id)
  const idBase = `activity-${activity.id}`
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-title`}>Name</Label>
        <SavingInput id={`${idBase}-title`} value={activity.title} maxLength={200} onSave={(title) => save({ title })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-type`}>Type</Label>
        <ActivityTypeSelect
          id={`${idBase}-type`}
          types={page.types}
          value={activity.typeId}
          onChange={(typeId) => void save({ typeId })}
        />
      </div>
      {/* More Travel features part 4: AI plans around it, Filter can show only these, and it warns when left in Ideas. */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idBase}-must-do`}
          checked={activity.mustDo}
          onCheckedChange={(checked) => void save({ mustDo: checked === true })}
        />
        <Label htmlFor={`${idBase}-must-do`}>Must do</Label>
      </div>
    </div>
  )
}

/** The day, start time, length and, for a stay, its nights. Moving to another day can be undone. */
function WhenFields({ activity }: { activity: Activity }) {
  const { page, typesById } = useTrip()
  const { trip } = page
  const [save] = useSaveActivity(activity.id)
  const actions = useBoardActions()
  const idBase = `activity-${activity.id}`
  const type = typeOf(activity, typesById)
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-day`}>Day</Label>
        <Select
          value={activity.day === null ? IDEAS : String(activity.day)}
          onValueChange={(value) => void actions.moveTo(activity, value === IDEAS ? null : Number(value))}
        >
          <SelectTrigger id={`${idBase}-day`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={IDEAS}>Ideas</SelectItem>
            {Array.from({ length: trip.days }, (_, index) => (
              <SelectItem key={index} value={String(index + 1)}>
                {dayLabel(index + 1, trip.startDate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TimeFields activity={activity} save={save} />
      {activity.day !== null && !activity.startTime ? (
        // A rough time for a card with no start time; the day sorts by it (Travel features part 2).
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-part`}>Part of the day</Label>
          <Select
            value={activity.dayPart ?? NO_PART}
            onValueChange={(value) => void save({ dayPart: value === NO_PART ? null : (value as DayPart) })}
          >
            <SelectTrigger id={`${idBase}-part`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PART}>Any time</SelectItem>
              {DAY_PARTS.map((part) => (
                <SelectItem key={part} value={part}>
                  {DAY_PART_LABEL[part]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {type?.builtin === "hotel" || activity.nights ? (
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-nights`}>Nights</Label>
          <SavingInput
            id={`${idBase}-nights`}
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
      ) : null}
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
