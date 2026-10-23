import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import type { DatingApp } from "@/lib/dating/options"
import { dateAccounts } from "@/server/dating/schema"

/**
 * A profile for a test, Tinder unless the test says otherwise, on a phone
 * when one is named. Its app's distance and ages count as set unless the
 * test says they are owed, so a pass does not open the app's settings first.
 */
export async function insertAccount(
  db: CustomShellDb,
  values: { userId: string; workspaceId: string; phoneId?: string | null; name?: string; app?: DatingApp; discoveryOwed?: boolean }
) {
  const [account] = await db
    .insert(dateAccounts)
    .values({
      id: uuid(),
      userId: values.userId,
      workspaceId: values.workspaceId,
      phoneId: values.phoneId ?? null,
      name: values.name ?? "Tinder",
      app: values.app ?? "tinder",
      discoveryOwed: values.discoveryOwed ?? false,
    })
    .returning()
  return account
}
