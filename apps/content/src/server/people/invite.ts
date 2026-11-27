import { z } from "zod"

import type { Role } from "@/lib/role-id"
import { appRoleFor } from "@/lib/roles"
import { getAuthLinkContext } from "@/server/auth/link-expiry"
import { db, type CustomShellDb } from "@/server/db"
import { createAccountByAdmin } from "@/server/people/accounts"

/** The same email rule as registration, lowercasing included. */
const inviteEmailSchema = z.string().trim().toLowerCase().min(3).max(255).email()

/**
 * Makes an account in one of the app's own roles and emails the person a
 * "Set your password" link, such as Project inviting a new employee.
 *
 * For an app's own invite endpoint to call after its own checks; it does no
 * door checking of its own. The account starts with no password, so nobody
 * can sign in to it until the link is opened. The link is the same one-time,
 * short-lived link a password reset sends, and opening it sets the password,
 * confirms the address and signs the person in on their role's landing page.
 *
 * Only an app role can be invited here. A member signs themselves up on
 * `/register`, and an admin is made on Admin → Users, which is behind the
 * admin's own door. An email that already has an account is refused with
 * `ACCOUNT_EXISTS`. A mail that could not be sent removes the fresh account
 * again, so the invite can simply be sent a second time.
 */
export async function inviteAccount(
  input: { email: string; name: string; role: Role },
  database: CustomShellDb = db
): Promise<{ id: string; delivered: boolean }> {
  if (!appRoleFor(input.role)) {
    throw new Error("NOT_AN_APP_ROLE")
  }
  const name = input.name.trim()
  if (!name || name.length > 255) {
    throw new Error("INVALID_NAME")
  }
  const email = inviteEmailSchema.parse(input.email)

  return createAccountByAdmin(
    email,
    name,
    input.role,
    database,
    await getAuthLinkContext(database)
  )
}
