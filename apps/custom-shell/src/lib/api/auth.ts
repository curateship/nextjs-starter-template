import { createServerFn } from "@tanstack/react-start"
import { getRequestIP } from "@tanstack/react-start/server"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import { describeDevice } from "@/lib/device-label"
import { SIGN_IN_LINK_MINUTES } from "@/lib/sign-in-link"
import { appUrlFor } from "@/server/app-url"
import { enforcePasswordNotBreached } from "@/server/breached-passwords"
import { db } from "@/server/db"
import { sendAuthEmail } from "@/server/email"
import { clearRateLimit, enforceRateLimit } from "@/server/rate-limit"
import { googleSignInEnabled } from "@/server/google-auth"
import { customShellSessions, customShellUsers } from "@/server/schema"
import { consumeSignInLink, createSignInLinkToken } from "@/server/sign-in-link"
import { enforceHumanCheck, getHumanCheckSiteKey } from "@/server/turnstile"
import {
  clearSessionCookie,
  consumeAuthToken,
  createAuthToken,
  createUserSession,
  deleteOtherSessions,
  deleteUserSession,
  describeRequestOrigin,
  findCurrentUser,
  findUserByEmail,
  getSessionToken,
  hashPassword,
  hashSessionToken,
  listUserSessions,
  now,
  requireSessionOwner,
  signOutOtherDevices,
  requireUser,
  setSessionCookie,
  uuid,
  verifyPassword,
} from "@/server/security"
import { requireAppOrigin } from "@/server/origin"

export type AuthUser = {
  id: string
  email: string
  name: string
  role: string
  status: string
  emailVerified: boolean
  /**
   * False for an account created by signing in with Google, which has no
   * password at all. Account → Security offers to set one instead of asking
   * for a current password nobody has.
   */
  hasPassword: boolean
}

const emailSchema = z.string().trim().toLowerCase().min(3).max(255).email()
const passwordSchema = z.string().min(8).max(128)

/**
 * The password rules, in the words the three forms show. Kept beside the rules
 * themselves so the two cannot drift apart.
 */
export const PASSWORD_RULE_HINT =
  "At least 8 characters. Passwords found in known data breaches are refused."

/**
 * Shown both when the server refuses the widget's answer and when the form has
 * no answer to send, because to the person at the keyboard those are the same
 * thing.
 */
export const HUMAN_CHECK_MESSAGE =
  "We could not confirm you are a person. Please try again."

const nameSchema = z.string().trim().min(1).max(255)
const tokenSchema = z.string().trim().min(32).max(200)

/**
 * The widget's answer. Optional because the check is switched off whenever the
 * Turnstile keys are unset — the server, not the form, decides whether one is
 * required.
 */
const humanCheckTokenSchema = z.string().max(4096).optional()

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  humanCheckToken: humanCheckTokenSchema,
})
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
})
const profileSchema = z.object({ name: nameSchema })
const changePasswordSchema = z.object({
  /**
   * Absent only for an account that has no password yet, which is how an
   * account created by signing in with Google starts life.
   */
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: passwordSchema,
})
const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
})
const deleteAccountSchema = z.object({
  /** The account's password, or its email address when it has no password. */
  confirmation: z.string().min(1).max(255),
})

const authErrorMessages: Record<string, string> = {
  ACCOUNT_EXISTS: "An account already exists for this email.",
  INVALID_CREDENTIALS: "Invalid email or password.",
  EMAIL_NOT_VERIFIED:
    "Check your inbox and verify your email before signing in.",
  ACCOUNT_SUSPENDED: "This account has been suspended. Contact support.",
  RATE_LIMITED: "Too many attempts. Please try again later.",
  INVALID_OR_EXPIRED_TOKEN: "This link is invalid or has expired.",
  AUTH_REQUIRED: "Please sign in again.",
  FORBIDDEN: "You do not have access to that.",
  EMAIL_NOT_CONFIGURED: "Email delivery is not configured yet.",
  EMAIL_DELIVERY_FAILED: "We could not send that email. Please try again.",
  LAST_ADMIN: "There has to be at least one other admin first.",
  SESSION_NOT_FOUND: "That device is already signed out.",
  PASSWORD_BREACHED:
    "This password has shown up in a known data breach. Please pick a different one.",
  HUMAN_CHECK_FAILED: HUMAN_CHECK_MESSAGE,
  GOOGLE_SIGN_IN_FAILED:
    "We could not sign you in with Google. Please try again.",
  PROVIDER_EMAIL_UNVERIFIED:
    "Google has not confirmed the email address on that account, so we cannot use it to sign you in.",
}

/**
 * The codes the Google callback may hand the sign-in page on `?error=`. The
 * page shows the message for anything on this list and ignores everything else,
 * so the address bar cannot be used to put arbitrary text on the screen.
 */
export const SIGN_IN_ERROR_CODES = [
  "GOOGLE_SIGN_IN_FAILED",
  "PROVIDER_EMAIL_UNVERIFIED",
  "ACCOUNT_SUSPENDED",
  "RATE_LIMITED",
] as const

export function getAuthErrorMessage(error: unknown) {
  return messageForAuthCode(error instanceof Error ? error.message : "")
}

/**
 * The message for a bare code, for the one caller that has no error to hand:
 * the sign-in page reading the code the Google callback redirected it with.
 */
export function messageForAuthCode(code: string) {
  const matched = Object.keys(authErrorMessages).find((known) =>
    code.includes(known)
  )

  return matched
    ? authErrorMessages[matched]
    : "We could not complete that request. Please try again."
}

const loadCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await findCurrentUser()
    return user ? serializeUser(user) : null
  }
)

/**
 * What the signed-out pages need to know before they draw themselves: the
 * Turnstile site key for the forms that carry the widget (null when the check
 * is switched off), and whether to offer "Continue with Google".
 *
 * Both are public values that ship inside the page, and both are decided by the
 * server so a button is never shown that this server cannot finish.
 */
const loadSignInOptionsFn = createServerFn({ method: "GET" }).handler(
  async () => ({
    siteKey: getHumanCheckSiteKey(),
    google: googleSignInEnabled(),
  })
)

const registerFn = createServerFn({ method: "POST" })
  .inputValidator(registerSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    // The counter comes first on purpose. It is one local write, where the
    // human check is a call out to Cloudflare — checking first would let anyone
    // make this server place unlimited outbound requests.
    await enforceRateLimit(`register:${requestIp()}`, {
      maxAttempts: 5,
      windowSeconds: 60 * 60,
    })
    await enforceHumanCheck(data.humanCheckToken)

    const [existing] = await db
      .select({ id: customShellUsers.id })
      .from(customShellUsers)
      .where(sql`lower(${customShellUsers.email}) = ${data.email}`)
      .limit(1)

    if (existing) {
      throw new Error("ACCOUNT_EXISTS")
    }

    await enforcePasswordNotBreached(data.password)

    const createdAt = now()
    const passwordHash = await hashPassword(data.password)
    const token = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(customShellUsers)
        .values({
          id: uuid(),
          email: data.email,
          name: data.name,
          role: "member",
          status: "active",
          passwordHash,
          createdAt,
          updatedAt: createdAt,
        })
        .returning({ id: customShellUsers.id })

      return createAuthToken(user.id, "verify_email", tx)
    })

    await sendVerificationEmail(data.email, token)
    return { ok: true }
  })

const verifyEmailFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: tokenSchema }))
  .handler(async ({ data }) => {
    requireAppOrigin()

    const timestamp = now()
    await db.transaction(async (tx) => {
      const consumed = await consumeAuthToken(
        data.token,
        "verify_email",
        tx,
        timestamp
      )

      await tx
        .update(customShellUsers)
        .set({ emailVerifiedAt: timestamp, updatedAt: timestamp })
        .where(eq(customShellUsers.id, consumed.userId))
    })

    return { ok: true }
  })

const resendVerificationFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: emailSchema }))
  .handler(async ({ data }) => {
    requireAppOrigin()
    await enforceRateLimit(`verify-resend:${requestIp()}`, {
      maxAttempts: 5,
      windowSeconds: 60 * 60,
    })

    const user = await findUserByEmail(data.email)
    // Always reports success so this cannot be used to discover which emails
    // have accounts.
    if (user && !user.emailVerifiedAt) {
      const token = await createAuthToken(user.id, "verify_email")
      await sendVerificationEmail(user.email, token)
    }

    return { ok: true }
  })

const loginFn = createServerFn({ method: "POST" })
  .inputValidator(loginSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()

    const rateLimitKey = `login:${requestIp()}:${data.email}`
    await enforceRateLimit(rateLimitKey, {
      maxAttempts: 5,
      windowSeconds: 15 * 60,
    })

    const user = await findUserByEmail(data.email)
    if (!user || !(await verifyPassword(user.passwordHash, data.password))) {
      throw new Error("INVALID_CREDENTIALS")
    }
    if (user.status === "suspended") {
      throw new Error("ACCOUNT_SUSPENDED")
    }
    if (!user.emailVerifiedAt) {
      throw new Error("EMAIL_NOT_VERIFIED")
    }

    await clearRateLimit(rateLimitKey)

    const token = await createUserSession(user.id, describeRequestOrigin())
    await startWorkspaceFor(user.id)

    setSessionCookie(token)
    return serializeUser(user)
  })

const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  requireAppOrigin()

  const token = getSessionToken()
  if (token) {
    await db
      .delete(customShellSessions)
      .where(eq(customShellSessions.tokenHash, hashSessionToken(token)))
  }

  clearSessionCookie()
})

const requestSignInLinkFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ email: emailSchema, humanCheckToken: humanCheckTokenSchema })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    // The counter comes first for the same reason it does on registration: it
    // is one local write, where the human check is a call out to Cloudflare.
    await enforceRateLimit(`sign-in-link:${requestIp()}`, {
      maxAttempts: 5,
      windowSeconds: 60 * 60,
    })
    // Before the lookup and the email, so a bot cannot spray sign-in links at
    // other people's inboxes.
    await enforceHumanCheck(data.humanCheckToken)

    const link = await createSignInLinkToken(data.email)
    // Always reports success so this cannot be used to discover which emails
    // have accounts.
    if (link) {
      await sendAuthEmail({
        to: link.email,
        subject: "Your sign-in link",
        heading: "Sign in",
        message: `This link signs you in once and expires in ${SIGN_IN_LINK_MINUTES} minutes.`,
        action: "Sign in",
        actionUrl: appUrlFor(
          `/sign-in-link?token=${encodeURIComponent(link.token)}`
        ),
      })
    }

    return { ok: true }
  })

const consumeSignInLinkFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: tokenSchema }))
  .handler(async ({ data }) => {
    requireAppOrigin()
    // A link is spent by this call, not by opening its address, so a mail
    // scanner following the link cannot burn it. That also means the limit
    // below only ever counts real attempts to sign in.
    //
    // The key is the address alone, because a link is all somebody presents —
    // there is no account name to count against until it has been checked. That
    // makes it the whole office behind one address sharing a budget, which is
    // why a success clears it below: otherwise ten people signing in this way
    // would lock out the eleventh for an hour. What is left is what the limit
    // is actually for — refused attempts, ten an hour, from anyone hammering
    // the endpoint with made-up links.
    const rateLimitKey = `sign-in-link-use:${requestIp()}`
    await enforceRateLimit(rateLimitKey, {
      maxAttempts: 10,
      windowSeconds: 60 * 60,
    })

    const { user, sessionToken } = await consumeSignInLink(
      data.token,
      describeRequestOrigin()
    )
    await clearRateLimit(rateLimitKey)
    await startWorkspaceFor(user.id)

    setSessionCookie(sessionToken)
    return serializeUser(user)
  })

const requestPasswordResetFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ email: emailSchema, humanCheckToken: humanCheckTokenSchema })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    await enforceRateLimit(`password-reset:${requestIp()}`, {
      maxAttempts: 5,
      windowSeconds: 60 * 60,
    })
    // Before the lookup and the email, so a bot cannot spray reset mail at
    // other people's inboxes.
    await enforceHumanCheck(data.humanCheckToken)

    const user = await findUserByEmail(data.email)
    if (user) {
      const token = await createAuthToken(user.id, "reset_password")
      await sendAuthEmail({
        to: user.email,
        subject: "Reset your password",
        heading: "Reset your password",
        message: "This link expires in one hour.",
        action: "Reset password",
        actionUrl: appUrlFor(
          `/reset-password?token=${encodeURIComponent(token)}`
        ),
      })
    }

    return { ok: true }
  })

const resetPasswordFn = createServerFn({ method: "POST" })
  .inputValidator(resetPasswordSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    // Everything below runs before the reset link has been checked, so without
    // a limit anyone could call this endpoint with any password and no link at
    // all — spending an argon2 hash and an outside lookup every time.
    await enforceRateLimit(`reset-password:${requestIp()}`, {
      maxAttempts: 10,
      windowSeconds: 60 * 60,
    })

    // Before the token is spent, so a refused password leaves the reset link
    // still usable for a second try.
    await enforcePasswordNotBreached(data.password)

    const timestamp = now()
    const passwordHash = await hashPassword(data.password)

    await db.transaction(async (tx) => {
      const consumed = await consumeAuthToken(
        data.token,
        "reset_password",
        tx,
        timestamp
      )

      await tx
        .update(customShellUsers)
        .set({
          passwordHash,
          // Completing a reset proves the address works.
          emailVerifiedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(customShellUsers.id, consumed.userId))

      // Anyone signed in with the old password is signed out.
      await tx
        .delete(customShellSessions)
        .where(eq(customShellSessions.userId, consumed.userId))
    })

    clearSessionCookie()
    return { ok: true }
  })

const updateProfileFn = createServerFn({ method: "POST" })
  .inputValidator(profileSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()

    const [updated] = await db
      .update(customShellUsers)
      .set({ name: data.name, updatedAt: now() })
      .where(eq(customShellUsers.id, user.id))
      .returning()

    return serializeUser(updated)
  })

const changePasswordFn = createServerFn({ method: "POST" })
  .inputValidator(changePasswordSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()

    // An account with no password is setting its first one, and the signed-in
    // session is the proof it is them. Insisting on a current password there
    // would leave a Google account unable to ever have one.
    if (user.passwordHash) {
      if (
        !data.currentPassword ||
        !(await verifyPassword(user.passwordHash, data.currentPassword))
      ) {
        throw new Error("INVALID_CREDENTIALS")
      }
    }

    await enforcePasswordNotBreached(data.newPassword)

    const passwordHash = await hashPassword(data.newPassword)
    await db
      .update(customShellUsers)
      .set({ passwordHash, updatedAt: now() })
      .where(eq(customShellUsers.id, user.id))

    // Keep this session, drop every other one.
    await deleteOtherSessions(user.id, getSessionToken())
    return { ok: true }
  })

/** The devices signed in to this account, for the Security tab's list. */
const loadSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const owner = await requireSessionOwner()
  const { sessions, total } = await listUserSessions(owner.id, getSessionToken())

  return {
    total,
    sessions: sessions.map((session) => ({
      id: session.id,
      device: describeDevice(session.userAgent),
      ipAddress: session.ipAddress,
      signedInAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      isCurrent: session.isCurrent,
    })),
  }
})

export type SessionList = Awaited<ReturnType<typeof loadSessionsFn>>

const revokeSessionFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().min(1).max(36) }))
  .handler(async ({ data }) => {
    requireAppOrigin()
    const owner = await requireSessionOwner()
    await deleteUserSession(owner.id, data.sessionId, getSessionToken())
    return { ok: true }
  })

const signOutOtherSessionsFn = createServerFn({ method: "POST" }).handler(
  async () => {
    requireAppOrigin()
    // The owner, not `requireUser`: an admin viewing the app as a member must
    // sign out their own other browsers here, never the member's.
    const owner = await requireSessionOwner()
    const removed = await signOutOtherDevices(owner.id, getSessionToken())
    return { removed }
  }
)

const deleteAccountFn = createServerFn({ method: "POST" })
  .inputValidator(deleteAccountSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()

    if (!(await confirmsDeletion(user, data.confirmation))) {
      throw new Error("INVALID_CREDENTIALS")
    }

    const { countOtherActiveAdmins } = await import("@/server/accounts")
    if (
      user.role === "admin" &&
      (await countOtherActiveAdmins(user.id)) === 0
    ) {
      throw new Error("LAST_ADMIN")
    }

    await db.delete(customShellUsers).where(eq(customShellUsers.id, user.id))
    clearSessionCookie()
    return { ok: true }
  })

export function loadCurrentUser() {
  return loadCurrentUserFn()
}

export function loadSignInOptions() {
  return loadSignInOptionsFn()
}

export function register(data: z.infer<typeof registerSchema>) {
  return registerFn({ data })
}

export function verifyEmail(token: string) {
  return verifyEmailFn({ data: { token } })
}

export function resendVerification(email: string) {
  return resendVerificationFn({ data: { email } })
}

export function login(email: string, password: string) {
  return loginFn({ data: { email, password } })
}

export function logout() {
  return logoutFn()
}

export function requestSignInLink(email: string, humanCheckToken?: string) {
  return requestSignInLinkFn({ data: { email, humanCheckToken } })
}

export function signInWithLink(token: string) {
  return consumeSignInLinkFn({ data: { token } })
}

export function requestPasswordReset(email: string, humanCheckToken?: string) {
  return requestPasswordResetFn({ data: { email, humanCheckToken } })
}

export function resetPassword(token: string, password: string) {
  return resetPasswordFn({ data: { token, password } })
}

export function updateProfile(name: string) {
  return updateProfileFn({ data: { name } })
}

export function changePassword(
  currentPassword: string | undefined,
  newPassword: string
) {
  return changePasswordFn({ data: { currentPassword, newPassword } })
}

export function loadSessions() {
  return loadSessionsFn()
}

export function revokeSession(sessionId: string) {
  return revokeSessionFn({ data: { sessionId } })
}

export function signOutOtherSessions() {
  return signOutOtherSessionsFn()
}

export function deleteAccount(confirmation: string) {
  return deleteAccountFn({ data: { confirmation } })
}

/**
 * Deleting an account asks for something only its owner could type: the
 * password when there is one, and the account's own email address when there is
 * not, because an account that signs in with Google has no password to give.
 */
function confirmsDeletion(
  user: { passwordHash: string | null; email: string },
  confirmation: string
) {
  return user.passwordHash
    ? verifyPassword(user.passwordHash, confirmation)
    : Promise.resolve(
        confirmation.trim().toLowerCase() === user.email.toLowerCase()
      )
}

/** The one place an account is turned into what the browser is told about it. */
export function serializeUser(user: {
  id: string
  email: string
  name: string
  role: string
  status: string
  emailVerifiedAt: Date | null
  passwordHash: string | null
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    // The hash itself never leaves the server; only whether there is one.
    hasPassword: Boolean(user.passwordHash),
  }
}

/**
 * Makes sure a freshly signed-in account has a workspace to land in. Every way
 * in calls it — the password form, the sign-in link, and the Google callback.
 *
 * The import stays dynamic: workspaces.ts is a thousand lines of navigation
 * defaults that only the sign-in handlers ever need.
 */
export async function startWorkspaceFor(userId: string) {
  const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
  await getOrCreateCurrentWorkspace(userId)
}

function sendVerificationEmail(email: string, token: string) {
  return sendAuthEmail({
    to: email,
    subject: "Verify your email",
    heading: "Confirm your email address",
    message: "Verify your email to finish setting up your account.",
    action: "Verify email",
    actionUrl: appUrlFor(`/verify-email?token=${encodeURIComponent(token)}`),
  })
}

function requestIp() {
  return getRequestIP({ xForwardedFor: true }) || "unknown"
}
