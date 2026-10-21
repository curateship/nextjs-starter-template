import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { dateAccounts } from "@/server/dating/schema"

/** A profile for a test, Tinder unless the test says otherwise, on a phone when one is named. */
export async function insertAccount(
  db: CustomShellDb,
  values: { userId: string; workspaceId: string; phoneId?: string | null; name?: string; app?: "tinder" | "hinge" }
) {
  const [account] = await db
    .insert(dateAccounts)
    .values({ id: uuid(), userId: values.userId, workspaceId: values.workspaceId, phoneId: values.phoneId ?? null, name: values.name ?? "Tinder", app: values.app ?? "tinder" })
    .returning()
  return account
}
