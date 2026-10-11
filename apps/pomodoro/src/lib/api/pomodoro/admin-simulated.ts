import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { appSettingSchemas } from "@/lib/pomodoro/app-settings"
import { PERSONALITY_MAX } from "@/lib/pomodoro/simulated-voice"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { adminGet, adminPost } from "@/server/guards"
import {
  listSimulatedUserIds,
  loadSimulatedStatus,
  removeAllSimulated,
  requestMakeNow,
  type SimulatedStatus,
} from "@/server/pomodoro/simulated-accounts"
import { loadPersonality, previewVoice, savePersonality } from "@/server/pomodoro/simulated-voice"
import { giveMadeUpMembersFiles } from "@/server/pomodoro/simulated-shares"
import {
  listSimulatedLines,
  listSimulatedWatch,
  readSimulatedSummary,
  readTodaySchedule,
  setSimulatedPaused,
  type ScheduleHour,
  type SimulatedLineRow,
  type SimulatedSummary,
  type SimulatedWatchRow,
} from "@/server/pomodoro/simulated-watch"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import { ADMIN_PAGE_SIZE_MAX, SIMULATED_SORT_COLUMNS, SIMULATED_TABS } from "@/lib/pomodoro/admin-lists"

/**
 * The Made-up members tab under Settings → App settings, and the mark on the
 * admin lists. Every door is behind `adminGet` or `adminPost`. See
 * `workspace/docs/made-up-members.md`. How many, Hours a day and Pause
 * everything save through the ordinary setting door in `app-settings.ts`.
 */
export type { SimulatedStatus }

export const getSimulatedErrorMessage = createErrorMessage(
  {
    NOT_MADE_UP: "That account is not one of the made-up members.",
    PIXABAY_IMPORTS_OFF: "Add a Pixabay key on the Pixabay tab first.",
    NO_MADE_UP_MEMBERS: "There are no made-up members yet. Make them first.",
    RATE_LIMITED: "That is a lot of Previews in a few minutes. Wait a little and try again.",
  },
  "That did not work. Please try again."
)

const statusFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => loadSimulatedStatus())

const makeNowFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(({ context }) => requestMakeNow(context.user.id))

const removeAllFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(({ context }) => removeAllSimulated(context.user.id))

const idsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => listSimulatedUserIds())

export const loadSimulatedMembers = () => statusFn()
export const makeSimulatedMembersNow = () => makeNowFn()
export const removeAllSimulatedMembers = () => removeAllFn()
export const loadSimulatedMemberIds = () => idsFn()

/** "Give them files to share": Pixabay links, one per line (task 05, part 9). */
const giveFilesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ links: z.array(z.string().max(500)).min(1).max(50) }))
  .handler(({ data, context }) =>
    giveMadeUpMembersFiles({ links: data.links, actorUserId: context.user.id })
  )

export const giveMadeUpMembersSharedFiles = (links: string[]) =>
  giveFilesFn({ data: { links } })

/**
 * Preview spends real AI money, so it is held to twenty in ten minutes per
 * admin. Each one writes five lines and sends them nowhere.
 */
const previewFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(appSettingSchemas["simulated.voice"])
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`simulated-preview:${context.user.id}`, { maxAttempts: 20, windowSeconds: 600 })
    return previewVoice(context.user.id, data)
  })

const userIdSchema = z.object({ userId: z.string().trim().min(1).max(36) })

const loadVoiceFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(userIdSchema)
  .handler(({ data }) => loadPersonality(data.userId))

const saveVoiceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(userIdSchema.extend({ personality: z.string().trim().max(PERSONALITY_MAX) }))
  .handler(({ data, context }) => savePersonality(context.user.id, data.userId, data.personality))

export const previewSimulatedVoice = (voice: z.input<(typeof appSettingSchemas)["simulated.voice"]>) =>
  previewFn({ data: voice })
export const loadSimulatedPersonality = (userId: string) => loadVoiceFn({ data: { userId } })
export const saveSimulatedPersonality = (userId: string, personality: string) =>
  saveVoiceFn({ data: { userId, personality } })

// ---------------------------------------------------------------------------
// The watch page, /admin/pomodoro-simulated (live activity task 05)
// ---------------------------------------------------------------------------

export type { ScheduleHour, SimulatedLineRow, SimulatedSummary, SimulatedWatchRow }

const watchQuerySchema = z.object({
  tab: z.enum(SIMULATED_TABS).default("today"),
  search: z.string().trim().max(120).default(""),
  sort: z.enum(SIMULATED_SORT_COLUMNS).default("hours"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})
export type SimulatedWatchQuery = z.input<typeof watchQuerySchema>

const linesQuerySchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})

const watchFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(watchQuerySchema)
  .handler(({ data }) => listSimulatedWatch(data))

const linesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(linesQuerySchema)
  .handler(({ data }) => listSimulatedLines(data))

/** The summary line and the schedule, read together and again every minute. */
const overviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => {
    const [summary, schedule] = await Promise.all([readSimulatedSummary(), readTodaySchedule()])
    return { summary, schedule }
  })

/** Everything the page draws first, so it opens with no loading row. */
const watchPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(watchQuerySchema.omit({ pageSize: true }).extend({ linesPage: z.number().int().min(1).max(10_000).default(1) }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    const { linesPage, ...watch } = data
    const [list, lines, summary, schedule] = await Promise.all([
      listSimulatedWatch({ ...watch, pageSize }),
      listSimulatedLines({ page: linesPage, pageSize }),
      readSimulatedSummary(),
      readTodaySchedule(),
    ])
    return { list, lines, summary, schedule, pageSize }
  })

const setPausedFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ userIds: z.array(z.string().trim().min(1).max(36)).min(1).max(200), paused: z.boolean() }))
  .handler(({ data, context }) => setSimulatedPaused({ ...data, actorUserId: context.user.id }))

export const listSimulatedWatchRows = (data: SimulatedWatchQuery) => watchFn({ data })
export const listSimulatedLineRows = (data: z.input<typeof linesQuerySchema>) => linesFn({ data })
export const loadSimulatedOverview = () => overviewFn()
export const loadSimulatedWatchPage = (data: Omit<SimulatedWatchQuery, "pageSize"> & { linesPage?: number }) =>
  watchPageFn({ data })
export const setSimulatedMembersPaused = (userIds: string[], paused: boolean) =>
  setPausedFn({ data: { userIds, paused } })
