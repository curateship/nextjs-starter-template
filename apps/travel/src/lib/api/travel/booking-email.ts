import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { id } from "@/lib/travel/rules"
import { userPost } from "@/server/guards"
import { BOOKING_EMAIL_MAX, readBookingEmail } from "@/server/travel/booking-email"

export type { BookingDraft } from "@/server/travel/booking-email"

// A POST because it spends AI allowance, even though nothing is saved.
const readBookingEmailFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      tripId: id,
      text: z
        .string()
        .trim()
        .min(1, TRAVEL_ERRORS.bookingEmailEmpty)
        .max(BOOKING_EMAIL_MAX, TRAVEL_ERRORS.bookingEmailTooLong),
    })
  )
  .handler(async ({ data, context }) => readBookingEmail(context.user.id, data))

export function readBooking(data: { tripId: string; text: string }) {
  return readBookingEmailFn({ data })
}
