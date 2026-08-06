import { createServerFn } from "@tanstack/react-start"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import {
  ACCOUNT_RESTORE_DAYS,
  isPendingDeletion,
} from "@/lib/account-deletion"
import { describeDevice } from "@/lib/device-label"
import { EMAIL_CHANGE_HOURS } from "@/lib/email-change"
import { SIGN_IN_LINK_MINUTES } from "@/lib/sign-in-link"
import {
  markAccountsForDeletion,
  purgeExpiredDeletions,
  restoreOwnAccount,
} from "@/server/people/account-deletion"
import { appUrlFor } from "@/server/app-url"
import { cancelSubscriptionsForDeletion } from "@/server/billing/stripe"
import { enforcePasswordNotBreached } from "@/server/auth/breached-passwords"
import { db } from "@/server/db"
import {
  cancelEmailChange,
  consumeEmailChange,
  createEmailChangeRevokeToken,
  createEmailChangeToken,
  findPendingEmailChange,
  revokeEmailChange,
  type PendingEmailChange,
} from "@/server/people/email-change"
import { sendAuthEmail } from "@/server/email/send"
import { enforceDeliverableEmail } from "@/server/email/deliverability"
import { isOwnedImageUrl } from "@/server/media/library"
import { clearRateLimit, enforceRateLimit } from "@/server/auth/rate-limit"
import { googleSignInEnabled } from "@/server/auth/google"
import { customShellSessions, customShellUsers } from "@/server/schema"
import { consumeSignInLink, createSignInLinkToken } from "@/server/auth/sign-in-link"
import { enforceHumanCheck, getHumanCheckSiteKey } from "@/server/auth/turnstile"
import {
  clearSessionCookie,
  consumeAuthToken,
  createAuthToken,
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
  requireOwnAccount,
  requireSessionOwner,
  signOutOtherDevices,
  requireUser,
  setSessionCookie,
  uuid,
  verifyPassword,
} from "@/server/auth/security"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import {
  alertEmailChanged,
  alertPasswordChanged,
  startSessionWithAlert,
} from "@/server/auth/security-alerts"

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
  /**
   * The profile photo's public URL, or "" when there is none — the shell falls
   * back to the account's initials.
   */
  avatarUrl: string
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
  /**
   * Set only by the "Restore my account" button, which the sign-in page offers
   * after a refusal. The flag is what makes bringing an account back a
   * deliberate second act rather than something a routine sign-in does by
   * accident — the credentials on their own are never enough.
   */
  restore: z.boolean().default(false),
})
const profileSchema = z.object({
  name: nameSchema,
  /**
   * The picture's URL, or "" to take the photo off. The server still checks it
   * is one of this account's own images before storing it — see the handler.
   */
  avatarUrl: z.string().trim().max(2048),
})
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
const changeEmailSchema = z.object({
  newEmail: emailSchema,
  /**
   * Absent only for an account that has no password, which is how an account
   * created by signing in with Google starts life.
   */
  currentPassword: z.string().min(1).max(128).optional(),
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
  ACCOUNT_PENDING_DELETION:
    "This account is scheduled for deletion, so it cannot be signed in to.",
  DELETED_BY_ADMIN:
    "An admin deleted this account. Contact support if that was a mistake.",
  RESTORE_WINDOW_PASSED: `This account was deleted more than ${ACCOUNT_RESTORE_DAYS} days ago and is gone for good.`,
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
  EMAIL_NO_MAILBOX:
    "We could not find a mail service for that email's domain, so a verification email would never reach you. Please check the address for typos.",
  EMAIL_THROWAWAY:
    "That looks like a temporary email address. We need one that can receive mail so we can verify your account — please use your everyday address.",
  HUMAN_CHECK_FAILED: HUMAN_CHECK_MESSAGE,
  GOOGLE_SIGN_IN_FAILED:
    "We could not sign you in with Google. Please try again.",
  PROVIDER_EMAIL_UNVERIFIED:
    "Google has not confirmed the email address on that account, so we cannot use it to sign you in.",
  EMAIL_TAKEN: "That email address is already in use.",
  EMAIL_UNCHANGED: "That is already the email address on your account.",
  EMAIL_CHANGE_ALREADY_DONE:
    "That change already went through, so there is nothing left to stop.",
  NO_EMAIL_CHANGE_PENDING:
    "There is no email change waiting on this account. It was already cancelled, or it ran out of time.",
  VIEW_AS_ACTIVE:
    "You are looking at the app as someone else. Leave that view first.",
  AVATAR_NOT_FOUND:
    "That picture is no longer in your media library. Pick another one.",
  PASSKEY_ATTEMPT_EXPIRED:
    "That passkey attempt took too long. Please try again.",
  PASSKEY_NOT_RECOGNISED:
    "That passkey is not linked to an account here. Sign in with your password, then add it under Account → Security.",
  PASSKEY_FAILED: "That passkey could not be checked. Please try again.",
  PASSKEY_EXISTS: "That passkey is already saved to an account.",
  PASSKEY_NOT_FOUND: "That passkey is already removed.",
  SUBSCRIPTION_CANCEL_FAILED:
    "We could not cancel your paid plan, so your account was not deleted. Please try again in a moment.",
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
  "ACCOUNT_PENDING_DELETION",
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
    // Verification is compulsory before sign-in, so an address that cannot
    // receive mail would only ever produce a dead account. Checked after the
    // throttle and human check so a bot cannot use it to place DNS lookups.
    await enforceDeliverableEmail(data.email)

    // Before the address is checked, not after: an address stays taken for as
    // long as the deleted account holding it is still restorable, and frees up
    // the moment that account is really gone.
    await purgeExpiredDeletions()

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

    const found = await findUserByEmail(data.email)
    if (!found || !(await verifyPassword(found.passwordHash, data.password))) {
      throw new Error("INVALID_CREDENTIALS")
    }
    if (found.status === "suspended") {
      throw new Error("ACCOUNT_SUSPENDED")
    }

    // The right password on an account that is on its way out signs nobody in.
    // The page is told why, offers to bring the account back, and only that
    // button answers this call a second time — so a routine sign-in can never
    // undo a deletion by accident.
    const user =
      isPendingDeletion(found) && data.restore
        ? await restoreOwnAccount(found)
        : found

    if (isPendingDeletion(user)) {
      throw new Error("ACCOUNT_PENDING_DELETION")
    }
    if (!user.emailVerifiedAt) {
      throw new Error("EMAIL_NOT_VERIFIED")
    }

    await clearRateLimit(rateLimitKey)
    // Sweeps up accounts whose restore window ran out. Here and registering are
    // the two places it happens; there is no background job in this app.
    await purgeExpiredDeletions()

    const token = await startSessionWithAlert(user, describeRequestOrigin())
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
        kind: "sign-in-link",
        to: link.email,
        tokens: { minutes: String(SIGN_IN_LINK_MINUTES) },
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
        kind: "password-reset",
        to: user.email,
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

    const changed = await db.transaction(async (tx) => {
      const consumed = await consumeAuthToken(
        data.token,
        "reset_password",
        tx,
        timestamp
      )

      const [account] = await tx
        .update(customShellUsers)
        .set({
          passwordHash,
          // Completing a reset proves the address works.
          emailVerifiedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(customShellUsers.id, consumed.userId))
        .returning({ email: customShellUsers.email })

      // Anyone signed in with the old password is signed out.
      await tx
        .delete(customShellSessions)
        .where(eq(customShellSessions.userId, consumed.userId))

      return account
    })

    clearSessionCookie()
    // Outside the transaction: a reset that worked must stay worked whatever
    // the mail server does. Sent for a reset as well as a deliberate change,
    // because the one somebody did not do is the one worth hearing about, and
    // a reset is the easier of the two to do to somebody else.
    if (changed) {
      await alertPasswordChanged(changed.email, describeRequestOrigin())
    }
    return { ok: true }
  })

const updateProfileFn = createServerFn({ method: "POST" })
  .inputValidator(profileSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()

    // The picture is drawn into the shell on every page, so what gets stored
    // has to be a file this account really uploaded — not any address the
    // browser felt like sending.
    if (data.avatarUrl && !(await isOwnedImageUrl(user.id, data.avatarUrl))) {
      throw new Error("AVATAR_NOT_FOUND")
    }

    const [updated] = await db
      .update(customShellUsers)
      .set({
        name: data.name,
        avatarUrl: data.avatarUrl || null,
        updatedAt: now(),
      })
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
    await alertPasswordChanged(user.email, describeRequestOrigin())
    return { ok: true }
  })

/** The address this account is waiting on, or nulls when it is waiting on none. */
export type EmailChangeState = {
  pendingEmail: string | null
  expiresAt: string | null
}

function describePendingChange(
  pending: PendingEmailChange | null
): EmailChangeState {
  return {
    pendingEmail: pending?.newEmail ?? null,
    expiresAt: pending?.expiresAt.toISOString() ?? null,
  }
}

/**
 * The change this account is waiting on, for the Profile tab. Nothing pending
 * is the ordinary case.
 */
const loadEmailChangeFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EmailChangeState> => {
    const user = await requireUser()
    return describePendingChange(await findPendingEmailChange(user.id))
  }
)

/**
 * Asks to move the account to another address. Nothing changes here — a
 * confirmation link goes to the new address, and opening it is what moves it.
 *
 * The current password is required whenever there is one. A stolen session
 * would otherwise be enough to take an account over outright: change the
 * address, then ask that address for a password reset.
 */
const requestEmailChangeFn = createServerFn({ method: "POST" })
  .inputValidator(changeEmailSchema)
  .handler(async ({ data }): Promise<EmailChangeState> => {
    requireAppOrigin()
    const user = await requireOwnAccount()

    // Keyed on the account rather than the address: what this endpoint can be
    // abused for is mailing strangers, and the account is who would be doing it.
    await enforceRateLimit(`email-change:${user.id}`, {
      maxAttempts: 5,
      windowSeconds: 60 * 60,
    })

    // Known gap, deliberately left open and written down rather than papered
    // over. An account created through Google or living on a passkey has no
    // password, so there is nothing to ask for and this check does not run —
    // which is exactly the account a stolen session could walk off with.
    //
    // Nothing here can close it: asking for a password nobody has would leave
    // those accounts unable to ever change their address. What covers it
    // instead is the pair of emails below. The old address is told at request
    // time and can stop the whole thing with one click, without signing in, and
    // is told again when it completes. Closing it properly means re-proving the
    // person some other way — a fresh Google sign-in or a passkey — which is
    // its own piece of work.
    if (
      user.passwordHash &&
      !(await verifyPassword(user.passwordHash, data.currentPassword ?? ""))
    ) {
      throw new Error("INVALID_CREDENTIALS")
    }

    const token = await createEmailChangeToken(user, data.newEmail)
    const revokeToken = await createEmailChangeRevokeToken(user.id)

    try {
      await sendAuthEmail({
        kind: "email-change",
        to: data.newEmail,
        tokens: {
          old_email: user.email,
          hours: String(EMAIL_CHANGE_HOURS),
        },
        actionUrl: appUrlFor(`/change-email?token=${encodeURIComponent(token)}`),
      })

      // The old address hears about it too, and gets the one thing it needs:
      // a way to stop this without signing in. For an account with no password
      // — Google, a passkey — the check above did not run at all, so this
      // warning is the only thing standing between a stolen session and the
      // account.
      await sendAuthEmail({
        kind: "email-change-warning",
        to: user.email,
        tokens: {
          new_email: data.newEmail,
          hours: String(EMAIL_CHANGE_HOURS),
        },
        actionUrl: appUrlFor(
          `/revoke-email-change?token=${encodeURIComponent(revokeToken)}`
        ),
      })
    } catch (deliveryError) {
      // Both tokens are dropped rather than left behind. This is the one link
      // whose existence is shown to the person who asked for it, so a mail that
      // never went out must not leave the tab saying one is on its way — they
      // would sit waiting for a link that cannot arrive. And a change nobody
      // was warned about must not be left standing.
      await cancelEmailChange(user.id)
      throw deliveryError
    }

    // Read back rather than assembled here, so the tab shows the row the
    // server actually holds — including its exact expiry.
    return describePendingChange(await findPendingEmailChange(user.id))
  })

const cancelEmailChangeFn = createServerFn({ method: "POST" }).handler(
  async () => {
    requireAppOrigin()
    const user = await requireOwnAccount()
    await cancelEmailChange(user.id)
    return { ok: true }
  }
)

/**
 * Spends a confirmation link. Deliberately open to a signed-out browser: the
 * link is mailed to the new address and may well be opened somewhere the person
 * has never signed in. The single-use token is the whole proof.
 */
const confirmEmailChangeFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: tokenSchema }))
  .handler(async ({ data }) => {
    requireAppOrigin()
    // Nothing above has been checked yet, so without a limit anyone could call
    // this endpoint with made-up links all day. A success clears it, because
    // the refused attempts are the only ones worth counting.
    const rateLimitKey = `email-change-confirm:${requestIp()}`
    await enforceRateLimit(rateLimitKey, {
      maxAttempts: 10,
      windowSeconds: 60 * 60,
    })

    const { user, previousEmail } = await consumeEmailChange(data.token)
    await clearRateLimit(rateLimitKey)

    // The last thing that address will ever hear from the app, and the reason
    // it is worth sending: somebody who missed the warning still learns the
    // account is gone, and that support is now the only way back.
    await alertEmailChanged(previousEmail, user.email)

    return { email: user.email }
  })

/**
 * Spends a "this wasn't me" link: stops the change and signs the account out
 * everywhere.
 *
 * Open to a signed-out browser for the same reason the confirm side is, only
 * more so. The person this is for may be in the middle of losing the account,
 * so asking them to sign in first would be asking the impossible. The
 * single-use token is the whole proof, and all it can do is put things back.
 */
const revokeEmailChangeFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: tokenSchema }))
  .handler(async ({ data }) => {
    requireAppOrigin()
    // Same reasoning as the confirm side: nothing above has been checked, so
    // without a limit anyone could sit here guessing links. A success clears
    // it, because only the refused attempts are worth counting.
    const rateLimitKey = `email-change-revoke:${requestIp()}`
    await enforceRateLimit(rateLimitKey, {
      maxAttempts: 10,
      windowSeconds: 60 * 60,
    })

    const result = await revokeEmailChange(data.token)
    await clearRateLimit(rateLimitKey)

    return result
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

    const { countOtherActiveAdmins } = await import("@/server/people/accounts")
    if (
      user.role === "admin" &&
      (await countOtherActiveAdmins(user.id)) === 0
    ) {
      throw new Error("LAST_ADMIN")
    }

    // Their paid plan goes before their account does. The account is
    // unreachable from the next line on, so a plan that outlived it would be
    // money taken for something nobody can open.
    await cancelSubscriptionsForDeletion([user.id])

    // Marked, not removed. Nothing can be reached with it from this moment on,
    // and it is really deleted once the restore window runs out.
    await markAccountsForDeletion(user.id, [user.id])
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

/**
 * `restore` is the sign-in page's "Restore my account" button answering a
 * refusal, and nothing else ever sets it.
 */
export function login(email: string, password: string, restore = false) {
  return loginFn({ data: { email, password, restore } })
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

export function updateProfile(name: string, avatarUrl: string) {
  return updateProfileFn({ data: { name, avatarUrl } })
}

export function changePassword(
  currentPassword: string | undefined,
  newPassword: string
) {
  return changePasswordFn({ data: { currentPassword, newPassword } })
}

export function loadEmailChange() {
  return loadEmailChangeFn()
}

export function requestEmailChange(
  newEmail: string,
  currentPassword: string | undefined
) {
  return requestEmailChangeFn({ data: { newEmail, currentPassword } })
}

export function cancelPendingEmailChange() {
  return cancelEmailChangeFn()
}

export function confirmEmailChange(token: string) {
  return confirmEmailChangeFn({ data: { token } })
}

export function revokePendingEmailChange(token: string) {
  return revokeEmailChangeFn({ data: { token } })
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
  avatarUrl: string | null
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
    avatarUrl: user.avatarUrl ?? "",
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
  const { getOrCreateCurrentWorkspace } = await import("@/server/people/workspaces")
  await getOrCreateCurrentWorkspace(userId)
}

function sendVerificationEmail(email: string, token: string) {
  return sendAuthEmail({
    kind: "verify-email",
    to: email,
    actionUrl: appUrlFor(`/verify-email?token=${encodeURIComponent(token)}`),
  })
}

