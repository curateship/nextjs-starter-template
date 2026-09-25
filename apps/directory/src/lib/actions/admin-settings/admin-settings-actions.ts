import { createServerFn } from "@tanstack/react-start"
import {
  getAdminSettingsActionImpl,
  updateAdminSettingsActionImpl,
} from "./admin-settings-actions.server"
import type { UpdateAdminSettingsData } from "./admin-settings-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./admin-settings-actions.server"

// getCachedAdminSettings is a server-only helper, not a server function —
// server components import it from admin-settings-actions.server directly.

export const getAdminSettingsAction = createServerFn({ method: "POST" })
  .handler(async () => getAdminSettingsActionImpl())

export const updateAdminSettingsAction = createServerFn({ method: "POST" })
  .inputValidator((data: UpdateAdminSettingsData) => data)
  .handler(async ({ data }) => updateAdminSettingsActionImpl(data))
