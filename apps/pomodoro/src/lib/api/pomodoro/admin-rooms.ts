import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  cancelAdminInvites,
  closeAdminRooms,
  deleteRoomPresets,
  listAdminInvites,
  listRoomPresets,
  loadAdminRoom,
  saveAdminRoom,
  saveRoomPreset,
  setAdminRoomRepeatsFeatured,
  setAdminRoomsFeatured,
  type AdminInviteRow,
  type AdminRoomItem,
  type RoomPreset,
} from "@/server/pomodoro/admin-rooms"
import { loadMediaCatalog } from "@/server/pomodoro/catalog"
import { nudgeRooms } from "@/server/pomodoro/rooms"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import {
  ADMIN_PAGE_SIZE_MAX,
  INVITE_SORT_COLUMNS,
  INVITE_STATUS_FILTERS,
} from "@/lib/pomodoro/admin-lists"
import { roomPairProblem, roomPairProblemMessage } from "@/lib/pomodoro/media-pair"

/**
 * The rooms admin's doors (admin task 04), every one behind `adminGet` or
 * `adminPost`. See `workspace/docs/rooms-admin.md`.
 */
export type { AdminInviteRow, AdminRoomItem, RoomPreset }

export const getRoomsAdminErrorMessage = createErrorMessage(
  {
    ROOM_NOT_FOUND: "That room is no longer there. The list has been refreshed.",
    ROOM_CLOSED: "That room has ended, so it cannot be changed.",
    PRESET_NOT_FOUND: "That preset is no longer there.",
  },
  "That did not work. Please try again."
)

const idsSchema = z.array(z.string().uuid()).min(1).max(ADMIN_PAGE_SIZE_MAX)

const closeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema }))
  .handler(async ({ data, context }) => {
    const result = await closeAdminRooms({ roomIds: data.ids, actorUserId: context.user.id })
    await nudgeRooms(result.closed, "phase")
    return result
  })

const loadRoomFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    // The window's sound and theme pickers list the Live catalogue, which an
    // admin page does not otherwise carry.
    const [room, catalog] = await Promise.all([loadAdminRoom(data.id), loadMediaCatalog()])
    return { room, catalog }
  })

const roomInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  visibility: z.enum(["public", "unlisted"]),
  // The same ceilings a host's own room has.
  focusMinutes: z.number().int().min(1).max(90),
  shortBreakMinutes: z.number().int().min(1).max(90),
  longBreakMinutes: z.number().int().min(1).max(90),
  autoStart: z.boolean(),
  sound: z.string().max(200),
  background: z.string().max(200),
  featured: z.boolean(),
})

const saveRoomFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(roomInputSchema)
  .handler(async ({ data, context }) => {
    const { id, ...input } = data
    // The same rule a host's pick follows: Live catalogue items, or a group.
    const problem = roomPairProblem(await loadMediaCatalog(), input.sound, input.background)
    if (problem) throw new Error(`ROOM_PAIR_REJECTED: ${roomPairProblemMessage(problem)}`)
    const saved = await saveAdminRoom({ id, input, actorUserId: context.user.id })
    // "phase" makes every open screen read the room again, name and all.
    await nudgeRooms([id], "phase")
    return { id: saved.id }
  })

const featureRoomsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema, featured: z.boolean() }))
  .handler(({ data, context }) =>
    setAdminRoomsFeatured({ roomIds: data.ids, featured: data.featured, actorUserId: context.user.id })
  )

const featureRepeatsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema, featured: z.boolean() }))
  .handler(({ data, context }) =>
    setAdminRoomRepeatsFeatured({
      repeatIds: data.ids,
      featured: data.featured,
      actorUserId: context.user.id,
    })
  )

const inviteQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  status: z.enum(INVITE_STATUS_FILTERS).default("all"),
  sort: z.enum(INVITE_SORT_COLUMNS).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})
export type InviteQuery = z.input<typeof inviteQuerySchema>

const listInvitesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(inviteQuerySchema)
  .handler(({ data }) => listAdminInvites(data))

const loadInvitesPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(inviteQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminInvites({ ...data, pageSize }), pageSize }
  })

const cancelInvitesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema }))
  .handler(async ({ data, context }) => {
    const { cancelled, skipped } = await cancelAdminInvites({ inviteIds: data.ids, actorUserId: context.user.id })
    return { deleted: cancelled, skipped }
  })

const listPresetsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => listRoomPresets())

const presetSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(60),
  focusMinutes: z.number().int().min(1).max(90),
  shortBreakMinutes: z.number().int().min(1).max(90),
  longBreakMinutes: z.number().int().min(1).max(90),
  autoStart: z.boolean(),
  sound: z.string().max(200).nullable(),
  background: z.string().max(200).nullable(),
})
export type RoomPresetPayload = z.input<typeof presetSchema>

const savePresetFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(presetSchema)
  .handler(async ({ data, context }) => {
    const { id, ...input } = data
    // Either half may be left for the host to pick. An unset half stands in
    // as shuffle, which always passes, so only the half that is set is checked.
    if (input.sound || input.background) {
      const problem = roomPairProblem(
        await loadMediaCatalog(),
        input.sound ?? "shuffle",
        input.background ?? "shuffle"
      )
      if (problem) throw new Error(`ROOM_PAIR_REJECTED: ${roomPairProblemMessage(problem)}`)
    }
    return saveRoomPreset({ id, input, actorUserId: context.user.id })
  })

const deletePresetsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema }))
  .handler(({ data, context }) =>
    deleteRoomPresets({ presetIds: data.ids, actorUserId: context.user.id })
  )

export const closePomodoroRooms = (ids: string[]) => closeFn({ data: { ids } })
export const loadPomodoroRoom = (id: string) => loadRoomFn({ data: { id } })
export const savePomodoroRoom = (data: z.input<typeof roomInputSchema>) => saveRoomFn({ data })
export const featurePomodoroRooms = (ids: string[], featured: boolean) =>
  featureRoomsFn({ data: { ids, featured } })
export const featurePomodoroRoomRepeats = (ids: string[], featured: boolean) =>
  featureRepeatsFn({ data: { ids, featured } })
export const listPomodoroInvites = (data: InviteQuery) => listInvitesFn({ data })
export const loadPomodoroInvitesPage = (data: Omit<InviteQuery, "pageSize">) =>
  loadInvitesPageFn({ data })
export const cancelPomodoroInvites = (ids: string[]) => cancelInvitesFn({ data: { ids } })
export const listPomodoroRoomPresets = () => listPresetsFn()
export const savePomodoroRoomPreset = (data: RoomPresetPayload) => savePresetFn({ data })
export const deletePomodoroRoomPresets = (ids: string[]) => deletePresetsFn({ data: { ids } })
