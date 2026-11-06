/** Where a meeting of today stands against the clock. */
export type MeetingWhen = "now" | "later" | "done"

/**
 * Today's meetings for the site admin's Meetings today card: the one on now
 * first, then the ones still to come, then the finished ones, each in start
 * order (polish, Tyler, 6 Nov 2026: a 9 AM meeting no longer looks current at
 * 3 PM). A meeting is on from its start up to, not including, its end.
 */
export function meetingsByNow<T extends { startsAt: string; endsAt: string }>(
  meetings: readonly T[],
  nowMs: number
): { meeting: T; when: MeetingWhen }[] {
  const rank: Record<MeetingWhen, number> = { now: 0, later: 1, done: 2 }
  return meetings
    .map((meeting) => {
      const starts = Date.parse(meeting.startsAt)
      const ends = Date.parse(meeting.endsAt)
      const when: MeetingWhen = ends <= nowMs ? "done" : starts <= nowMs ? "now" : "later"
      return { meeting, when, starts }
    })
    .sort((a, b) => rank[a.when] - rank[b.when] || a.starts - b.starts)
    .map(({ meeting, when }) => ({ meeting, when }))
}
