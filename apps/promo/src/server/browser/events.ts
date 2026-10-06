import type { ProfileEventKind } from "@/lib/social/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoProfileEvents } from "./schema"

/**
 * Writes one line in a profile's history: its proxy changed, its browser was
 * found dead, or an open was refused because its proxy was dead. The runs of
 * its browser are the session rows and are not written here.
 *
 * Never fails the thing it records. A history line that cannot be written is
 * logged, and the open, the close or the save carries on.
 */
export async function recordProfileEvent(
  userId: string,
  profileId: string,
  kind: ProfileEventKind,
  detail: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  try {
    await db.insert(promoProfileEvents).values({
      id: uuid(),
      userId,
      profileId,
      kind,
      detail: detail.slice(0, 2_000),
    })
  } catch (error) {
    console.error(`Could not write a ${kind} line in profile ${profileId}'s history`, error)
  }
}
