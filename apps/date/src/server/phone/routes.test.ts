import { readdir } from "node:fs/promises"

import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"

vi.mock("@/server/media/storage", () => ({
  R2StorageNotConfiguredError: class extends Error {},
  uploadToR2: vi.fn(async () => {}),
  getFromR2: vi.fn(async () => ({ Body: undefined })),
  deleteFromR2: vi.fn(async () => {}),
}))

import { insertAccount } from "@/server/tinder/fixtures/accounts"

import { createPairingCode, pairPhone } from "./link"
import { replySignature, requestSignature } from "./signing"

/**
 * The phone's addresses live in `src/routes/api/phone/`, which the shell's
 * guard test never walks, so the signature is the only lock on them. This
 * calls every signed one the way the phone does, with a wrong signature and
 * then a right one.
 */

const SIGNED = ["check-in", "next", "result", "screen"] as const

type Handler = (context: { request: Request }) => Promise<Response>

async function handlerFor(name: string): Promise<Handler> {
  const module = (await import(`@/routes/api/phone/${name}.ts`)) as {
    Route: { options: { server: { handlers: { POST: Handler } } } }
  }
  return module.Route.options.server.handlers.POST
}

describe("every signed phone address", () => {
  let client: PGlite
  let db: TestDatabase
  let phone: { id: string; key: string }

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    const userId = (await insertUser(db, { role: "admin" })).id
    const workspaceId = (await insertWorkspace(db)).id
    const { code } = await createPairingCode(await insertAccount(db, { userId, workspaceId }), db)
    const paired = await pairPhone({ code, model: "Pixel 8a", android: "15", appVersion: "1.0.0" }, db)
    phone = { id: paired.phoneId, key: paired.key }
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  it("is the whole list of route files beside the pairing one", async () => {
    const files = (await readdir(new URL("../../routes/api/phone/", import.meta.url))).sort()
    expect(files).toEqual([...SIGNED.map((name) => `${name}.ts`), "pair.ts"].sort())
  })

  function request(name: string, body: string, key: string, nonce: string): Request {
    const path = `/api/phone/${name}`
    const stamp = Math.floor(Date.now() / 1000)
    return new Request(`http://localhost:3023${path}`, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-phone-id": phone.id,
        "x-phone-time": String(stamp),
        "x-phone-nonce": nonce,
        "x-phone-signature": requestSignature(key, "POST", path, stamp, nonce, body),
      },
    })
  }

  const bodies: Record<(typeof SIGNED)[number], string> = {
    "check-in": JSON.stringify({ appVersion: "1.0.0", batteryPercent: 50 }),
    next: JSON.stringify({ waitSeconds: 0 }),
    result: JSON.stringify({ id: "no-such-action", ok: true }),
    screen: JSON.stringify({ frame: null }),
  }

  for (const name of SIGNED) {
    it(`/api/phone/${name} refuses a wrong signature and answers a right one, signed`, async () => {
      const handle = await handlerFor(name)

      const refused = await handle({ request: request(name, bodies[name], "the wrong key", "1".repeat(32)) })
      expect(refused.status).toBe(401)
      expect(refused.headers.get("x-date-signature")).toBeNull()

      const nonce = "2".repeat(32)
      const answered = await handle({ request: request(name, bodies[name], phone.key, nonce) })
      expect(answered.status).toBe(200)
      const text = await answered.text()
      const stamp = Number(answered.headers.get("x-date-time"))
      expect(answered.headers.get("x-date-signature")).toBe(replySignature(phone.key, 200, nonce, stamp, text))
    })
  }
})
