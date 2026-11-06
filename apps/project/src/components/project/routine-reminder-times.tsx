import { useRouter } from "@tanstack/react-router"

import { SaveLine } from "@/components/project/save-line"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { saveMyReminders, type DailyCard } from "@/lib/api/project/daily-card"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { DAY_PART_LABEL, DAY_PARTS } from "@/lib/project/daily-card"
import { clockLabel } from "@/lib/project/days"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import { useSaveLine } from "@/lib/project/use-save-line"
import { showErrorToast } from "@/lib/toast/error-toast"

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const FIRST_TIME = { morning: "10:00", afternoon: "15:00", night: "21:00" } as const

/**
 * When each Daily card routine's bell reminder goes out, under the switch for
 * the whole kind in My settings → Notifications (Tyler, 6 Nov 2026: "Move this
 * bell notif into settings bell notices", then his drawing of the tab with a
 * pill for each part). A pill that is on is drawn solid; pressing it opens its
 * switch and time. A switch or a time saves itself, and a refused save puts
 * the saved one back.
 */
export function RoutineReminderTimes({ reminders: saved }: { reminders: DailyCard["settings"]["reminders"] }) {
  const router = useRouter()
  const [draft, setDraft] = useSyncedDraft(saved)
  const [state, track] = useSaveLine()

  async function save(next: typeof saved) {
    setDraft(next)
    if (await track(() => saveMyReminders(next))) await router.invalidate()
    else setDraft(saved)
  }

  return (
    <div className="grid gap-2" role="group" aria-label="Routine reminder times">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Sent at each part's time if that routine still has habits not ticked.</p>
        <SaveLine state={state} className="empty:hidden" />
      </div>
      <div className="flex flex-wrap gap-2">
        {DAY_PARTS.map((part) => {
          const time = draft[part]
          const switchId = `routine-reminder-${part}`
          return (
            <Popover
              key={part}
              onOpenChange={(open) => {
                // Leaving the box saves the time being typed in, as leaving the field would.
                if (!open && document.activeElement instanceof HTMLElement) document.activeElement.blur()
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`${DAY_PART_LABEL[part]} reminder, ${time !== null ? `at ${clockLabel(time)}` : "off"}`}
                  className={cn(
                    "h-8 rounded-full border px-3 text-sm transition-colors hover:bg-muted",
                    time === null && "border-dashed text-muted-foreground/70",
                    focusRing
                  )}
                >
                  {DAY_PART_LABEL[part]}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="grid w-56 gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={switchId} className="font-normal">
                    {DAY_PART_LABEL[part]} reminder
                  </Label>
                  <Switch
                    id={switchId}
                    checked={time !== null}
                    onCheckedChange={(on) => void save({ ...draft, [part]: on ? (saved[part] ?? FIRST_TIME[part]) : null })}
                  />
                </div>
                {time !== null ? (
                  <Input
                    type="time"
                    aria-label={`${DAY_PART_LABEL[part]} reminder time`}
                    value={time}
                    onChange={(event) => setDraft({ ...draft, [part]: event.target.value })}
                    onBlur={() => {
                      if (draft[part] === saved[part]) return
                      if (!TIME.test(draft[part] ?? "")) {
                        showErrorToast("Pick a time like 09:00.")
                        return
                      }
                      void save(draft)
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Off. No reminder for this part.</p>
                )}
              </PopoverContent>
            </Popover>
          )
        })}
      </div>
    </div>
  )
}
