import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  countHeldMessages,
  countLiveRooms,
  deleteChatMessages,
  liftRoomBans,
  listChatMessages,
  listChatRooms,
  listHiddenProfiles,
  listRoomBans,
  listSuspensions,
  loadRoomChat,
  messageLiveRooms,
  releaseHeldMessages,
  showHiddenProfiles,
  type AdminChatMessage,
  type AdminChatRoomRow,
  type AdminChatSearchRow,
  type AdminHiddenProfileRow,
  type AdminRoomBanRow,
  type AdminRoomChat,
  type AdminSuspensionRow,
} from "@/server/pomodoro/admin-chat"
import { forgetHiddenProfiles } from "@/server/pomodoro/profile-reports"
import { nudgeRooms } from "@/server/pomodoro/rooms"
import {
  listWarnings,
  liftSuspensions,
  suspendMembers,
  warnMembers,
} from "@/server/pomodoro/safety"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import {
  ADMIN_PAGE_SIZE_MAX,
  CHAT_ROOM_SORT_COLUMNS,
  CHAT_STATUS_FILTERS,
  CHAT_TABS,
  SAFETY_TABS,
} from "@/lib/pomodoro/admin-lists"

/**
 * The Chat dashboard and the safety tools' doors (admin task 05), every one
 * behind `adminGet` or `adminPost`. See `workspace/docs/admin-safety-tools.md`.
 */
export type {
  AdminChatMessage,
  AdminChatRoomRow,
  AdminChatSearchRow,
  AdminHiddenProfileRow,
  AdminRoomBanRow,
  AdminRoomChat,
  AdminSuspensionRow,
}

export const getSafetyErrorMessage = createErrorMessage(
  { ROOM_NOT_FOUND: "That room is no longer there. The list has been refreshed." },
  "That did not work. Please try again."
)

const idsSchema = z.array(z.string().uuid()).min(1).max(ADMIN_PAGE_SIZE_MAX)
const userIdsSchema = z.array(z.string().trim().min(1).max(36)).min(1).max(ADMIN_PAGE_SIZE_MAX)

// ---------------------------------------------------------------------------
// Chat dashboard
// ---------------------------------------------------------------------------

const chatQuerySchema = z.object({
  tab: z.enum(CHAT_TABS).default("rooms"),
  search: z.string().trim().max(120).default(""),
  status: z.enum(CHAT_STATUS_FILTERS).default("all"),
  sort: z.enum(CHAT_ROOM_SORT_COLUMNS).default("last"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})
export type ChatQuery = z.input<typeof chatQuerySchema>

async function readChatList(data: z.output<typeof chatQuerySchema>) {
  if (data.tab === "rooms") return { tab: "rooms" as const, ...(await listChatRooms(data)) }
  return {
    tab: data.tab,
    ...(await listChatMessages({ search: data.search, held: data.tab === "held", page: data.page, pageSize: data.pageSize })),
  }
}

const listChatFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(chatQuerySchema)
  .handler(({ data }) => readChatList(data))

const loadChatPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(chatQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    const [list, liveRooms, held] = await Promise.all([
      readChatList({ ...data, pageSize }),
      countLiveRooms(),
      countHeldMessages(),
    ])
    return { list, pageSize, liveRooms, held }
  })

const loadRoomChatFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ roomId: z.string().uuid() }))
  .handler(({ data }) => loadRoomChat(data.roomId))

const deleteMessagesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema }))
  .handler(async ({ data, context }) => {
    const { roomIds, ...result } = await deleteChatMessages({ messageIds: data.ids, actorUserId: context.user.id })
    await nudgeRooms(roomIds, "message")
    return result
  })

const releaseMessagesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema }))
  .handler(async ({ data, context }) => {
    const { roomIds, ...result } = await releaseHeldMessages({ messageIds: data.ids, actorUserId: context.user.id })
    await nudgeRooms(roomIds, "message")
    return result
  })

const countLiveRoomsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => countLiveRooms())

const messageLiveRoomsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().trim().min(1).max(500) }))
  .handler(async ({ data, context }) => {
    const { roomIds } = await messageLiveRooms({ body: data.body, actorUserId: context.user.id })
    await nudgeRooms(roomIds, "message")
    return { reached: roomIds.length }
  })

// ---------------------------------------------------------------------------
// Warn and suspend
// ---------------------------------------------------------------------------

const warnFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ userIds: userIdsSchema, message: z.string().trim().min(1).max(500) }))
  .handler(({ data, context }) =>
    warnMembers({ userIds: data.userIds, message: data.message, actorUserId: context.user.id })
  )

const warningsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ userId: z.string().trim().min(1).max(36) }))
  .handler(({ data }) => listWarnings(data.userId))

const suspendFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userIds: userIdsSchema,
      days: z.union([z.literal(1), z.literal(7), z.literal(30)]).nullable(),
      reason: z.string().trim().min(1).max(300),
    })
  )
  .handler(async ({ data, context }) => {
    const { suspended, touchedRooms } = await suspendMembers({
      userIds: data.userIds,
      days: data.days,
      reason: data.reason,
      actorUserId: context.user.id,
    })
    // A host's room ended with them, so its screens say so; anybody else's
    // room just loses one person.
    await nudgeRooms(touchedRooms.filter((room) => room.closed).map((room) => room.id), "phase")
    await nudgeRooms(touchedRooms.filter((room) => !room.closed).map((room) => room.id), "membership")
    return { suspended }
  })

// ---------------------------------------------------------------------------
// Bans, hidden profiles and suspensions
// ---------------------------------------------------------------------------

const safetyQuerySchema = z.object({
  tab: z.enum(SAFETY_TABS).default("bans"),
  search: z.string().trim().max(120).default(""),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})
export type SafetyQuery = z.input<typeof safetyQuerySchema>

async function readSafetyList(data: z.output<typeof safetyQuerySchema>) {
  if (data.tab === "bans") return { tab: "bans" as const, ...(await listRoomBans(data)) }
  if (data.tab === "hidden") return { tab: "hidden" as const, ...(await listHiddenProfiles(data)) }
  return { tab: "suspensions" as const, ...(await listSuspensions(data)) }
}

const listSafetyFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(safetyQuerySchema)
  .handler(({ data }) => readSafetyList(data))

const loadSafetyPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(safetyQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await readSafetyList({ ...data, pageSize }), pageSize }
  })

const liftFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ tab: z.enum(SAFETY_TABS), ids: userIdsSchema }))
  .handler(async ({ data, context }) => {
    const actorUserId = context.user.id
    // Bans and suspensions are named by their own uuid; hidden profiles by
    // the account's id, which is not always one.
    if (data.tab !== "hidden" && !z.array(z.string().uuid()).safeParse(data.ids).success)
      throw new Error("INVALID_ID")
    if (data.tab === "bans") return liftRoomBans({ banIds: data.ids, actorUserId })
    if (data.tab === "suspensions") return liftSuspensions({ suspensionIds: data.ids, actorUserId })
    const { handles, ...result } = await showHiddenProfiles({ userIds: data.ids, actorUserId })
    // A shown profile must read on the very next request.
    forgetHiddenProfiles(handles)
    return result
  })

export const listPomodoroChat = (data: ChatQuery) => listChatFn({ data })
export const loadPomodoroChatPage = (data: Omit<ChatQuery, "pageSize">) => loadChatPageFn({ data })
export const loadPomodoroRoomChat = (roomId: string) => loadRoomChatFn({ data: { roomId } })
export const deletePomodoroMessages = (ids: string[]) => deleteMessagesFn({ data: { ids } })
export const releasePomodoroMessages = (ids: string[]) => releaseMessagesFn({ data: { ids } })
export const countPomodoroLiveRooms = () => countLiveRoomsFn()
export const messagePomodoroLiveRooms = (body: string) => messageLiveRoomsFn({ data: { body } })
export const warnPomodoroMembers = (userIds: string[], message: string) =>
  warnFn({ data: { userIds, message } })
export const loadPomodoroWarnings = (userId: string) => warningsFn({ data: { userId } })
export const suspendPomodoroMembers = (userIds: string[], days: 1 | 7 | 30 | null, reason: string) =>
  suspendFn({ data: { userIds, days, reason } })
export const listPomodoroSafety = (data: SafetyQuery) => listSafetyFn({ data })
export const loadPomodoroSafetyPage = (data: Omit<SafetyQuery, "pageSize">) => loadSafetyPageFn({ data })
export const liftPomodoroSafety = (tab: (typeof SAFETY_TABS)[number], ids: string[]) =>
  liftFn({ data: { tab, ids } })
