import { createServerFn } from "@tanstack/react-start"

import { adminGet } from "@/server/guards"
import { googleEnabled } from "@/server/travel/google"
import { loadGoogleUse, type GoogleUse } from "@/server/travel/google-usage"

export type { GoogleUse } from "@/server/travel/google-usage"

const loadGoogleUseFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<GoogleUse & { googleOn: boolean }> => ({ ...(await loadGoogleUse()), googleOn: googleEnabled() }))

/** Google lookups today and this month, and who used the most, for Settings → App settings → Google use. Admins only. */
export function getGoogleUse() {
  return loadGoogleUseFn()
}
