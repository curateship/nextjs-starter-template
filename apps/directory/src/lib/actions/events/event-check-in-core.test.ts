import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CHECK_IN_CODE_LENGTH,
  buildTicketQrUrl,
  buildTicketUrl,
  extractCheckInCode,
  formatCheckInCode,
  generateCheckInCode,
  isCheckInCode,
} from "./event-check-in-core"

const CODE = "1A2B3C4D5E6F7890"

describe("minting a ticket code", () => {
  it("is uppercase hex of the documented length", () => {
    const code = generateCheckInCode()
    assert.equal(code.length, CHECK_IN_CODE_LENGTH)
    assert.ok(isCheckInCode(code), `${code} is not a valid ticket code`)
  })

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCheckInCode()))
    assert.equal(codes.size, 200)
  })
})

describe("recognising a ticket code", () => {
  it("accepts a well-formed code", () => {
    assert.ok(isCheckInCode(CODE))
  })

  it("rejects the wrong length, lowercase, non-hex and non-strings", () => {
    assert.equal(isCheckInCode("1A2B3C4D5E6F789"), false)
    assert.equal(isCheckInCode("1a2b3c4d5e6f7890"), false)
    assert.equal(isCheckInCode("1A2B3C4D5E6F789Z"), false)
    assert.equal(isCheckInCode(null), false)
    assert.equal(isCheckInCode(1234567890123456), false)
  })
})

describe("reading a code out of what the door screen was handed", () => {
  it("takes the bare code", () => {
    assert.equal(extractCheckInCode(CODE), CODE)
  })

  it("takes it lowercase, spaced or dashed, the way it is printed and typed", () => {
    assert.equal(extractCheckInCode("1a2b-3c4d-5e6f-7890"), CODE)
    assert.equal(extractCheckInCode("  1A2B 3C4D 5E6F 7890  "), CODE)
  })

  it("takes the ticket URL a phone camera reads off the QR", () => {
    assert.equal(extractCheckInCode(`https://demo.example.com/tickets/${CODE}`), CODE)
    assert.equal(extractCheckInCode(`http://demo.localhost:3011/tickets/${CODE}`), CODE)
  })

  it("ignores digits elsewhere in the URL rather than stitching a code out of them", () => {
    // The port and the query string are full of hex characters; only the
    // /tickets/ segment counts.
    assert.equal(extractCheckInCode(`http://demo.localhost:3011/tickets/${CODE}?from=1234`), CODE)
    assert.equal(extractCheckInCode("http://demo.localhost:3011/events/abcdef1234567890"), "")
  })

  it("returns nothing for junk, the wrong length, or a non-string", () => {
    assert.equal(extractCheckInCode(""), "")
    assert.equal(extractCheckInCode("hello there"), "")
    assert.equal(extractCheckInCode("1A2B3C4D5E6F78901"), "")
    assert.equal(extractCheckInCode(undefined), "")
  })
})

describe("printing a ticket", () => {
  it("groups the code into fours so it can be read aloud", () => {
    assert.equal(formatCheckInCode(CODE), "1A2B-3C4D-5E6F-7890")
  })

  it("builds the ticket and QR URLs off the site's own address", () => {
    assert.equal(buildTicketUrl("https://demo.example.com", CODE), `https://demo.example.com/tickets/${CODE}`)
    assert.equal(buildTicketQrUrl("https://demo.example.com", CODE), `https://demo.example.com/api/tickets/${CODE}/qr`)
  })

  it("round-trips: a printed code reads back as the same code", () => {
    const code = generateCheckInCode()
    assert.equal(extractCheckInCode(formatCheckInCode(code)), code)
  })
})
