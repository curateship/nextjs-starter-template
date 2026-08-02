import { createServerFn } from "@tanstack/react-start"
import { desc, gt, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { clearRateLimits } from "@/server/rate-limit"
import { customShellRateLimits, customShellUsers } from "@/server/schema"
import { requireAdmin } from "@/server/security"

/** One active block, already translated into people-words for the panel. */
export type LockedOutBlock = {
  /** The raw throttle key — the handle the unblock call needs. */
  key: string
  /** What the throttle protects, e.g. "Sign-in attempts". */
  what: string
  /** Who is blocked: an email, an account name, or a network address. */
  who: string
  /** A second line under `who` — the email behind a name, or the address. */
  whoDetail: string | null
  attempts: number
  blockedSince: string
  blockedUntil: string
}

export type LockedOutList = {
  blocks: LockedOutBlock[]
}

/**
 * Every throttle key in the app is `<prefix>:<who>`. This map is what turns the
 * raw prefix into words an admin can act on; add a line here when a new
 * `enforceRateLimit` call site introduces a new prefix, or its blocks will show
 * up with their raw key as the label.
 */
const THROTTLE_LABELS: Record<string, { what: string; holder: "ip" | "user" }> =
  {
    register: { what: "New account sign-ups", holder: "ip" },
    "verify-resend": { what: "Verification email re-sends", holder: "ip" },
    "sign-in-link": { what: "Sign-in link requests", holder: "ip" },
    "sign-in-link-use": { what: "Sign-in link uses", holder: "ip" },
    "password-reset": { what: "Password reset emails", holder: "ip" },
    "reset-password": { what: "Password reset attempts", holder: "ip" },
    "email-change-confirm": { what: "Email change confirmations", holder: "ip" },
    "google-callback": { what: "Google sign-in attempts", holder: "ip" },
    "passkey-options": { what: "Passkey sign-in starts", holder: "ip" },
    "passkey-login": { what: "Passkey sign-in attempts", holder: "ip" },
    "email-change": { what: "Email change requests", holder: "user" },
    "passkey-register": { what: "Passkey set-up attempts", holder: "user" },
    "feedback-create": { what: "Feedback posts", holder: "user" },
    "feedback-comment": { what: "Feedback comments", holder: "user" },
    "media-upload": { what: "File uploads", holder: "user" },
    "checkout-start": { what: "Checkout attempts", holder: "user" },
  }

type ParsedKey =
  | { what: string; holder: "email"; email: string; ip: string }
  | { what: string; holder: "user"; userId: string }
  | { what: string; holder: "ip"; ip: string }
  | { what: string; holder: "anonymous" }
  | { what: string; holder: "unknown" }

function parseThrottleKey(key: string): ParsedKey {
  const colon = key.indexOf(":")
  if (colon === -1) return { what: "An unrecognized limit", holder: "unknown" }

  const prefix = key.slice(0, colon)
  const rest = key.slice(colon + 1)

  // The sign-in key carries both halves: `login:<address>:<email>`. The address
  // may itself contain colons (IPv6), so the email is everything after the LAST
  // colon rather than the second one.
  if (prefix === "login") {
    const lastColon = rest.lastIndexOf(":")
    return {
      what: "Sign-in attempts",
      holder: "email",
      email: lastColon === -1 ? rest : rest.slice(lastColon + 1),
      ip: lastColon === -1 ? "" : rest.slice(0, lastColon),
    }
  }

  // Traffic counting is keyed on an anonymous visitor hash — there is no
  // person to name, and nobody is waiting on an unblock.
  if (prefix === "traffic") {
    return { what: "Page-view counting", holder: "anonymous" }
  }

  const label = THROTTLE_LABELS[prefix]
  if (!label) return { what: "An unrecognized limit", holder: "unknown" }
  return label.holder === "user"
    ? { what: label.what, holder: "user", userId: rest }
    : { what: label.what, holder: "ip", ip: rest }
}

const adminLocksErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
}

export function getAdminLocksErrorMessage(error: unknown) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : ""
  const matched = Object.keys(adminLocksErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? adminLocksErrorMessages[matched]
    : "We could not complete that request. Please try again."
}

/**
 * Every currently active block, newest first. Only rows whose `blocked_until`
 * is still ahead of the clock count — buckets that are merely counting
 * attempts have blocked nobody and stay out of the panel.
 */
const loadLockedOutFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<LockedOutList> => {
    await requireAdmin()

    const rows = await db
      .select()
      .from(customShellRateLimits)
      .where(gt(customShellRateLimits.blockedUntil, new Date()))
      .orderBy(desc(customShellRateLimits.windowStartedAt))

    const parsed = rows.map((row) => ({ row, key: parseThrottleKey(row.key) }))

    // Account-keyed throttles store an id; one lookup turns them into names.
    const userIds = [
      ...new Set(
        parsed.flatMap(({ key }) => (key.holder === "user" ? [key.userId] : []))
      ),
    ]
    const users = userIds.length
      ? await db
          .select({
            id: customShellUsers.id,
            name: customShellUsers.name,
            email: customShellUsers.email,
          })
          .from(customShellUsers)
          .where(inArray(customShellUsers.id, userIds))
      : []
    const usersById = new Map(users.map((user) => [user.id, user]))

    return {
      blocks: parsed.map(({ row, key }) => {
        let who = row.key
        let whoDetail: string | null = null
        if (key.holder === "email") {
          who = key.email
          whoDetail = key.ip ? `Address ${key.ip}` : null
        } else if (key.holder === "user") {
          const user = usersById.get(key.userId)
          who = user?.name ?? "A deleted account"
          whoDetail = user?.email ?? null
        } else if (key.holder === "ip") {
          who = `Address ${key.ip}`
        } else if (key.holder === "anonymous") {
          who = "An anonymous visitor"
        }

        return {
          key: row.key,
          what: key.what,
          who,
          whoDetail,
          attempts: row.attempts,
          blockedSince: row.windowStartedAt.toISOString(),
          // The `where` above guarantees the value is set on every row read.
          blockedUntil: (row.blockedUntil as Date).toISOString(),
        }
      }),
    }
  }
)

const unblockSchema = z.object({
  keys: z.array(z.string().min(1).max(200)).min(1).max(100),
})

/**
 * Lifts blocks by deleting their buckets, so the person can try again
 * immediately with a fresh count. Deleting a key that expired or was already
 * cleared is a harmless no-match, so two admins racing cannot make this fail.
 */
const unblockFn = createServerFn({ method: "POST" })
  .inputValidator(unblockSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdmin()
    await clearRateLimits(data.keys)
    return { unblockedCount: data.keys.length }
  })

export function loadLockedOut() {
  return loadLockedOutFn()
}

export function unblockRateLimits(keys: string[]) {
  return unblockFn({ data: { keys } })
}
