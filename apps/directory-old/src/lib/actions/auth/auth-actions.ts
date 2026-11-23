import { createServerFn } from "@tanstack/react-start"
import { getCurrentUserImpl, getMyProfileImpl, updateProfileImpl, updatePasswordImpl, requestEmailChangeImpl } from "./auth-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./auth-actions.server"

export const getCurrentUser = createServerFn({ method: "POST" })
  
  .handler(async () => getCurrentUserImpl())

export const getMyProfile = createServerFn({ method: "POST" })
  
  .handler(async () => getMyProfileImpl())

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => updateProfileImpl(data))

export const updatePassword = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => updatePasswordImpl(data))

export const requestEmailChange = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => requestEmailChangeImpl(data))
