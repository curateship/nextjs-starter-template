import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  readOwnerListingViews,
  type OwnerListingViewRange,
  type OwnerListingViews,
} from "@/server/directory/views"
import { userGet } from "@/server/guards"

import { createErrorMessage } from "../error-message"

export const getOwnerListingViewsErrorMessage = createErrorMessage(
  {
    "You do not look after that listing.":
      "You do not look after that listing.",
  },
  "Listing views could not be loaded. Please try again."
)

const loadOwnerListingViewsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      listingId: z.string().min(1).max(36),
      // `.catch(30)` keeps the public contract narrow while honoring the task's
      // rule that an unknown range becomes 30 days instead of an error.
      days: z
        .union([z.literal(30), z.literal(90)])
        .catch(30)
        .optional(),
    })
  )
  .handler(async ({ data, context }): Promise<OwnerListingViews> => {
    return readOwnerListingViews(context.user.id, data.listingId, data.days)
  })

export function loadOwnerListingViews(input: {
  listingId: string
  days?: OwnerListingViewRange
}) {
  return loadOwnerListingViewsFn({ data: input })
}

export type {
  OwnerListingViewPoint,
  OwnerListingViewRange,
  OwnerListingViews,
} from "@/server/directory/views"
