import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { publicSavedProfile } from "@/server/directory/saves"
import { visitorSite } from "@/server/directory/public"

const readPublicSavedProfileFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ profileId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const site = await visitorSite()
    if (!site) return null
    return publicSavedProfile(site, data.profileId)
  })

/** Public lists on the site whose address the visitor opened. */
export function loadPublicSavedProfile(profileId: string) {
  return readPublicSavedProfileFn({ data: { profileId } })
}
