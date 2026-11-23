import { z } from "zod"

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

const sendWindowSchema = z.object({
  start: z.string().regex(TIME_PATTERN),
  end: z.string().regex(TIME_PATTERN),
})

type BroadcastSendWindow = z.infer<typeof sendWindowSchema>

const dripConfigSchema = z
  .object({
    enabled: z.literal(true),
    batchSizeMin: z.number().int().min(1).max(1000),
    batchSizeMax: z.number().int().min(1).max(1000),
    intervalMinMinutes: z.number().int().min(1).max(1440),
    intervalMaxMinutes: z.number().int().min(1).max(1440),
    failureThresholdPercent: z.number().min(1).max(100),
    skipWeekends: z.boolean().default(false),
    sendWindows: z.array(sendWindowSchema).max(2).default([]),
    sendWindowTimezone: z.string().max(64).default("America/New_York"),
  })
  .refine((config) => config.batchSizeMax >= config.batchSizeMin, {
    message: "Batch size max must be at least the min",
  })
  .refine((config) => config.intervalMaxMinutes >= config.intervalMinMinutes, {
    message: "Interval max must be at least the min",
  })

export const broadcastDripConfigSchema = z.union([
  z.object({ enabled: z.literal(false) }),
  dripConfigSchema,
])

export type BroadcastDripConfig = z.infer<typeof broadcastDripConfigSchema>
export type EnabledDripConfig = Extract<BroadcastDripConfig, { enabled: true }>

export const DEFAULT_DRIP_FORM_VALUES = {
  batchSizeMin: 400,
  batchSizeMax: 500,
  intervalMinMinutes: 30,
  intervalMaxMinutes: 60,
  failureThresholdPercent: 10,
} as const

export function parseDripConfig(value: unknown): BroadcastDripConfig {
  const parsed = broadcastDripConfigSchema.safeParse(value)
  return parsed.success ? parsed.data : { enabled: false }
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number)
  return hours * 60 + minutes
}

function localizedNow(timezone: string, now: Date) {
  try {
    return new Date(now.toLocaleString("en-US", { timeZone: timezone }))
  } catch {
    return now
  }
}

function isMinuteInWindow(currentMinutes: number, window: BroadcastSendWindow) {
  const start = timeToMinutes(window.start)
  const end = timeToMinutes(window.end)
  if (start === end) return true
  if (start < end) return currentMinutes >= start && currentMinutes < end
  // Overnight window (e.g. 22:00 - 06:00)
  return currentMinutes >= start || currentMinutes < end
}

export function isWithinSendWindow(config: EnabledDripConfig, now: Date) {
  const local = localizedNow(config.sendWindowTimezone, now)

  if (config.skipWeekends && (local.getDay() === 0 || local.getDay() === 6)) {
    return false
  }

  if (config.sendWindows.length === 0) return true

  const currentMinutes = local.getHours() * 60 + local.getMinutes()
  return config.sendWindows.some((window) =>
    isMinuteInWindow(currentMinutes, window)
  )
}

export function formatSendWindows(config: EnabledDripConfig) {
  const formatTime = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number)
    const period = hours >= 12 ? "pm" : "am"
    const displayHour = hours % 12 || 12
    return minutes === 0
      ? `${displayHour}${period}`
      : `${displayHour}:${String(minutes).padStart(2, "0")}${period}`
  }

  const windows = config.sendWindows
    .map((window) => `${formatTime(window.start)}-${formatTime(window.end)}`)
    .join(" and ")
  const weekdays = config.skipWeekends ? " on weekdays" : ""
  if (!windows) return config.skipWeekends ? "weekdays" : "any time"
  return `${windows}${weekdays}`
}
