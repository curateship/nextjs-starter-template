export const DIRECTORY_OPENING_HOURS_BLOCK_TYPE = "directory-opening-hours"

export const DIRECTORY_OPENING_HOURS_FIELD_MASK =
  "regularOpeningHours,currentOpeningHours,timeZone,attributions"

export interface DirectoryOpeningHoursAttribution {
  provider: string
  providerUri?: string
}

export interface DirectoryOpeningHoursRow {
  day: string
  hours: string
  isToday: boolean
}

export interface DirectoryOpeningHoursData {
  rows: DirectoryOpeningHoursRow[]
  timeZone: string
  openNow: boolean
  attributions: DirectoryOpeningHoursAttribution[]
}

const DAY_LABELS: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
}

const DAY_ALIASES: Record<string, string> = {
  sun: "sunday",
  sunday: "sunday",
  mon: "monday",
  monday: "monday",
  tue: "tuesday",
  tues: "tuesday",
  tuesday: "tuesday",
  wed: "wednesday",
  weds: "wednesday",
  wednesday: "wednesday",
  thu: "thursday",
  thur: "thursday",
  thurs: "thursday",
  thursday: "thursday",
  fri: "friday",
  friday: "friday",
  sat: "saturday",
  saturday: "saturday",
}

export function normalizeDirectoryOpeningHoursPlaceId(value?: unknown): string {
  if (typeof value !== "string") return ""

  return value
    .trim()
    .replace(/^places\//i, "")
    .slice(0, 256)
}

function getDayKey(value: string) {
  return DAY_ALIASES[value.trim().toLowerCase().replace(/\.$/, "")]
}

function getTodayKey(timeZone: string, now: Date) {
  if (!timeZone) return ""

  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone,
    }).format(now).toLowerCase()
  } catch {
    return ""
  }
}

function parseWeekdayDescription(description: string, todayKey: string): DirectoryOpeningHoursRow | null {
  const separatorIndex = description.indexOf(":")
  if (separatorIndex === -1) return null

  const rawDay = description.slice(0, separatorIndex).trim()
  const hours = description.slice(separatorIndex + 1).trim()
  if (!rawDay || !hours) return null

  const dayKey = getDayKey(rawDay) || rawDay.toLowerCase()

  return {
    day: DAY_LABELS[dayKey] || rawDay,
    hours,
    isToday: Boolean(todayKey && dayKey === todayKey),
  }
}

function sanitizeAttributionUri(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : ""
  } catch {
    return ""
  }
}

function getAttributions(value: unknown): DirectoryOpeningHoursAttribution[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const attribution = item as Record<string, unknown>
      const provider = typeof attribution.provider === "string" ? attribution.provider.trim() : ""
      const providerUri = typeof attribution.providerUri === "string"
        ? sanitizeAttributionUri(attribution.providerUri.trim())
        : ""

      if (!provider) return null
      return {
        provider,
        ...(providerUri ? { providerUri } : {}),
      }
    })
    .filter((item): item is DirectoryOpeningHoursAttribution => Boolean(item))
}

export function parseDirectoryOpeningHoursPlace(
  value: unknown,
  now = new Date()
): DirectoryOpeningHoursData | null {
  if (!value || typeof value !== "object") return null

  const place = value as Record<string, any>
  const openingHours = place.currentOpeningHours || place.regularOpeningHours
  const weekdayDescriptions: string[] = Array.isArray(openingHours?.weekdayDescriptions)
    ? openingHours.weekdayDescriptions.filter((item: unknown): item is string => typeof item === "string")
    : []
  const timeZone = typeof place.timeZone?.id === "string" ? place.timeZone.id : ""
  const todayKey = getTodayKey(timeZone, now)
  const rows = weekdayDescriptions
    .map((description) => parseWeekdayDescription(description, todayKey))
    .filter((row): row is DirectoryOpeningHoursRow => Boolean(row))

  if (rows.length === 0) return null

  return {
    rows,
    timeZone,
    openNow: place.currentOpeningHours?.openNow === true,
    attributions: getAttributions(place.attributions),
  }
}
