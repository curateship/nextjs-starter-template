import { createServerFn } from "@tanstack/react-start"
import { getCookie, getRequestIP } from "@tanstack/react-start/server"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { localPomoderUrl } from "@/lib/app-port"
import { sendAuthEmail } from "@/server/email"
import { requireAppOrigin } from "@/server/origin"
import { enforceRateLimit } from "@/server/rate-limit"
import { authTokens, sessions, userPreferences, users, type User } from "@/server/schema"
import {
  clearSessionCookie,
  consumeAuthToken,
  createSecretToken,
  createSessionExpiresAt,
  findCurrentUser,
  hashPassword,
  hashToken,
  now,
  setSessionCookie,
  verifyPassword,
  SESSION_COOKIE_NAME,
} from "@/server/security"

export type AuthUser = Pick<User, "id" | "email" | "name" | "role" | "timezone" | "publicDisplayName" | "leaderboardOptIn" | "emailVerifiedAt">

const email = z.string().trim().toLowerCase().email().max(255)
const password = z.string().min(8).max(128)
const registerSchema = z.object({ email, password, name: z.string().trim().min(1).max(100) })
const loginSchema = z.object({ email, password: z.string().min(1).max(128) })
const tokenSchema = z.object({ token: z.string().min(32).max(200) })
const resetSchema = tokenSchema.extend({ password })
const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) })
const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  publicDisplayName: z.string().trim().min(2).max(50).nullable(),
  timezone: z.string().min(1).max(80),
  leaderboardOptIn: z.boolean(),
})

const loadCurrentUserFn = createServerFn({ method: "GET" }).handler(async () => serializeUser(await findCurrentUser()))

const registerFn = createServerFn({ method: "POST" }).inputValidator(registerSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const ip = getRequestIP({ xForwardedFor: true }) || "unknown"
  await enforceRateLimit(`register:${ip}`, { maxAttempts: 5, windowSeconds: 3_600 })
  const existing = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${data.email}`).limit(1)
  if (existing.length) throw new Error("ACCOUNT_EXISTS")

  const rawToken = createSecretToken()
  const timestamp = now()
  const [user] = await db.transaction(async (tx) => {
    const created = await tx.insert(users).values({ email: data.email, name: data.name, passwordHash: await hashPassword(data.password), createdAt: timestamp, updatedAt: timestamp }).returning()
    await tx.insert(userPreferences).values({ userId: created[0].id })
    await tx.insert(authTokens).values({ userId: created[0].id, tokenHash: hashToken(rawToken), purpose: "verify_email", expiresAt: new Date(timestamp.getTime() + 86_400_000) })
    return created
  })
  await sendAuthEmail({ to: user.email, subject: "Verify your Pomoder account", heading: "Welcome to Pomoder", message: "Verify your email to sync your focus history and join rooms.", action: "Verify email", actionUrl: `${appUrl()}/verify-email?token=${encodeURIComponent(rawToken)}` })
  return { ok: true }
})

const verifyEmailFn = createServerFn({ method: "POST" }).inputValidator(tokenSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const timestamp = now()
  await db.transaction(async (tx) => {
    const token = await consumeAuthToken(
      hashToken(data.token),
      "verify_email",
      timestamp,
      tx
    )
    await tx.update(users).set({ emailVerifiedAt: timestamp, updatedAt: timestamp }).where(eq(users.id, token.userId))
  })
  return { ok: true }
})

const loginFn = createServerFn({ method: "POST" }).inputValidator(loginSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const ip = getRequestIP({ xForwardedFor: true }) || "unknown"
  await enforceRateLimit(`login:${ip}:${data.email}`, { maxAttempts: 5, windowSeconds: 900 })
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${data.email}`).limit(1)
  if (!user || !(await verifyPassword(user.passwordHash, data.password))) throw new Error("INVALID_CREDENTIALS")
  if (!user.emailVerifiedAt) throw new Error("EMAIL_NOT_VERIFIED")
  const rawToken = createSecretToken()
  await db.insert(sessions).values({ userId: user.id, tokenHash: hashToken(rawToken), expiresAt: createSessionExpiresAt() })
  setSessionCookie(rawToken)
  return serializeUser(user)
})

const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  requireAppOrigin()
  const token = getCookie(SESSION_COOKIE_NAME)
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  clearSessionCookie()
})

const requestResetFn = createServerFn({ method: "POST" }).inputValidator(z.object({ email })).handler(async ({ data }) => {
  requireAppOrigin()
  const ip = getRequestIP({ xForwardedFor: true }) || "unknown"
  await enforceRateLimit(`password-reset:${ip}`, { maxAttempts: 5, windowSeconds: 3_600 })
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${data.email}`).limit(1)
  if (!user) return { ok: true }
  const rawToken = createSecretToken()
  await db.insert(authTokens).values({ userId: user.id, tokenHash: hashToken(rawToken), purpose: "reset_password", expiresAt: new Date(Date.now() + 3_600_000) })
  await sendAuthEmail({ to: user.email, subject: "Reset your Pomoder password", heading: "Reset your password", message: "This link expires in one hour.", action: "Reset password", actionUrl: `${appUrl()}/reset-password?token=${encodeURIComponent(rawToken)}` })
  return { ok: true }
})

const resetPasswordFn = createServerFn({ method: "POST" }).inputValidator(resetSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const timestamp = now()
  await db.transaction(async (tx) => {
    const token = await consumeAuthToken(
      hashToken(data.token),
      "reset_password",
      timestamp,
      tx
    )
    await tx.update(users).set({ passwordHash: await hashPassword(data.password), updatedAt: timestamp }).where(eq(users.id, token.userId))
    await tx.delete(sessions).where(eq(sessions.userId, token.userId))
  })
  clearSessionCookie()
  return { ok: true }
})

const updateProfileFn = createServerFn({ method: "POST" }).inputValidator(profileSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const current = await findCurrentUser()
  if (!current) throw new Error("AUTH_REQUIRED")
  const [updated] = await db.update(users).set({ ...data, updatedAt: now() }).where(eq(users.id, current.id)).returning()
  return serializeUser(updated)
})

const deleteAccountFn = createServerFn({ method: "POST" }).inputValidator(deleteAccountSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const current = await findCurrentUser()
  if (!current) throw new Error("AUTH_REQUIRED")
  if (!(await verifyPassword(current.passwordHash, data.password))) throw new Error("INVALID_CREDENTIALS")
  await db.delete(users).where(eq(users.id, current.id))
  clearSessionCookie()
  return { ok: true }
})

export const loadCurrentUser = () => loadCurrentUserFn()
export const register = (data: z.infer<typeof registerSchema>) => registerFn({ data })
export const verifyEmail = (token: string) => verifyEmailFn({ data: { token } })
export const login = (emailValue: string, passwordValue: string) => loginFn({ data: { email: emailValue, password: passwordValue } })
export const logout = () => logoutFn()
export const requestPasswordReset = (emailValue: string) => requestResetFn({ data: { email: emailValue } })
export const resetPassword = (token: string, passwordValue: string) => resetPasswordFn({ data: { token, password: passwordValue } })
export const updateProfile = (data: z.infer<typeof profileSchema>) => updateProfileFn({ data })
export const deleteAccount = (passwordValue: string) => deleteAccountFn({ data: { password: passwordValue } })

export function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.includes("ACCOUNT_EXISTS")) return "An account already exists for this email."
  if (message.includes("INVALID_CREDENTIALS")) return "Invalid email or password."
  if (message.includes("EMAIL_NOT_VERIFIED")) return "Verify your email before signing in."
  if (message.includes("RATE_LIMITED")) return "Too many attempts. Please try again later."
  if (message.includes("INVALID_OR_EXPIRED_TOKEN")) return "This link is invalid or has expired."
  return "We could not complete that request. Please try again."
}

function serializeUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null
  return { id: user.id, email: user.email, name: user.name, role: user.role, timezone: user.timezone, publicDisplayName: user.publicDisplayName, leaderboardOptIn: user.leaderboardOptIn, emailVerifiedAt: user.emailVerifiedAt }
}

function appUrl() { return (process.env.POMODER_APP_URL || localPomoderUrl).replace(/\/$/, "") }
