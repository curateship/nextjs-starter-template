import { createHash, randomBytes } from "node:crypto"

import { getCookie, getRequestProtocol, setCookie } from "@tanstack/react-start/server"
import { and, eq } from "drizzle-orm"

import { appUrlFor } from "@/server/app-url"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { dateMatches } from "@/server/tinder/schema"

import { dateGoogleCalendars } from "./schema"

/**
 * Agreed dates in the member's Google Calendar, one way: Date makes, moves
 * and deletes its own event for each date, and never reads the calendar.
 * Tyler's choice, 18 Oct 2026 (part 15 of "features/01-chats-and-replies").
 *
 * It uses the same Google app as the shell's "Continue with Google"
 * (`CUSTOM_SHELL_GOOGLE_CLIENT_ID` and `_SECRET`), asking only for the
 * permission to manage calendar events. With either key missing, which is how
 * local development is left, Connect says so and nothing else changes. The
 * app's Google console must list `/api/dating/google-calendar/callback` as a
 * redirect address and have the Calendar API switched on.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
const REVOKE_URL = "https://oauth2.googleapis.com/revoke"
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
const SCOPE = "openid email https://www.googleapis.com/auth/calendar.events"
const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/dating/google-calendar/callback"
const TIMEOUT_MS = 10_000

/** A date event lasts this long in the calendar. */
const DATE_LENGTH_MS = 2 * 60 * 60_000

export type Fetcher = typeof fetch

function credentials() {
  const clientId = process.env.CUSTOM_SHELL_GOOGLE_CLIENT_ID
  const clientSecret = process.env.CUSTOM_SHELL_GOOGLE_CLIENT_SECRET
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/** Whether this server can connect a Google Calendar at all. */
export function googleCalendarAvailable(): boolean {
  return credentials() !== null
}

const GOOGLE_NOT_SET_UP =
  "Google is not set up on this server. It needs the Google app's two keys, the same ones Continue with Google uses."

const HANDSHAKE_COOKIE = "date_google_calendar"
const HANDSHAKE_TTL_SECONDS = 10 * 60

/**
 * The address that sends the member to Google. `state` is checked against the
 * cookie on the way back, so a link somebody else made cannot connect their
 * calendar to this account, and the PKCE verifier means a stolen code is
 * useless on its own.
 */
export function startCalendarConnect(accountId: string): string {
  const keys = credentials()
  if (!keys) throw new Error(GOOGLE_NOT_SET_UP)
  const state = randomBytes(32).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  setCookie(HANDSHAKE_COOKIE, JSON.stringify({ state, verifier, accountId }), {
    httpOnly: true,
    maxAge: HANDSHAKE_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  })
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: keys.clientId,
    redirect_uri: appUrlFor(GOOGLE_CALENDAR_CALLBACK_PATH),
    response_type: "code",
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // A refresh token, so dates can be written while the member is away, and
    // the consent screen every time, because Google only hands one out then.
    access_type: "offline",
    prompt: "consent",
  }).toString()
  return url.toString()
}

/**
 * The handshake's verifier and the profile that asked, when Google's `state`
 * matches the cookie, cleared either way so one trip connects once.
 */
export function takeCalendarHandshake(state: string | null): { verifier: string; accountId: string } | null {
  const raw = getCookie(HANDSHAKE_COOKIE)
  setCookie(HANDSHAKE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  })
  if (!raw || !state) return null
  try {
    const parsed = JSON.parse(raw) as { state?: string; verifier?: string; accountId?: string }
    return parsed.state === state && parsed.verifier && parsed.accountId ? { verifier: parsed.verifier, accountId: parsed.accountId } : null
  } catch {
    return null
  }
}

async function googleJson<T>(fetcher: Fetcher, url: string, init: RequestInit, what: string): Promise<T> {
  let response: Response
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new Error(`Google could not be reached to ${what}.`)
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    console.error(`Google Calendar: ${what}`, response.status, detail.slice(0, 300))
    if (response.status === 401 || response.status === 400) {
      throw new Error(`Google refused to ${what}. Connect Google Calendar again in the Dating settings.`)
    }
    throw new Error(`Google answered with an error (HTTP ${response.status}) trying to ${what}.`)
  }
  return (response.status === 204 ? {} : await response.json()) as T
}

/** Swaps the code Google sent back for a refresh token, and keeps it encrypted against the profile. */
export async function finishCalendarConnect(
  account: { id: string; userId: string; workspaceId: string },
  code: string,
  verifier: string,
  db: CustomShellDb = defaultDb,
  fetcher: Fetcher = fetch,
  now: Date = new Date()
): Promise<void> {
  const keys = credentials()
  if (!keys) throw new Error(GOOGLE_NOT_SET_UP)
  const tokens = await googleJson<{ refresh_token?: string; access_token?: string }>(
    fetcher,
    TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: keys.clientId,
        client_secret: keys.clientSecret,
        redirect_uri: appUrlFor(GOOGLE_CALENDAR_CALLBACK_PATH),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
    },
    "connect your calendar"
  )
  if (!tokens.refresh_token || !tokens.access_token) {
    throw new Error("Google did not give Date lasting access. Connect again and allow calendar access.")
  }
  const who = await googleJson<{ email?: string }>(
    fetcher,
    USERINFO_URL,
    { headers: { authorization: `Bearer ${tokens.access_token}` } },
    "read which Google account this is"
  ).catch(() => ({ email: "" }))
  const values = {
    email: (who.email ?? "").slice(0, 320),
    refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
    connectedAt: now,
    lastError: "",
  }
  await db
    .insert(dateGoogleCalendars)
    .values({ accountId: account.id, userId: account.userId, workspaceId: account.workspaceId, ...values })
    .onConflictDoUpdate({ target: dateGoogleCalendars.accountId, set: values })
}

export type CalendarConnection = { available: boolean; connected: boolean; email: string; lastError: string }

export async function calendarConnection(accountId: string, db: CustomShellDb = defaultDb): Promise<CalendarConnection> {
  const [row] = await db.select().from(dateGoogleCalendars).where(eq(dateGoogleCalendars.accountId, accountId)).limit(1)
  return { available: googleCalendarAvailable(), connected: Boolean(row), email: row?.email ?? "", lastError: row?.lastError ?? "" }
}

/** Forgets the calendar and asks Google to cancel Date's access. Events already written stay in the calendar. */
export async function disconnectCalendar(accountId: string, db: CustomShellDb = defaultDb, fetcher: Fetcher = fetch): Promise<void> {
  const [row] = await db.delete(dateGoogleCalendars).where(eq(dateGoogleCalendars.accountId, accountId)).returning()
  if (!row) return
  try {
    await fetcher(`${REVOKE_URL}?${new URLSearchParams({ token: decryptSecret(row.refreshTokenEncrypted) })}`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    // Forgotten here either way; Google's own account page can remove it too.
    console.error("Google Calendar access could not be revoked", error)
  }
}

async function accessToken(row: typeof dateGoogleCalendars.$inferSelect, fetcher: Fetcher): Promise<string> {
  const keys = credentials()
  if (!keys) throw new Error(GOOGLE_NOT_SET_UP)
  const tokens = await googleJson<{ access_token?: string }>(
    fetcher,
    TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: keys.clientId,
        client_secret: keys.clientSecret,
        refresh_token: decryptSecret(row.refreshTokenEncrypted),
        grant_type: "refresh_token",
      }).toString(),
    },
    "open your calendar"
  )
  if (!tokens.access_token) throw new Error("Google did not open your calendar. Connect Google Calendar again in the Dating settings.")
  return tokens.access_token
}

/**
 * Brings one date's event in its profile's Google Calendar into line with the
 * date: made when it has a time, moved when the time or place changed, and
 * deleted when the time was cleared. Nothing happens without a connected
 * calendar. A failure is kept on the connection and thrown in words; the date
 * itself stays saved in Date.
 */
export async function syncDateEvent(
  userId: string,
  matchId: string,
  db: CustomShellDb = defaultDb,
  fetcher: Fetcher = fetch
): Promise<"none" | "written" | "deleted"> {
  const [match] = await db.select().from(dateMatches).where(and(eq(dateMatches.id, matchId), eq(dateMatches.userId, userId))).limit(1)
  if (!match || match.sample) return "none"
  const calendar = eq(dateGoogleCalendars.accountId, match.accountId)
  const [row] = await db.select().from(dateGoogleCalendars).where(calendar).limit(1)
  if (!row) return "none"
  try {
    const token = await accessToken(row, fetcher)
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" }
    if (!match.dateAt) {
      if (!match.googleEventId) return "none"
      await googleJson(fetcher, `${EVENTS_URL}/${encodeURIComponent(match.googleEventId)}`, { method: "DELETE", headers: auth }, "take the date out of your calendar").catch(
        (error: unknown) => {
          // Already deleted in Google is the outcome wanted.
          if (!(error instanceof Error && /HTTP (404|410)/.test(error.message))) throw error
        }
      )
      await db.update(dateMatches).set({ googleEventId: "" }).where(eq(dateMatches.id, match.id))
      await db.update(dateGoogleCalendars).set({ lastError: "" }).where(calendar)
      return "deleted"
    }
    const event = {
      summary: `Date with ${match.theirName}`,
      location: match.datePlace || undefined,
      description: "Added by Date.",
      start: { dateTime: match.dateAt.toISOString() },
      end: { dateTime: new Date(match.dateAt.getTime() + DATE_LENGTH_MS).toISOString() },
    }
    const saved = match.googleEventId
      ? await googleJson<{ id?: string }>(
          fetcher,
          `${EVENTS_URL}/${encodeURIComponent(match.googleEventId)}`,
          { method: "PATCH", headers: auth, body: JSON.stringify(event) },
          "move the date in your calendar"
        )
      : await googleJson<{ id?: string }>(fetcher, EVENTS_URL, { method: "POST", headers: auth, body: JSON.stringify(event) }, "add the date to your calendar")
    await db
      .update(dateMatches)
      .set({ googleEventId: (saved.id ?? match.googleEventId).slice(0, 200) })
      .where(eq(dateMatches.id, match.id))
    await db.update(dateGoogleCalendars).set({ lastError: "" }).where(calendar)
    return "written"
  } catch (error) {
    const words = error instanceof Error ? error.message : "Google Calendar could not be written to."
    await db.update(dateGoogleCalendars).set({ lastError: words }).where(calendar)
    throw new Error(words)
  }
}
