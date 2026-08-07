import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  BRAND_COLOR_NAME_MAX,
  BRAND_LOGO_URL_MAX,
  MAX_BRAND_COLORS,
  type VideoBrandKit,
} from "@/lib/video/brand-kit"
import { adminPost, userGet } from "@/server/guards"
import { getVideoBrandKit, saveVideoBrandKit } from "@/server/video/settings"

/**
 * The brand kit. Anyone editing can read it — the editor draws with it on every
 * screen — but changing it changes every project in the install, so saving is
 * an admin action.
 */

export type { VideoBrandKit }

export function getBrandKitErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return describeAuthError(message) ?? "Brand kit request failed."
}

const brandKitSchema = z.object({
  colors: z
    .array(
      z.object({
        name: z.string().min(1).max(BRAND_COLOR_NAME_MAX),
        value: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
      })
    )
    .max(MAX_BRAND_COLORS),
  logoUrl: z.string().max(BRAND_LOGO_URL_MAX),
})

const getBrandKitFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async () => {
    return getVideoBrandKit()
  })

const saveBrandKitFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(brandKitSchema)
  .handler(async ({ data }) => {
    return saveVideoBrandKit(data)
  })

export function loadBrandKit() {
  return getBrandKitFn()
}

export function saveBrandKit(brandKit: z.infer<typeof brandKitSchema>) {
  return saveBrandKitFn({ data: brandKit })
}
