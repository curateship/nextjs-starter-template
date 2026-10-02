import { Clock3Icon } from "lucide-react"
import { z } from "zod"

import {
  automationScheduleSchema,
  defaultAutomationSchedule,
  formatAutomationSchedule,
  formatScheduledInstant,
  getNextAutomationRunAt,
  readAutomationSchedule,
} from "@/lib/automations/schedule"

import { defineNode } from "../node-descriptor"

export const timeActivateNode = defineNode({
  kind: "timeActivate",
  palette: {
    key: "trigger-time-activate",
    group: "Triggers",
    description: "Start once, daily, weekly, or monthly at a chosen local time",
  },
  createSettings: () => ({ schedule: defaultAutomationSchedule() }),
  settingsSchema: z.object({ schedule: automationScheduleSchema }),
  name: () => "Time",
  description: (settings) => {
    const schedule = readAutomationSchedule(settings)
    if (!schedule) return "Choose when this flow starts."
    const next = getNextAutomationRunAt(schedule)
    return next
      ? `Next: ${formatScheduledInstant(next, schedule.timezone)}`
      : `${formatAutomationSchedule(schedule)} · finished`
  },
  icon: Clock3Icon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: false,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/time-activate-panel"),
})
