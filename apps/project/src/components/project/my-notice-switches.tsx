import * as React from "react"

import { SaveLine } from "@/components/project/save-line"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { saveNoticeSwitch } from "@/lib/api/project/notice-switches"
import {
  NOTICE_SWITCHES,
  NOTICE_SWITCH_GROUPS,
  type NoticeSwitchId,
} from "@/lib/project/notice-switches"
import { useSaveLine } from "@/lib/project/use-save-line"

/**
 * The bell notices I get, one switch per kind, in My settings → Notifications.
 * A switch saves the moment it flips, and a refused save flips it back.
 * "Time to check in", my own reminders and tags always arrive, so they
 * aren't listed (Tyler's choices, 12 Oct 2026).
 */
export function MyNoticeSwitches({
  off: savedOff,
  siteAdmin = false,
  routineTimes,
}: {
  off: NoticeSwitchId[]
  /** The site admin also gets the kinds only they receive, such as the morning summary and joins. */
  siteAdmin?: boolean
  /** Each routine's reminder time, shown under the Daily card routine switch. */
  routineTimes?: React.ReactNode
}) {
  const [saveState, track] = useSaveLine()
  // Held here so a flip shows at once; the page's data catches up on the next load.
  const [off, setOff] = React.useState(() => new Set(savedOff))
  const shown = NOTICE_SWITCHES.filter((item) => siteAdmin || !item.runsTheTeam)

  async function flip(id: NoticeSwitchId, on: boolean) {
    const change = (set: Set<NoticeSwitchId>, nowOn: boolean) => {
      const next = new Set(set)
      if (nowOn) next.delete(id)
      else next.add(id)
      return next
    }
    setOff((current) => change(current, on))
    const ok = await track(() => saveNoticeSwitch({ id, on }))
    if (!ok) setOff((current) => change(current, !on))
  }

  return (
    // Tyler's drawing of the tab, 6 Nov 2026: a small heading over each group and
    // the group's switches in one bordered list, one line between each.
    <section className="grid gap-5" aria-label="My notices">
      <SaveLine state={saveState} className="-mb-3 justify-self-end empty:hidden" />
      {NOTICE_SWITCH_GROUPS.map((group) => {
        const items = shown.filter((item) => item.group === group.id)
        if (items.length === 0) return null
        return (
          <div key={group.id} className="grid gap-2" role="group" aria-labelledby={`my-notices-${group.id}`}>
            <h4 id={`my-notices-${group.id}`} className="px-0.5 text-sm font-medium text-muted-foreground">
              {group.label}
            </h4>
            {/* Light grey, as every settings list is (Tyler, 6 Nov 2026: "The project app settings white bg needs to be change to light gray too"). */}
            <ul className="divide-y overflow-hidden rounded-xl border bg-muted/50">
              {items.map((item) => {
                const switchId = `my-notice-${item.id}`
                return (
                  <li key={item.id} className="grid gap-2 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor={switchId} className="min-w-0 font-normal">
                        {item.label}
                      </Label>
                      <Switch
                        id={switchId}
                        checked={!off.has(item.id)}
                        onCheckedChange={(on) => void flip(item.id, on)}
                      />
                    </div>
                    {item.id === "routine_reminder" && !off.has(item.id) ? routineTimes : null}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
