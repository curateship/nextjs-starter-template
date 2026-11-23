import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id, photoCreditSchema } from "@/lib/travel/rules"
import { userPost } from "@/server/guards"
import { MAX_CARD_PHOTOS, setActivityPhotos, type CardPhoto } from "@/server/travel/activity-photos"

export type { ActivityPhoto, CardPhoto } from "@/server/travel/activity-photos"

const setFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      activityId: id,
      photos: z
        .array(z.object({ url: z.string().min(1).max(1000), credit: photoCreditSchema.nullable() }))
        .max(MAX_CARD_PHOTOS, `A card can hold at most ${MAX_CARD_PHOTOS} photos.`),
    })
  )
  .handler(async ({ data, context }) => setActivityPhotos(context.user.id, data))

/** Saves a card's whole row of photos, in order; the first is the board's picture (Travel features 3, part 5). */
export function saveActivityPhotos(activityId: string, photos: CardPhoto[]) {
  return setFn({ data: { activityId, photos } })
}
