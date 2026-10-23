import { createHash, randomBytes } from "node:crypto"

import {
  getCookie,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server"
import { eq, sql } from "drizzle-orm"

import {
  YOUTUBE_CLIENT_MISSING_MESSAGE,
  YOUTUBE_CLIENT_REFUSED_MESSAGE,
  YOUTUBE_CLIENT_UNREADABLE_MESSAGE,
  YOUTUBE_NOT_CONNECTED_MESSAGE,
  YOUTUBE_SIGNED_OUT_MESSAGE,
  YOUTUBE_UNREACHABLE_MESSAGE,
  type StoredYoutubeConnection,
  type StoredYoutubeOauthClient,
  type YoutubeConnectionStatus,
} from "@/lib/video/retention"
import { appUrlFor } from "@/server/app-url"
import { now } from "@/server/auth/security"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { db, type CustomShellDb } from "@/server/db"
import { videoSettings } from "@/server/video/schema"

/**
 * Connect YouTube: the app signs in to one YouTube channel with Google, once,
 * so it can read the retention curves YouTube keeps for that channel's videos
 * (`workspace/docs/retention-curve.md`).
 *
 * The Google sign-in client (an id and a secret Tyler makes in Google Cloud)
 * is pasted on Settings → YouTube and kept beside the YouTube key, the secret
 * scrambled. It is its own client, not the members' "Continue with Google"
 * one, so the YouTube permissions never touch the members' sign-in.
 *
 * Both permissions asked for are read-only. The app can read the channel's
 * name, its videos and their figures, and nothing it does can post, edit or
 * delete anything on the channel. The refresh token Google hands back is
 * scrambled before it is stored and never leaves the server; the browser only
 * ever learns the channel's name.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const REVOKE_URL = "https://oauth2.googleapis.com/revoke"
const DATA_API = "https://www.googleapis.com/youtube/v3"

/** Retention figures, and the channel's name and videos. Both read-only. */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
]

/** Registered in Google Cloud as the client's authorised redirect URI. */
export const YOUTUBE_CALLBACK_PATH = "/api/v1/video/youtube/callback"

/** Where the browser lands afterwards, carrying how it went. */
export const YOUTUBE_SETTINGS_PATH = "/admin/settings/youtube"

const TIMEOUT_MS = 15_000
const SETTINGS_ROW_ID = "default"

async function readRow(database: CustomShellDb) {
  const [row] = await database
    .select({
      client: videoSettings.youtubeOauthClient,
      connection: videoSettings.youtubeOauth,
    })
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return { client: row?.client ?? null, connection: row?.connection ?? null }
}

async function writeRow(
  values: {
    youtubeOauthClient?: StoredYoutubeOauthClient | null
    youtubeOauth?: StoredYoutubeConnection | null
  },
  database: CustomShellDb
) {
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      ...values,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { ...values, updatedAt: timestamp },
    })
}

export async function getYoutubeConnectionStatus(
  database: CustomShellDb = db
): Promise<YoutubeConnectionStatus> {
  const { client, connection } = await readRow(database)
  let maskedSecret: string | null = null
  let clientUnreadable = false
  if (client?.clientSecret) {
    try {
      maskedSecret = `••••${decryptSecret(client.clientSecret).slice(-4)}`
    } catch {
      clientUnreadable = true
    }
  }
  return {
    redirectUri: appUrlFor(YOUTUBE_CALLBACK_PATH),
    clientId: client?.clientId || null,
    maskedSecret,
    clientUnreadable,
    channel: connection
      ? {
          id: connection.channelId,
          title: connection.channelTitle,
          connectedAt: connection.connectedAt,
        }
      : null,
  }
}

/**
 * Saves one half of the pasted client, keeping the other half as it was. The
 * database merges the one field in, so the id and the secret saving at the
 * same moment cannot write over each other. A different client id is a
 * different Google client, which cannot use the channel's sign-in made
 * through the old one, so the channel is disconnected first. A new secret for
 * the same client keeps the channel.
 */
export async function saveYoutubeOauthClient(
  part: { clientId: string } | { clientSecret: string },
  database: CustomShellDb = db,
  fetchFn: typeof fetch = fetch
) {
  const piece =
    "clientId" in part
      ? { clientId: part.clientId.trim() }
      : { clientSecret: encryptSecret(part.clientSecret.trim()) }
  if ("clientId" in piece) {
    const { client, connection } = await readRow(database)
    if (connection && piece.clientId !== client?.clientId) {
      await disconnectYoutube(database, fetchFn)
    }
  }

  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      youtubeOauthClient: { clientId: "", clientSecret: "", ...piece },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: {
        youtubeOauthClient: sql`coalesce(${videoSettings.youtubeOauthClient}, '{"clientId": "", "clientSecret": ""}'::jsonb) || ${JSON.stringify(piece)}::jsonb`,
        updatedAt: timestamp,
      },
    })
}

/** Forgets the client and, because it cannot work without one, the channel. */
export async function removeYoutubeOauthClient(
  database: CustomShellDb = db,
  fetchFn: typeof fetch = fetch
) {
  await disconnectYoutube(database, fetchFn)
  await writeRow({ youtubeOauthClient: null }, database)
}

/** The client, unscrambled. SERVER ONLY: the secret must never reach a browser. */
async function requireClient(database: CustomShellDb) {
  const { client } = await readRow(database)
  if (!client?.clientId || !client.clientSecret) {
    throw new Error(YOUTUBE_CLIENT_MISSING_MESSAGE)
  }
  try {
    return {
      clientId: client.clientId,
      clientSecret: decryptSecret(client.clientSecret),
    }
  } catch {
    throw new Error(YOUTUBE_CLIENT_UNREADABLE_MESSAGE)
  }
}

/** What the browser is sent to Google with, and what it must bring back. */
export type YoutubeHandshake = {
  authorizeUrl: string
  /** Echoed back by Google and checked against the cookie: the CSRF guard. */
  state: string
  /** The PKCE secret, spent at the token exchange. */
  verifier: string
}

/**
 * The address that sends the admin to Google's consent screen.
 * `access_type=offline` with `prompt=consent` is what makes Google hand back a
 * refresh token every time, including on a second connect, so the figures can
 * be read later without anybody signing in again.
 */
export async function startYoutubeConnect(
  database: CustomShellDb = db
): Promise<YoutubeHandshake> {
  const { clientId } = await requireClient(database)
  const state = randomBytes(32).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")

  const authorizeUrl = new URL(AUTHORIZE_URL)
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: appUrlFor(YOUTUBE_CALLBACK_PATH),
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent select_account",
  }).toString()

  return { authorizeUrl: authorizeUrl.toString(), state, verifier }
}

/**
 * Where the two secrets wait while the browser is at Google. httpOnly, ten
 * minutes, and read only once, the same as the shell's "Continue with Google".
 */
const HANDSHAKE_COOKIE = "video_youtube_connect"
const HANDSHAKE_TTL_SECONDS = 10 * 60

function writeHandshakeCookie(value: string, maxAge: number) {
  setCookie(HANDSHAKE_COOKIE, value, {
    httpOnly: true,
    maxAge,
    path: "/",
    // Lax: Google sends the browser back with a plain link.
    sameSite: "lax",
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  })
}

export function rememberYoutubeHandshake(handshake: YoutubeHandshake) {
  writeHandshakeCookie(
    JSON.stringify({ state: handshake.state, verifier: handshake.verifier }),
    HANDSHAKE_TTL_SECONDS
  )
}

/** Reads the handshake and clears it, so one trip completes one connect. */
export function takeYoutubeHandshake(): { state: string; verifier: string } | null {
  const raw = getCookie(HANDSHAKE_COOKIE)
  writeHandshakeCookie("", 0)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: unknown; verifier?: unknown }
    return typeof parsed.state === "string" &&
      typeof parsed.verifier === "string"
      ? { state: parsed.state, verifier: parsed.verifier }
      : null
  } catch {
    return null
  }
}

/**
 * Why a connect did not finish, as the short code the callback puts in the
 * address. Settings → YouTube turns it into a sentence.
 */
export type YoutubeConnectFailure =
  | "failed"
  | "scopes"
  | "no_channel"
  | "client_missing"

export class YoutubeConnectError extends Error {
  readonly code: YoutubeConnectFailure
  constructor(code: YoutubeConnectFailure) {
    super(`YOUTUBE_CONNECT_${code.toUpperCase()}`)
    this.code = code
  }
}

/**
 * Trades Google's code for the refresh token, looks up the channel it opens,
 * and keeps both. Refused when the person unticked a permission on Google's
 * screen, or when the Google account has no YouTube channel.
 */
export async function finishYoutubeConnect(
  code: string,
  verifier: string,
  database: CustomShellDb = db,
  fetchFn: typeof fetch = fetch
): Promise<{ channelTitle: string }> {
  let client: { clientId: string; clientSecret: string }
  try {
    client = await requireClient(database)
  } catch {
    throw new YoutubeConnectError("client_missing")
  }

  const tokens = await postToken(
    fetchFn,
    new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: appUrlFor(YOUTUBE_CALLBACK_PATH),
      grant_type: "authorization_code",
      code_verifier: verifier,
    })
  ).catch((error) => {
    // The reason names the misconfiguration (a wrong secret reads as
    // "invalid_client") and never carries the secret itself.
    console.warn(`[video] youtube connect failed: ${String(error)}`)
    throw new YoutubeConnectError("failed")
  })

  const granted = new Set(
    typeof tokens.scope === "string" ? tokens.scope.split(" ") : []
  )
  if (!YOUTUBE_SCOPES.every((scope) => granted.has(scope))) {
    throw new YoutubeConnectError("scopes")
  }
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string"
  ) {
    throw new YoutubeConnectError("failed")
  }

  const channels = await youtubeJson(
    fetchFn,
    `${DATA_API}/channels?${new URLSearchParams({ part: "snippet", mine: "true" })}`,
    tokens.access_token
  ).catch((error) => {
    console.warn(`[video] youtube channel lookup failed: ${String(error)}`)
    throw new YoutubeConnectError("failed")
  })
  const channel = Array.isArray(channels.items)
    ? (channels.items[0] as Record<string, unknown> | undefined)
    : undefined
  const channelId = typeof channel?.id === "string" ? channel.id : null
  if (!channelId) throw new YoutubeConnectError("no_channel")
  const snippet = (channel?.snippet ?? {}) as Record<string, unknown>
  const channelTitle =
    (typeof snippet.title === "string" && snippet.title.trim().slice(0, 200)) ||
    channelId

  await writeRow(
    {
      youtubeOauth: {
        refreshToken: encryptSecret(tokens.refresh_token),
        channelId,
        channelTitle,
        connectedAt: now().toISOString(),
      },
    },
    database
  )
  return { channelTitle }
}

/**
 * Deletes the channel's sign-in. Google is asked to cancel the token too, so
 * the app also drops off the channel's list of connected apps; when Google
 * cannot be reached the token is deleted here all the same, and `revoked`
 * says it stayed listed there.
 */
export async function disconnectYoutube(
  database: CustomShellDb = db,
  fetchFn: typeof fetch = fetch
): Promise<{ revoked: boolean }> {
  const { connection } = await readRow(database)
  if (!connection) return { revoked: true }
  let revoked = false
  try {
    const response = await fetchFn(REVOKE_URL, {
      method: "POST",
      body: new URLSearchParams({ token: decryptSecret(connection.refreshToken) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // 400 is Google saying the token was already cancelled.
    revoked = response.ok || response.status === 400
  } catch {
    revoked = false
  }
  await writeRow({ youtubeOauth: null }, database)
  return { revoked }
}

/**
 * A fresh access token for the connected channel, from its refresh token.
 * Google refusing the refresh token means the channel's owner cancelled the
 * app's access, or the token sat unused for months: the answer is connecting
 * again, so that is what the refusal says.
 */
export async function youtubeAccess(
  database: CustomShellDb = db,
  fetchFn: typeof fetch = fetch
): Promise<{ accessToken: string; connection: StoredYoutubeConnection }> {
  const { connection } = await readRow(database)
  if (!connection) throw new Error(YOUTUBE_NOT_CONNECTED_MESSAGE)
  const client = await requireClient(database)

  let refreshToken: string
  try {
    refreshToken = decryptSecret(connection.refreshToken)
  } catch {
    throw new Error(YOUTUBE_SIGNED_OUT_MESSAGE)
  }

  const tokens = await postToken(
    fetchFn,
    new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })
  ).catch((error: Error) => {
    if (error.message === "invalid_grant") {
      throw new Error(YOUTUBE_SIGNED_OUT_MESSAGE)
    }
    if (error.message === YOUTUBE_UNREACHABLE_MESSAGE) throw error
    if (
      error.message === "invalid_client" ||
      error.message === "unauthorized_client"
    ) {
      throw new Error(YOUTUBE_CLIENT_REFUSED_MESSAGE)
    }
    console.warn(`[video] youtube token refresh failed: ${error.message}`)
    throw new Error(YOUTUBE_SIGNED_OUT_MESSAGE)
  })
  if (typeof tokens.access_token !== "string") {
    throw new Error(YOUTUBE_SIGNED_OUT_MESSAGE)
  }
  return { accessToken: tokens.access_token, connection }
}

/** Google's token endpoint. Throws its `error` code, such as invalid_grant. */
async function postToken(
  fetchFn: typeof fetch,
  body: URLSearchParams
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetchFn(TOKEN_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error(YOUTUBE_UNREACHABLE_MESSAGE)
  }
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`
    )
  }
  return payload
}

/**
 * One read from a YouTube API with the channel's access token. A refusal is
 * thrown as "YouTube said: <reason>" so the screen has a sentence; a 401 is
 * the sign-in having lapsed.
 */
export async function youtubeJson(
  fetchFn: typeof fetch,
  url: string,
  accessToken: string
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetchFn(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error(YOUTUBE_UNREACHABLE_MESSAGE)
  }
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (response.status === 401) throw new Error(YOUTUBE_SIGNED_OUT_MESSAGE)
  if (!response.ok) {
    const error = (payload.error ?? {}) as Record<string, unknown>
    const message =
      typeof error.message === "string" && error.message.trim()
        ? error.message.trim().slice(0, 300)
        : `HTTP ${response.status}`
    throw new Error(`YouTube said: ${message}`)
  }
  return payload
}
