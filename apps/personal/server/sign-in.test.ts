import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"

import { NO_PASSWORD, signInGate } from "./sign-in"

const origin = "http://localhost:3021"
const DAY = 24 * 60 * 60 * 1000
let servers: Server[] = []
let clock = 1_800_000_000_000

/** A server with the gate in front of a stand-in for `/api/menu`. */
async function start(password: string | undefined) {
  const gate = signInGate({
    password,
    allowedOrigins: [origin],
    now: () => clock,
    wrongPasswordDelayMs: 0,
  })
  const server = createServer((request, response) => {
    void gate(request, response, () => {
      response.statusCode = 200
      response.end("menu")
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
  servers = []
  clock = 1_800_000_000_000
})

function signIn(base: string, password: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/sign-in`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify({ password }),
  })
}

/** The cookie's name=value, as a browser would send it back. */
function cookieFrom(response: Response) {
  return (response.headers.get("set-cookie") ?? "").split(";")[0]
}

function menu(base: string, cookie = "") {
  return fetch(`${base}/api/menu`, { headers: { cookie } })
}

async function session(base: string, cookie = "") {
  return (await (await fetch(`${base}/api/session`, { headers: { cookie } })).json()) as {
    signedIn: boolean
    passwordSet: boolean
  }
}

describe("signInGate", () => {
  it("refuses the menu without a sign-in", async () => {
    const base = await start("open sesame")
    const response = await menu(base)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Sign in first." })
    expect(await session(base)).toEqual({ signedIn: false, passwordSet: true })
  })

  it("lets the menu through for 30 days after the right password", async () => {
    const base = await start("open sesame")
    const response = await signIn(base, "open sesame")
    expect(response.status).toBe(200)
    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("SameSite=Strict")
    expect(setCookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`)
    expect(setCookie).not.toContain("Secure")

    const cookie = cookieFrom(response)
    expect((await menu(base, cookie)).status).toBe(200)
    expect(await session(base, cookie)).toEqual({ signedIn: true, passwordSet: true })

    clock += 30 * DAY - 1
    expect((await menu(base, cookie)).status).toBe(200)
    clock += 1
    expect((await menu(base, cookie)).status).toBe(401)
  })

  it("marks the cookie Secure behind https", async () => {
    const base = await start("open sesame")
    const response = await signIn(base, "open sesame", { "x-forwarded-proto": "https" })
    expect(response.headers.get("set-cookie")).toContain("Secure")
  })

  it("says a wrong password is wrong and sets no cookie", async () => {
    const base = await start("open sesame")
    const response = await signIn(base, "open sesam")
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "That password is wrong." })
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("signs nothing in when no password is set", async () => {
    for (const password of [undefined, ""]) {
      const base = await start(password)
      expect(await session(base)).toEqual({ signedIn: false, passwordSet: false })
      const response = await signIn(base, "")
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: NO_PASSWORD })
      expect((await menu(base)).status).toBe(401)
    }
  })

  it("refuses a forged or stretched cookie", async () => {
    const base = await start("open sesame")
    const cookie = cookieFrom(await signIn(base, "open sesame"))
    const [, value] = cookie.split("=")
    const [expires, signature] = value.split(".")
    const stretched = `personal_session=${Number(expires) + 365 * DAY}.${signature}`
    expect((await menu(base, stretched)).status).toBe(401)
    expect((await menu(base, `personal_session=${expires}.forged`)).status).toBe(401)
    expect((await menu(base, `personal_session=${expires}`)).status).toBe(401)
    expect((await menu(base, "personal_session=junk")).status).toBe(401)
  })

  it("signs every browser out when the password changes", async () => {
    const cookie = cookieFrom(await signIn(await start("open sesame"), "open sesame"))
    const changed = await start("new password")
    expect((await menu(changed, cookie)).status).toBe(401)
  })

  it("locks sign-in for 15 minutes after 10 wrong passwords", async () => {
    const base = await start("open sesame")
    for (let i = 0; i < 9; i++) expect((await signIn(base, "guess")).status).toBe(401)
    const tenth = await signIn(base, "guess")
    expect(tenth.status).toBe(429)
    expect(await tenth.json()).toEqual({
      error: "Too many wrong passwords. Try again in 15 minutes.",
    })

    // Even the right password waits out the lock.
    clock += 14 * 60 * 1000 + 1
    const locked = await signIn(base, "open sesame")
    expect(locked.status).toBe(429)
    expect(await locked.json()).toEqual({
      error: "Too many wrong passwords. Try again in 1 minute.",
    })

    clock += 60 * 1000
    expect((await signIn(base, "open sesame")).status).toBe(200)
  })

  it("forgets wrong passwords older than 15 minutes", async () => {
    const base = await start("open sesame")
    for (let i = 0; i < 9; i++) await signIn(base, "guess")
    clock += 15 * 60 * 1000
    expect((await signIn(base, "guess")).status).toBe(401)
  })

  it("only signs in or out from Personal's own page", async () => {
    const base = await start("open sesame")
    const response = await signIn(base, "open sesame", { origin: "http://evil.test" })
    expect(response.status).toBe(403)
    expect(response.headers.get("set-cookie")).toBeNull()
    const signOut = await fetch(`${base}/api/sign-out`, {
      method: "POST",
      headers: { origin: "http://evil.test" },
    })
    expect(signOut.status).toBe(403)
  })

  it("refuses a password that isn't text", async () => {
    const base = await start("open sesame")
    expect((await signIn(base, 1234)).status).toBe(400)
    const notJson = await fetch(`${base}/api/sign-in`, {
      method: "POST",
      headers: { origin, "content-type": "text/plain" },
      body: "open sesame",
    })
    expect(notJson.status).toBe(415)
  })

  it("signs out by clearing the cookie", async () => {
    const base = await start("open sesame")
    const response = await fetch(`${base}/api/sign-out`, { method: "POST", headers: { origin } })
    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toMatch(/^personal_session=; .*Max-Age=0/)
  })

  it("leaves addresses outside /api/ to the page", async () => {
    const base = await start("open sesame")
    expect((await fetch(`${base}/localhost:3015/admin`)).status).toBe(200)
  })
})
