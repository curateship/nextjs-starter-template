import { addDays, localNow, weekdayOf } from "@/lib/project/days"
import type { DayMeeting } from "@/lib/project/meetings"

/**
 * The Team calendar's Week view: seven days from Monday, with each meeting
 * drawn at its time in the viewer's own zone, on the viewer's own day.
 */

/** Monday to Sunday of the week holding `day`. */
export function weekDays(day: string) {
  const monday = addDays(day, -((weekdayOf(day) + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

export type WeekBlock = DayMeeting & {
  /** Minutes after midnight on the viewer's day. */
  start: number
  end: number
  /** Side by side when meetings overlap: which slot, out of how many. */
  slot: number
  slots: number
}

const DAY_MINUTES = 24 * 60
/** Short meetings still get room for their name. */
const SHORTEST = 20

function minutesOf(at: string, zone: string) {
  const [hour, minute] = localNow(new Date(at), zone).time.split(":").map(Number)
  return hour * 60 + minute
}

/**
 * One day's meetings as blocks. A meeting running past midnight is cut at the
 * end of the viewer's day, since it starts on this one. Meetings that overlap
 * share the width, each in its own slot.
 */
export function dayBlocks(meetings: DayMeeting[], zone: string): WeekBlock[] {
  const blocks = meetings
    .map((item) => {
      const start = minutesOf(item.occurrence.startsAt, zone)
      const sameDay = localNow(new Date(item.occurrence.endsAt), zone).day === item.occurrence.day
      const end = sameDay ? minutesOf(item.occurrence.endsAt, zone) : DAY_MINUTES
      return { ...item, start, end: Math.max(end, start + SHORTEST), slot: 0, slots: 1 }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)

  // Meetings that touch each other, directly or through another, form a group
  // that shares the width; inside it each takes the first free slot.
  let group: WeekBlock[] = []
  let groupEnd = -1
  const close = () => {
    const slots = Math.max(1, ...group.map((block) => block.slot + 1))
    for (const block of group) block.slots = slots
    group = []
  }
  for (const block of blocks) {
    if (block.start >= groupEnd) {
      close()
      groupEnd = -1
    }
    const taken = new Set(group.filter((other) => other.end > block.start).map((other) => other.slot))
    let slot = 0
    while (taken.has(slot)) slot += 1
    block.slot = slot
    group.push(block)
    groupEnd = Math.max(groupEnd, block.end)
  }
  close()
  return blocks
}

/**
 * The hours the week shows: a working day, 8:00 to 18:00, widened to fit any
 * meeting earlier or later, so nothing is drawn off the edge.
 */
export function weekHours(blocks: WeekBlock[]) {
  const first = Math.min(8, ...blocks.map((block) => Math.floor(block.start / 60)))
  const last = Math.max(18, ...blocks.map((block) => Math.ceil(block.end / 60)))
  return { first, last: Math.min(24, last) }
}
