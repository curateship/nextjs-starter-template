import { createServerFn } from "@tanstack/react-start"
import { listUsersImpl, deleteUserImpl, deleteUsersImpl } from "./user-management-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./user-management-actions.server"

export const listUsers = createServerFn({ method: "POST" })
  .inputValidator((data: { page?: number; pageSize?: number }) => data)
  .handler(async ({ data }) => listUsersImpl(data.page, data.pageSize))

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => deleteUserImpl(data.userId))

export const deleteUsers = createServerFn({ method: "POST" })
  .inputValidator((data: { userIds: string[] }) => data)
  .handler(async ({ data }) => deleteUsersImpl(data.userIds))
