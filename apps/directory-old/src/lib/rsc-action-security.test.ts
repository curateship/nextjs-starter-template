import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isSameOriginRequest,
  readLimitedRequestBody,
} from "./rsc-action-security"
import {
  directoryInternalOrigin,
  directoryLocalOrigin,
} from "../test-utils/local-app"

describe("RSC action origin validation", () => {
  it("accepts a request from the same origin", () => {
    const request = new Request(`${directoryLocalOrigin}/rsc-action`, {
      headers: { origin: directoryLocalOrigin },
    })

    assert.equal(isSameOriginRequest(request), true)
  })

  it("accepts the public origin supplied by the trusted proxy", () => {
    const request = new Request(`${directoryInternalOrigin}/rsc-action`, {
      headers: {
        origin: "https://directory.example.com",
        "x-forwarded-host": "directory.example.com",
        "x-forwarded-proto": "https",
      },
    })

    assert.equal(isSameOriginRequest(request), true)
  })

  it("rejects missing, malformed, and foreign origins", () => {
    assert.equal(
      isSameOriginRequest(new Request(`${directoryLocalOrigin}/rsc-action`)),
      false
    )
    assert.equal(
      isSameOriginRequest(
        new Request(`${directoryLocalOrigin}/rsc-action`, {
          headers: { origin: "not-a-url" },
        })
      ),
      false
    )
    assert.equal(
      isSameOriginRequest(
        new Request(`${directoryLocalOrigin}/rsc-action`, {
          headers: { origin: "https://attacker.example" },
        })
      ),
      false
    )
  })

  it("rejects streamed bodies that exceed the action limit", async () => {
    const request = new Request(`${directoryLocalOrigin}/rsc-action`, {
      body: "1234",
      method: "POST",
    })

    assert.equal(await readLimitedRequestBody(request, 3), null)
  })

  it("returns bodies within the action limit", async () => {
    const request = new Request(`${directoryLocalOrigin}/rsc-action`, {
      body: "1234",
      method: "POST",
    })

    const body = await readLimitedRequestBody(request, 4)
    assert.equal(new TextDecoder().decode(body ?? undefined), "1234")
  })
})
