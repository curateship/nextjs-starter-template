import { createHash, randomBytes } from "node:crypto"

import {
  getCookie,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server"
import { and, eq } from "drizzle-orm"

import { isPendingDeletion } from "@/lib/account-deletion"
import { readReferralCode } from "@/lib/billing/referrals"
import { safeRedirectPath } from "@/lib/nav/redirect-path"
import { appUrlFor } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellOauthAccounts,
  customShellUsers,
  type CustomShellUser,
} from "@/server/schema"
import { startSessionWithAlert } from "@/server/auth/security-alerts"
import { emitMemberEvent } from "@/server/automations/member-events"
import {
  markReferralJoined,
  recordReferralRegistration,
  validateReferralRegistration,
} from "@/server/billing/referrals"
import {
  findUserByEmail,
  now,
  uuid,
  type SessionOrigin,
} from "@/server/auth/security"

/**
 * "Continue with Google" — the second way into an account, beside the password
 * and the emailed sign-in link.
 *
 * Both halves of the key pair have to be set for it to run at all. With either
 * missing, which is how local development is left, the button never appears and
 * the two endpoints below refuse. Nothing else about signing in changes.
 *
 * What Google proves is that the person controls a Google account and, when it
 * says so, that the email address on it is confirmed. That confirmation is the
 * whole basis for letting them into an account that already exists here, so an
 * unconfirmed address is refused rather than trusted.
 */
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

/** Google answers well inside a second; this is the give-up point. */
const TIMEOUT_MS = 10_000

const GOOGLE_PROVIDER = "google"

/** Registered in the Google console as the app's authorised redirect URI. */
const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback"

/**
 * Every exit from the two Google endpoints is a redirect. The location stays
 * relative so the browser keeps the host it is already on — sending it to the
 * configured app URL instead would move it between "localhost" and "127.0.0.1"
 * in development and leave the session cookie behind.
 */
export function browserRedirect(path: string) {
  return new Response(null, { status: 302, headers: { location: path } })
}

function googleCredentials() {
  const clientId = process.env.CUSTOM_SHELL_GOOGLE_CLIENT_ID
  const clientSecret = process.env.CUSTOM_SHELL_GOOGLE_CLIENT_SECRET
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/**
 * Whether the login and register pages should offer the button. False unless
 * both keys are set, so nobody is shown a button this server cannot finish.
 */
export function googleSignInEnabled() {
  return googleCredentials() != null
}

/** What the browser is sent to Google with, and what it must bring back. */
export type GoogleHandshake = {
  authorizeUrl: string
  /** Echoed back by Google and checked against the cookie: the CSRF guard. */
  state: string
  /** The PKCE secret. Kept in the cookie and spent at the token exchange. */
  verifier: string
}

function urlSafe(bytes: Buffer) {
  return bytes.toString("base64url")
}

/**
 * Builds the URL that sends somebody to Google, plus the two secrets the
 * callback needs back.
 *
 * `state` is a random value the callback compares against the cookie, so a link
 * somebody else crafted cannot complete a sign-in in this browser. The verifier
 * (PKCE) is a second random value: Google will only exchange the code for
 * tokens if the same browser presents it, so a code stolen in transit is
 * useless on its own.
 */
export function startGoogleSignIn(): GoogleHandshake {
  const credentials = googleCredentials()
  if (!credentials) {
    throw new Error("GOOGLE_NOT_CONFIGURED")
  }

  const state = urlSafe(randomBytes(32))
  const verifier = urlSafe(randomBytes(32))
  const challenge = urlSafe(createHash("sha256").update(verifier).digest())

  const authorizeUrl = new URL(AUTHORIZE_URL)
  authorizeUrl.search = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: appUrlFor(GOOGLE_CALLBACK_PATH),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // Always show the account chooser. Somebody signed in to two Google
    // accounts would otherwise be silently taken through on whichever one the
    // browser happens to be holding. Nothing here asks for offline access: this
    // finds out who they are once and never acts on their behalf afterwards.
    prompt: "select_account",
  }).toString()

  return { authorizeUrl: authorizeUrl.toString(), state, verifier }
}

/**
 * Where the two secrets wait while the browser is away at Google, along with
 * the page it was heading for.
 *
 * A cookie rather than a database row because it belongs to one browser and one
 * attempt: it is httpOnly, so no script can read it, and the state inside it is
 * what the callback compares Google's answer against. Ten minutes is long
 * enough to pick an account and short enough that an abandoned attempt clears
 * itself.
 */
const HANDSHAKE_COOKIE = "custom_shell_google"
const HANDSHAKE_TTL_SECONDS = 10 * 60

export type GoogleHandshakeState = {
  state: string
  verifier: string
  /** Where to land afterwards, already checked by `safeRedirectPath`. */
  redirect?: string
  /** The invite code carried from a registration page, already validated. */
  referralCode?: string
}

export function rememberGoogleHandshake(
  handshake: GoogleHandshake,
  redirectTo: string | undefined,
  referralCode?: string
) {
  const remembered: GoogleHandshakeState = {
    state: handshake.state,
    verifier: handshake.verifier,
    ...(redirectTo ? { redirect: redirectTo } : {}),
    ...(referralCode ? { referralCode } : {}),
  }

  setCookie(HANDSHAKE_COOKIE, JSON.stringify(remembered), {
    httpOnly: true,
    maxAge: HANDSHAKE_TTL_SECONDS,
    path: "/",
    // Lax, not Strict: Google sends the browser back with a plain link, and a
    // Strict cookie would not be sent on that arrival at all.
    sameSite: "lax",
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  })
}

/**
 * Reads the handshake and clears it in the same breath, so one trip to Google
 * can only ever complete one sign-in.
 */
export function takeGoogleHandshake(): GoogleHandshakeState | null {
  const raw = getCookie(HANDSHAKE_COOKIE)
  clearGoogleHandshake()
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GoogleHandshakeState>
    if (!parsed.state || !parsed.verifier) {
      return null
    }
    // Checked again on the way out: the value has been to the browser and back,
    // and this is the last point before it becomes a redirect.
    const redirect = safeRedirectPath(parsed.redirect)
    const referralCode = readReferralCode(parsed.referralCode)
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      ...(redirect ? { redirect } : {}),
      ...(referralCode ? { referralCode } : {}),
    }
  } catch {
    return null
  }
}

function clearGoogleHandshake() {
  setCookie(HANDSHAKE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  })
}

/** Who Google says this is. */
export type GoogleIdentity = {
  /** Google's permanent id for the account, which the link is keyed on. */
  subject: string
  email: string
  emailVerified: boolean
  name: string | null
}

/**
 * Trades the code Google sent back for the identity behind it.
 *
 * The id token is read without checking its signature, which is safe for one
 * reason only: it did not come from the browser. It arrived in the body of this
 * server's own HTTPS call to Google's token endpoint, authenticated with the
 * client secret — the case the OpenID spec explicitly allows. The audience is
 * still checked, so a token minted for a different app cannot be replayed here
 * if that call is ever changed.
 */
export async function exchangeGoogleCode(
  code: string,
  verifier: string
): Promise<GoogleIdentity> {
  const credentials = googleCredentials()
  if (!credentials) {
    throw new Error("GOOGLE_NOT_CONFIGURED")
  }

  let payload: { id_token?: string }
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: appUrlFor(GOOGLE_CALLBACK_PATH),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    payload = await response.json()
  } catch (error) {
    // The reason names the misconfiguration — a wrong secret reads as
    // "HTTP 401" — and never carries the secret itself.
    console.warn(
      `[custom-shell] google token exchange failed: ${String(error)}`
    )
    throw new Error("GOOGLE_SIGN_IN_FAILED")
  }

  const claims = readIdToken(payload.id_token)
  if (
    !claims ||
    claims.aud !== credentials.clientId ||
    !claims.sub ||
    !claims.email
  ) {
    console.warn(
      "[custom-shell] google returned an id token this app cannot use"
    )
    throw new Error("GOOGLE_SIGN_IN_FAILED")
  }

  return {
    subject: claims.sub,
    email: claims.email.trim().toLowerCase(),
    // Google sends a boolean, and older responses a string. Anything else is
    // read as "not confirmed", which is the safe way to be wrong.
    emailVerified:
      claims.email_verified === true || claims.email_verified === "true",
    name: claims.name?.trim() || null,
  }
}

type GoogleClaims = {
  aud?: string
  sub?: string
  email?: string
  email_verified?: boolean | string
  name?: string
}

/** The middle segment of the JWT: base64url JSON, no signature check. */
function readIdToken(idToken: string | undefined): GoogleClaims | null {
  const body = idToken?.split(".")[1]
  if (!body) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
}

/**
 * Signs somebody in from what Google said, creating their account or attaching
 * Google to the one they already have.
 *
 * The rules, in the order they are applied:
 *
 * 1. An unconfirmed Google address is refused outright. Everything below rests
 *    on the address being proven, and Google says plainly when it is not.
 * 2. A Google account that has been here before goes straight to the account it
 *    was linked to, whatever address it now carries. That link is keyed on
 *    Google's permanent id, so changing the address there does not strand
 *    somebody outside their own account or create a second one.
 * 3. Otherwise the address decides: an account with that email gains the link,
 *    and if there is none, one is created. Since Google confirmed the address
 *    and this app only ever holds confirmed addresses, both are the same person.
 * 4. A suspended account is refused, exactly as the password form refuses it,
 *    and so is one that has been deleted and is inside its restore window.
 *    Bringing an account back is the sign-in form's job, where the person is
 *    asked plainly whether they meant to.
 */
export async function signInWithGoogle(
  identity: GoogleIdentity,
  origin: SessionOrigin,
  database: CustomShellDb = db,
  referralCode?: string
): Promise<{ user: CustomShellUser; sessionToken: string }> {
  if (!identity.emailVerified) {
    throw new Error("PROVIDER_EMAIL_UNVERIFIED")
  }

  const timestamp = now()
  const linked = await findLinkedUser(identity.subject, database)
  const account = linked ?? (await findUserByEmail(identity.email, database))

  if (account?.status === "suspended") {
    throw new Error("ACCOUNT_SUSPENDED")
  }
  if (account && isPendingDeletion(account)) {
    throw new Error("ACCOUNT_PENDING_DELETION")
  }
  // An invite belongs only to a new registration. A person who already has an
  // account still signs in normally, even if they arrived through their own or
  // an expired invite link; the link must neither create a second attribution
  // nor lock them out of the account they already have.
  if (!account && referralCode) {
    await validateReferralRegistration(referralCode, identity.email, database)
  }

  const user = account
    ? await confirmEmail(account, timestamp, database)
    : await createGoogleUser(identity, timestamp, database, referralCode)

  if (!linked) {
    await database
      .insert(customShellOauthAccounts)
      .values({
        id: uuid(),
        userId: user.id,
        provider: GOOGLE_PROVIDER,
        providerAccountId: identity.subject,
        createdAt: timestamp,
      })
      // Two sign-ins from the same Google account at the same moment: the
      // second finds the link already written and carries on with it.
      .onConflictDoNothing()
  }

  return {
    user,
    sessionToken: await startSessionWithAlert(user, origin, database),
  }
}

async function findLinkedUser(subject: string, database: CustomShellDb) {
  const [row] = await database
    .select({ user: customShellUsers })
    .from(customShellOauthAccounts)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellOauthAccounts.userId)
    )
    .where(
      and(
        eq(customShellOauthAccounts.provider, GOOGLE_PROVIDER),
        eq(customShellOauthAccounts.providerAccountId, subject)
      )
    )
    .limit(1)

  return row?.user ?? null
}

/**
 * Signing in through Google proves the address works, so an account that had
 * never confirmed its email is confirmed here rather than being sent back to a
 * sign-in page it cannot get past. Completing a password reset and opening a
 * sign-in link already draw the same conclusion.
 */
async function confirmEmail(
  account: CustomShellUser,
  timestamp: Date,
  database: CustomShellDb
) {
  if (account.emailVerifiedAt) {
    return account
  }

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(customShellUsers)
      .set({ emailVerifiedAt: timestamp, updatedAt: timestamp })
      .where(eq(customShellUsers.id, account.id))
      .returning()
    await markReferralJoined(updated.id, tx, timestamp)
    await emitMemberEvent("verified", updated, tx)
    return updated
  })
}

/**
 * The account a first Google sign-in creates: a member, confirmed, and with no
 * password at all. They can set one later from Account → Security, or carry on
 * signing in with Google and never have one.
 */
async function createGoogleUser(
  identity: GoogleIdentity,
  timestamp: Date,
  database: CustomShellDb,
  referralCode?: string
) {
  return database.transaction(async (tx) => {
    const [created] = await tx
      .insert(customShellUsers)
      .values({
        id: uuid(),
        email: identity.email,
        name: identity.name ?? identity.email.split("@")[0],
        role: "member",
        status: "active",
        passwordHash: null,
        emailVerifiedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      // Two first sign-ins from the same address: the loser reads the row the
      // winner wrote instead of failing on the email's unique index.
      .onConflictDoNothing()
      .returning()

    if (!created) return requireUserByEmail(identity.email, tx)

    await emitMemberEvent("registered", created, tx)
    await emitMemberEvent("verified", created, tx)
    if (referralCode) {
      await recordReferralRegistration(referralCode, created, tx, timestamp)
    }
    return created
  })
}

async function requireUserByEmail(email: string, database: CustomShellDb) {
  const user = await findUserByEmail(email, database)
  if (!user) {
    throw new Error("GOOGLE_SIGN_IN_FAILED")
  }
  return user
}
