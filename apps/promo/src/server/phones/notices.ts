import { PHONE_NOTICE_PREFIX, slotWords } from "@/lib/phones/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"

/**
 * The bell notice for a phone that needs a hand: it disappeared from the rack,
 * or it is waiting for someone to allow USB debugging on its screen.
 *
 * The same shape as a dead proxy's notice (`src/server/browser/notices.ts`).
 * Its id is the phone's id, so the bell opens the phone with no lookup, and a
 * phone has one notice that comes back to the top as unread each time it
 * needs a hand again. The heading names the shelf slot, so the right phone is
 * picked up first time.
 */
export async function writePhoneNotice(
  userId: string,
  phone: { id: string; name: string; shelfSlot: string; usbPort: string },
  what: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const slot = slotWords(phone.shelfSlot)
  const message = `${PHONE_NOTICE_PREFIX}${phone.name}${slot ? ` in ${slot}` : ""} ${what}`
  const detail = [
    slot ? `It sits in ${slot}.` : "Type its shelf slot on the Phones dashboard so the notice can say where it is.",
    phone.usbPort ? `It was on USB port ${phone.usbPort}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const createdAt = new Date()

  await db
    .insert(customShellNotifications)
    .values({ id: phone.id, recipientUserId: userId, type: "app_activity", message, detail, createdAt })
    .onConflictDoUpdate({
      target: customShellNotifications.id,
      set: { message, detail, createdAt, readAt: null, seenAt: null },
    })
  await publishNotificationCreated(userId, db)
}
