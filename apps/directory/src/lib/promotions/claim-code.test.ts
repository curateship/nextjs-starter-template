import { describe, expect, it } from "vitest"

import {
  claimPageUrl,
  formatClaimCode,
  isClaimCode,
  readScannedCode,
} from "@/lib/promotions/claim-code"

describe("a claim's code", () => {
  it("is eight characters in two groups", () => {
    expect(formatClaimCode("K7QXP2MD")).toBe("K7QX-P2MD")
    expect(isClaimCode("K7QX-P2MD")).toBe(true)
  })

  it("never holds a character that is easy to misread", () => {
    for (const code of ["K7QX-P2M0", "K7QX-P2MO", "K7QX-P2M1", "K7IX-P2MD"]) {
      expect(isClaimCode(code)).toBe(false)
    }
  })

  it("is not a code without its dash, so a stored code has one shape", () => {
    expect(isClaimCode("K7QXP2MD")).toBe(false)
  })
})

describe("reading what the counter was handed", () => {
  it("takes the code as it is printed", () => {
    expect(readScannedCode("K7QX-P2MD")).toBe("K7QX-P2MD")
  })

  it("takes it typed in lower case, without the dash, or with spaces", () => {
    expect(readScannedCode("k7qx-p2md")).toBe("K7QX-P2MD")
    expect(readScannedCode("K7QXP2MD")).toBe("K7QX-P2MD")
    expect(readScannedCode("  K7QX P2MD ")).toBe("K7QX-P2MD")
  })

  it("takes the address a phone camera hands over", () => {
    expect(
      readScannedCode("https://alpha.example.com/deals/code/K7QX-P2MD")
    ).toBe("K7QX-P2MD")
  })

  it("reads the code out of an address carrying other letters and digits", () => {
    expect(
      readScannedCode("http://localhost:3015/deals/code/K7QX-P2MD?from=qr")
    ).toBe("K7QX-P2MD")
  })

  it("never stitches a code out of an address that has none", () => {
    for (const handed of [
      "https://alpha.example.com/deals/free-dessert-all-week",
      "https://alpha.example.com/deals/code/",
      "K7QX-P2M",
      "K7QX-P2MDX",
      "",
      null,
      42,
    ]) {
      expect(readScannedCode(handed)).toBe("")
    }
  })
})

describe("the page the QR holds", () => {
  it("is the code alone, so renaming the deal never breaks it", () => {
    expect(claimPageUrl("https://alpha.example.com", "K7QX-P2MD")).toBe(
      "https://alpha.example.com/deals/code/K7QX-P2MD"
    )
  })

  it("never doubles the slash when the site's address ends in one", () => {
    expect(claimPageUrl("https://alpha.example.com/", "K7QX-P2MD")).toBe(
      "https://alpha.example.com/deals/code/K7QX-P2MD"
    )
  })
})
