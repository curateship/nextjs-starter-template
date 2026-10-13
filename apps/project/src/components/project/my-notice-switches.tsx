import * as React from "react"
import { BellIcon } from "lucide-react"

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
 * The bell notices I get, one switch per kind, on the left of My dashboard.
 * A switch saves the moment it flips, and a refused save flips it back.
 * "Time to check in", my own reminders and tags always arrive, so they
 * aren't listed (Tyler's choices, 12 Oct 2026).
 */
export function MyNoticeSwitches({
  off: savedOff,
  runsTheTeam,
}: {
  off: NoticeSwitchId[]
  /** The owner and admins also get the morning summary and join notices. */
  runsTheTeam: boolean
}) {
  const [saveState, track] = useSaveLine()
  // Held here so a flip shows at once; the page's data catches up on the next load.
  const [off, setOff] = React.useState(() => new Set(savedOff))
  const shown = NOTICE_SWITCHES.filter((item) => runsTheTeam || !item.runsTheTeam)

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
    <section className="grid gap-4" aria-labelledby="my-notices-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="my-notices-heading" className="flex items-center gap-2 text-sm font-medium">
          <BellIcon className="size-4 text-muted-foreground" aria-hidden />
          My notices
        </h3>
        <SaveLine state={saveState} />
      </div>
      <p className="text-sm text-muted-foreground">
        Pick what reaches your bell. A notice switched off is never sent to you, and everyone
        else still gets theirs. Time to check in, your own reminders and tags always reach you.
      </p>
      {NOTICE_SWITCH_GROUPS.map((group) => {
        const items = shown.filter((item) => item.group === group.id)
        if (items.length === 0) return null
        return (
          <div key={group.id} className="grid gap-2" role="group" aria-labelledby={`my-notices-${group.id}`}>
            <h4 id={`my-notices-${group.id}`} className="text-xs font-medium text-muted-foreground">
              {group.label}
            </h4>
            {items.map((item) => {
              const switchId = `my-notice-${item.id}`
              return (
                <div key={item.id} className="flex min-h-8 items-center justify-between gap-3">
                  <Label htmlFor={switchId} className="min-w-0 font-normal">
                    {item.label}
                  </Label>
                  <Switch
                    id={switchId}
                    checked={!off.has(item.id)}
                    onCheckedChange={(on) => void flip(item.id, on)}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </section>
  )
}
