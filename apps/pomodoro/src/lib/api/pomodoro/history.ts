import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import {
  loadFocusReport,
  loadFocusReportSessions,
} from "@/server/pomodoro/focus-report"
import { loadOrCreateProfile } from "@/server/pomodoro/profile"
import { localDateFor } from "@/server/pomodoro/productivity"
import { isLongRangeReport, reportRanges } from "@/lib/pomodoro/focus-history"
import {
  buildFocusHistoryCsv,
  focusHistoryFileName,
} from "@/lib/pomodoro/report-csv"

/**
 * The History page's endpoints. The 12-month and year ranges are one Pro
 * perk (a free 12 months would make gating the year meaningless), refused
 * with PRO_REQUIRED. Date maths runs in the profile's timezone in JS,
 * never in SQL.
 */

const historySchema = z.object({
  range: z.enum(reportRanges),
  page: z.number().int().min(0).max(1_000).default(0),
  timezone: z.string().min(1).max(60),
})

async function reportContext(userId: string, browserTimezone: string) {
  const [profile, entitlements] = await Promise.all([
    loadOrCreateProfile(userId, browserTimezone),
    loadPomodoroEntitlements(userId),
  ])
  return {
    timezone: profile.timezone,
    today: localDateFor(profile.timezone),
    longRangeUnlocked: entitlements.canUseLongRangeReports,
  }
}

const loadFocusHistoryFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(historySchema)
  .handler(async ({ data, context }) => {
    const { timezone, today, longRangeUnlocked } = await reportContext(
      context.user.id,
      data.timezone
    )
    if (isLongRangeReport(data.range) && !longRangeUnlocked)
      throw new Error("PRO_REQUIRED")
    const report = await loadFocusReport(
      context.user.id,
      data.range,
      today,
      timezone,
      data.page
    )
    return { ...report, longRangeUnlocked }
  })

const exportFocusHistoryFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(historySchema.omit({ page: true }))
  .handler(async ({ data, context }) => {
    const { timezone, today, longRangeUnlocked } = await reportContext(
      context.user.id,
      data.timezone
    )
    if (isLongRangeReport(data.range) && !longRangeUnlocked)
      throw new Error("PRO_REQUIRED")
    const report = await loadFocusReportSessions(
      context.user.id,
      data.range,
      today,
      timezone
    )
    return {
      fileName: focusHistoryFileName(data.range, report.startDate, report.endDate),
      csv: buildFocusHistoryCsv(report.rows),
    }
  })

export const loadFocusHistory = (data: z.infer<typeof historySchema>) =>
  loadFocusHistoryFn({ data })
export const exportFocusHistory = (data: {
  range: z.infer<typeof historySchema>["range"]
  timezone: string
}) => exportFocusHistoryFn({ data })
