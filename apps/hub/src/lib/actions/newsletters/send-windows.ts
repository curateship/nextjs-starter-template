export type NewsletterSendWindow = {
  start: string
  end: string
}

export const DEFAULT_NEWSLETTER_SEND_WINDOWS: NewsletterSendWindow[] = [
  { start: '08:00', end: '13:00' },
  { start: '19:00', end: '21:00' },
]

export const DEFAULT_NEWSLETTER_SEND_WINDOW_TIMEZONE = 'America/New_York'

export const DEFAULT_NEWSLETTER_DRIP_CONFIG = {
  enabled: true,
  batch_size_min: 400,
  batch_size_max: 500,
  interval_min_minutes: 30,
  interval_max_minutes: 60,
  bounce_threshold_percent: 5,
  skip_weekends: false,
  send_windows: DEFAULT_NEWSLETTER_SEND_WINDOWS,
  send_window_start: DEFAULT_NEWSLETTER_SEND_WINDOWS[0].start,
  send_window_end: DEFAULT_NEWSLETTER_SEND_WINDOWS[0].end,
  send_window_timezone: DEFAULT_NEWSLETTER_SEND_WINDOW_TIMEZONE,
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value)
}

function normalizeWindow(value: unknown): NewsletterSendWindow | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Record<string, unknown>
  if (!isValidTime(candidate.start) || !isValidTime(candidate.end)) return null

  return {
    start: candidate.start,
    end: candidate.end,
  }
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function currentMinutesInTimezone(timezone: string, now: Date) {
  try {
    const localizedNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
    return localizedNow.getHours() * 60 + localizedNow.getMinutes()
  } catch {
    return now.getHours() * 60 + now.getMinutes()
  }
}

function currentDayInTimezone(timezone: string, now: Date) {
  try {
    const localizedNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
    return localizedNow.getDay()
  } catch {
    return now.getDay()
  }
}

function isWeekendInTimezone(timezone: string, now: Date) {
  const day = currentDayInTimezone(timezone, now)
  return day === 0 || day === 6
}

function isMinuteInWindow(currentMinutes: number, window: NewsletterSendWindow) {
  const start = timeToMinutes(window.start)
  const end = timeToMinutes(window.end)

  if (start === end) return true
  if (start < end) return currentMinutes >= start && currentMinutes < end
  return currentMinutes >= start || currentMinutes < end
}

function isNewsletterSendWindow(value: NewsletterSendWindow | null): value is NewsletterSendWindow {
  return value !== null
}

export function getNewsletterSendWindows(dripConfig: Record<string, unknown> | null | undefined) {
  if (!dripConfig) return []

  const windows = Array.isArray(dripConfig.send_windows)
    ? dripConfig.send_windows.map(normalizeWindow).filter(isNewsletterSendWindow)
    : []

  if (windows.length > 0) return windows
  if (isValidTime(dripConfig.send_window_start) && isValidTime(dripConfig.send_window_end)) {
    return [{ start: dripConfig.send_window_start, end: dripConfig.send_window_end }]
  }

  return []
}

export function isWithinNewsletterSendWindow(dripConfig: Record<string, unknown> | null | undefined, now = new Date()) {
  const timezone = typeof dripConfig?.send_window_timezone === 'string'
    ? dripConfig.send_window_timezone
    : DEFAULT_NEWSLETTER_SEND_WINDOW_TIMEZONE

  if (dripConfig?.skip_weekends === true && isWeekendInTimezone(timezone, now)) return false

  const windows = getNewsletterSendWindows(dripConfig)
  if (windows.length === 0) return true

  const currentMinutes = currentMinutesInTimezone(timezone, now)

  return windows.some((window) => isMinuteInWindow(currentMinutes, window))
}

export function formatNewsletterSendWindows(dripConfig: Record<string, unknown> | null | undefined, fallback = 'window') {
  const windows = getNewsletterSendWindows(dripConfig)
  const weekendsLabel = dripConfig?.skip_weekends === true ? ' on weekdays' : ''
  if (windows.length === 0) return dripConfig?.skip_weekends === true ? 'weekdays' : fallback

  const formatTime = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number)
    const period = hours >= 12 ? 'pm' : 'am'
    const displayHour = hours % 12 || 12

    if (minutes === 0) return `${displayHour}${period}`
    return `${displayHour}:${String(minutes).padStart(2, '0')}${period}`
  }

  return `${windows.map((window) => `${formatTime(window.start)} - ${formatTime(window.end)}`).join(' and ')}${weekendsLabel}`
}
