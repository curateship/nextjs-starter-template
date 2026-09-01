import { db, type CustomShellDb } from "@/server/db"
import { customShellAuthSecurityReports } from "@/server/schema"
import { consumeAuthToken, now, uuid } from "@/server/auth/security"

export const REPORTABLE_AUTH_PURPOSES = ["reset_password", "login"] as const
export type ReportableAuthPurpose = (typeof REPORTABLE_AUTH_PURPOSES)[number]

/**
 * Stops exactly one emailed sign-in action and records that it was unwanted.
 *
 * The action token itself is the proof. Spending it and recording the report
 * happen in one transaction, so a report can never be saved while the link
 * remains usable. Nothing on the account or its sessions changes.
 */
export async function reportUnwantedAuthRequest(
  token: string,
  purpose: ReportableAuthPurpose,
  database: CustomShellDb = db,
  timestamp = now()
) {
  return database.transaction(async (tx) => {
    const consumed = await consumeAuthToken(
      token,
      purpose,
      tx,
      timestamp
    )

    await tx.insert(customShellAuthSecurityReports).values({
      id: uuid(),
      userId: consumed.userId,
      tokenPurpose: purpose,
      createdAt: timestamp,
    })
  })
}
