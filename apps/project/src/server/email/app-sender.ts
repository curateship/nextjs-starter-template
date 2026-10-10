import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { customShellEmailSettings } from "@/server/schema"

export type SystemEmailSender = {
  from: string
  address: string
  configured: boolean
  source: "settings" | "environment" | "resend-test"
}

const RESEND_TEST_SENDER = "Custom Shell <onboarding@resend.dev>"

/**
 * The deployment fallback for verification, sign-in, reset, and security mail.
 *
 * A workspace can replace its system address without changing its separate
 * newsletter sender. Workflows with no resolved workspace use this fallback.
 */
export function getSystemEmailSender(
  env: NodeJS.ProcessEnv = process.env,
): SystemEmailSender {
  const configured = env.CUSTOM_SHELL_EMAIL_FROM?.trim()
  return configured
    ? {
        from: configured,
        address: senderAddress(configured),
        configured: true,
        source: "environment",
      }
    : {
        from: RESEND_TEST_SENDER,
        address: senderAddress(RESEND_TEST_SENDER),
        configured: false,
        source: "resend-test",
      }
}

/** Lets a saved workspace address replace only the address, not the app name. */
export function resolveSystemEmailSender(
  savedAddress: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): SystemEmailSender {
  const fallback = getSystemEmailSender(env)
  const address = savedAddress?.trim()
  if (!address) return fallback

  const name = fallback.from.match(/^\s*([^<]+?)\s*<[^>]+>\s*$/)?.[1]?.trim()
  return {
    from: name ? `${name} <${address}>` : address,
    address,
    configured: true,
    source: "settings",
  }
}

/** The workspace setting wins; a database problem still leaves the env fallback. */
export async function getWorkspaceSystemEmailSender(
  workspaceId: string | null,
  database: CustomShellDb = db,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!workspaceId) return getSystemEmailSender(env)

  try {
    const [row] = await database
      .select({ address: customShellEmailSettings.systemFromEmail })
      .from(customShellEmailSettings)
      .where(eq(customShellEmailSettings.workspaceId, workspaceId))
      .limit(1)
    return resolveSystemEmailSender(row?.address, env)
  } catch {
    return getSystemEmailSender(env)
  }
}

function senderAddress(from: string) {
  return from.match(/<([^>]+)>/)?.[1]?.trim() ?? from.trim()
}
