import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { userGet, userPost } from "@/server/guards"
import {
  loadExplorerPrefs,
  saveExplorerSound,
} from "@/server/trade/market-explorer"
const loadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(
    async ({ context }) =>
      (await loadExplorerPrefs(context.user.id)).prefs.discoverySound
  )
const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.boolean())
  .handler(({ context, data }) => saveExplorerSound(context.user.id, data))
export function loadDiscoverySound() {
  return loadFn()
}
export function saveDiscoverySound(enabled: boolean) {
  return saveFn({ data: enabled })
}
