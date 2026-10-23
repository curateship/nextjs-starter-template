import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { NextResponse, toNextRequest } from "./web-response"

describe("NextResponse compatibility", () => {
  it("keeps JSON responses identifiable as NextResponse instances", async () => {
    const response = NextResponse.json({ ok: true }, { status: 202 })

    assert.equal(response instanceof NextResponse, true)
    assert.equal(response.status, 202)
    assert.equal(response.headers.get("content-type"), "application/json")
    assert.deepEqual(await response.json(), { ok: true })
  })

  it("creates redirects with Next-compatible defaults", () => {
    const response = NextResponse.redirect("https://example.com/login")

    assert.equal(response instanceof NextResponse, true)
    assert.equal(response.status, 307)
    assert.equal(response.headers.get("location"), "https://example.com/login")
  })

  it("adds nextUrl without replacing the request", () => {
    const request = new Request("https://example.com/products?page=2")
    const adapted = toNextRequest(request)

    assert.equal(adapted, request)
    assert.equal(adapted.nextUrl.pathname, "/products")
    assert.equal(adapted.nextUrl.searchParams.get("page"), "2")
  })
})
