import { describe, expect, it } from "vitest"

import { readCappedText } from "./capped-body"

/** A body sent in pieces with no stated size, the way a sender hides how much is coming. */
function streamed(pieces: string[]): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(new TextEncoder().encode(piece))
      controller.close()
    },
  })
  return new Request("http://promo.test/api/rack/next", { method: "POST", body, duplex: "half" } as RequestInit)
}

describe("reading a body with a limit", () => {
  it("answers the words when they fit", async () => {
    expect(await readCappedText(new Request("http://promo.test/", { method: "POST", body: "{\"a\":1}" }), 100)).toBe("{\"a\":1}")
    expect(await readCappedText(new Request("http://promo.test/", { method: "POST" }), 100)).toBe("")
  })

  it("refuses a body whose stated size is over the limit, before reading it", async () => {
    const request = new Request("http://promo.test/", { method: "POST", body: "x".repeat(50), headers: { "content-length": "5000" } })
    expect(await readCappedText(request, 100)).toBeNull()
  })

  it("stops reading a body with no stated size once it passes the limit", async () => {
    expect(await readCappedText(streamed(["x".repeat(60), "x".repeat(60), "x".repeat(60)]), 100)).toBeNull()
    expect(await readCappedText(streamed(["x".repeat(60), "y".repeat(40)]), 100)).toBe("x".repeat(60) + "y".repeat(40))
  })

  it("counts bytes, so letters that take two bytes count twice", async () => {
    expect(await readCappedText(streamed(["é".repeat(60)]), 100)).toBeNull()
  })
})
