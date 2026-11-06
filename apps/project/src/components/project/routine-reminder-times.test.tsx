import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { MyNoticeSwitches } from "@/components/project/my-notice-switches"
import { RoutineReminderTimes } from "@/components/project/routine-reminder-times"

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }))

const REMINDERS = { morning: "12:00", afternoon: "15:00", night: null }

function render(props: Partial<React.ComponentProps<typeof MyNoticeSwitches>> = {}) {
  return renderToStaticMarkup(
    <MyNoticeSwitches
      off={[]}
      siteAdmin
      routineTimes={<RoutineReminderTimes reminders={REMINDERS} />}
      {...props}
    />,
  )
}

describe("routine reminder times in Bell notices", () => {
  it("sit right under the Daily card routine switch, a pill per routine, an off one dashed", () => {
    const html = render()
    const kindSwitch = html.indexOf('id="my-notice-routine_reminder"')
    const firstPill = html.indexOf('aria-label="Morning reminder, at 12:00')
    expect(kindSwitch).toBeGreaterThan(-1)
    expect(firstPill).toBeGreaterThan(kindSwitch)
    // Nothing else sits between the kind's switch and its pills.
    expect(html.slice(kindSwitch + 1, firstPill)).not.toContain('id="my-notice-')
    expect(html).toContain('aria-label="Afternoon reminder, at 3:00')
    // Night is switched off: its pill is dashed and says so.
    expect(html).toMatch(/aria-label="Night reminder, off"[^>]*border-dashed/)
  })

  it("hide while the whole kind is switched off", () => {
    expect(render({ off: ["routine_reminder"] })).not.toContain("Morning reminder")
  })

  it("never show to someone who is not the site admin", () => {
    expect(render({ siteAdmin: false })).not.toContain("Morning reminder")
  })
})
