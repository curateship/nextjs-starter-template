import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import { readCardRequest, recordCardResponse } from "@/server/video/project-record-card"

const KEY = "shared-key-for-tests"
const AT = new Date(1_000_000 * 1000)
const RECORD = "3f2a9c1e-0000-4000-8000-000000000001"
const stamp = (text: string, key = KEY) => createHmac("sha256", key).update(text).digest("base64url")

function ask(params: Record<string, string>) {
  const url = new URL("https://app.example.test/api/connect/project/record-card")
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  return url
}

const good = { record: RECORD, exp: "1000060", sig: stamp(`record-card.v1.${RECORD}.1000060`) }

describe("Project's card request", () => {
  it("names the project when Project's stamp and time hold", () => {
    expect(readCardRequest(ask(good), KEY, AT)).toBe(RECORD)
  })

  it("refuses a changed record, a wrong key, an old or far-off time, and a sign-in note's stamp", () => {
    expect(readCardRequest(ask({ ...good, record: "another-project" }), KEY, AT)).toBeNull()
    expect(readCardRequest(ask(good), "other-key", AT)).toBeNull()
    expect(readCardRequest(ask({ ...good, exp: "999999", sig: stamp(`record-card.v1.${RECORD}.999999`) }), KEY, AT)).toBeNull()
    expect(readCardRequest(ask({ ...good, exp: "1000500", sig: stamp(`record-card.v1.${RECORD}.1000500`) }), KEY, AT)).toBeNull()
    // A stamp over anything else, such as a sign-in note's text, never passes.
    expect(readCardRequest(ask({ ...good, sig: stamp(`${RECORD}.1000060`) }), KEY, AT)).toBeNull()
    expect(readCardRequest(ask({ record: RECORD, exp: "1000060" }), KEY, AT)).toBeNull()
  })

  it("answers a refused request with nothing about the project", async () => {
    const response = await recordCardResponse(new Request(ask({ ...good, sig: "nope" })), {
      env: { PROJECT_HANDOFF_KEY: KEY } as NodeJS.ProcessEnv,
      at: AT,
    })
    expect(response.status).toBe(401)
    expect(await response.json()).not.toHaveProperty("name")
    const off = await recordCardResponse(new Request(ask(good)), { env: {} as NodeJS.ProcessEnv, at: AT })
    expect(off.status).toBe(401)
  })
})
