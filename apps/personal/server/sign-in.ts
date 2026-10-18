import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { TLSSocket } from "node:tls"

import { plural } from "../src/lib/plural"
import { readBody, send } from "./http"

/**
 * Personal's one-password sign-in. There are no accounts: the password is the
 * PERSONAL_PASSWORD setting, and a right guess gets a cookie that lasts 30
 * days. The cookie holds only its own expiry, signed with a key made from the
 * password, so it can't be forged or stretched, and changing the password
 * signs every browser out.
 */

const COOKIE = "personal_session"
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const MAX_WRONG = 10
const LOCK_MS = 15 * 60 * 1000
const MAX_BODY_BYTES = 4 * 1024

export const NO_PASSWORD =
  "No password is set yet. Add PERSONAL_PASSWORD to apps/personal/.env.local."

type Options = {
  password: string | undefined
  /** Sign-in and sign-out only come from Personal's own page. */
  allowedOrigins: string[]
  now?: () => number
  /** How long a wrong password waits before it is answered. */
  wrongPasswordDelayMs?: number
}

function sha256(text: string) {
  return createHash("sha256").update(text).digest()
}

/** Compares in the same time whatever the two hold, so timing gives nothing away. */
function sameText(a: string, b: string) {
  return timingSafeEqual(sha256(a), sha256(b))
}

function signature(key: Buffer, expires: number) {
  return createHmac("sha256", key).update(`personal-session:${expires}`).digest("base64url")
}

function cookieOf(request: IncomingMessage) {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=")
    if (name === COOKIE) return value.join("=")
  }
  return ""
}

function setCookie(request: IncomingMessage, response: ServerResponse, value: string, maxAgeMs: number) {
  const https =
    request.headers["x-forwarded-proto"] === "https" || (request.socket as TLSSocket).encrypted === true
  response.setHeader(
    "Set-Cookie",
    [
      `${COOKIE}=${value}`,
      "Path=/",
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
      "HttpOnly",
      "SameSite=Strict",
      ...(https ? ["Secure"] : []),
    ].join("; ")
  )
}

function lockedMessage(leftMs: number) {
  const minutes = Math.ceil(leftMs / 60_000)
  return `Too many wrong passwords. Try again in ${minutes} ${plural(minutes, "minute")}.`
}

/**
 * Answers `/api/session`, `/api/sign-in` and `/api/sign-out`, and refuses
 * every other `/api/` request without a signed-in cookie. It sits in front of
 * every other API, so a new one is guarded without asking.
 */
export function signInGate({
  password,
  allowedOrigins,
  now = Date.now,
  wrongPasswordDelayMs = 1000,
}: Options) {
  // Made once per password. scrypt is slow on purpose, so a copied cookie
  // can't be used to try passwords quickly.
  const key = password ? scryptSync(password, "personal-session", 32) : null
  let wrong: number[] = []
  let lockedUntil = 0

  const signedIn = (request: IncomingMessage) => {
    if (!key) return false
    const [expiresText, given] = cookieOf(request).split(".")
    const expires = Number(expiresText)
    if (!given || !Number.isSafeInteger(expires) || expires <= now()) return false
    return sameText(given, signature(key, expires))
  }

  const signIn = async (request: IncomingMessage, response: ServerResponse) => {
    if (!key || !password) return send(response, 503, { error: NO_PASSWORD })
    if (lockedUntil > now()) return send(response, 429, { error: lockedMessage(lockedUntil - now()) })
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      return send(response, 415, { error: "Send the password as JSON." })
    }
    let given: unknown
    try {
      given = (JSON.parse(await readBody(request, MAX_BODY_BYTES)) as { password?: unknown }).password
    } catch {
      return send(response, 400, { error: "Send the password." })
    }
    if (typeof given !== "string") return send(response, 400, { error: "Send the password." })

    if (sameText(given, password)) {
      wrong = []
      const expires = now() + SESSION_MS
      setCookie(request, response, `${expires}.${signature(key, expires)}`, SESSION_MS)
      return send(response, 200, { signedIn: true })
    }

    const time = now()
    wrong = [...wrong.filter((at) => time - at < LOCK_MS), time]
    if (wrong.length >= MAX_WRONG) {
      lockedUntil = time + LOCK_MS
      wrong = []
    }
    await new Promise((resolve) => setTimeout(resolve, wrongPasswordDelayMs))
    if (lockedUntil > now()) return send(response, 429, { error: lockedMessage(lockedUntil - now()) })
    return send(response, 401, { error: "That password is wrong." })
  }

  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const route = request.url?.split("?")[0] ?? ""
    if (!route.startsWith("/api/")) return next()
    try {
      if (route === "/api/session") {
        if (request.method !== "GET") return send(response, 405, { error: "Only GET." })
        return send(response, 200, { signedIn: signedIn(request), passwordSet: key !== null })
      }
      if (route === "/api/sign-in" || route === "/api/sign-out") {
        if (request.method !== "POST") return send(response, 405, { error: "Only POST." })
        if (!allowedOrigins.includes(request.headers.origin ?? "")) {
          return send(response, 403, { error: "Signing in only works from Personal's own page." })
        }
        if (route === "/api/sign-in") return await signIn(request, response)
        setCookie(request, response, "", 0)
        return send(response, 200, { signedIn: false })
      }
      if (!signedIn(request)) return send(response, 401, { error: "Sign in first." })
      return next()
    } catch (error) {
      console.error("[personal] sign-in:", error)
      return send(response, 500, { error: "The sign-in check failed." })
    }
  }
}
