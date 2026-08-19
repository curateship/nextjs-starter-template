import { describe, expect, it } from "vitest"

import { KNOWN_PROTOCOLS } from "@/lib/protocols/contracts"
import { getProtocol, listProtocols } from "@/server/protocols/registry"

/**
 * The registry's one promise: every id the app knows resolves to a complete
 * entry. A key in `ProtocolId` with no entry here would make `getProtocol`
 * answer undefined somewhere deep in a settle — this pins the failure to a
 * test with the exchange's name in it instead.
 */
describe("the protocol registry", () => {
  it("answers for every protocol the app knows", () => {
    for (const id of KNOWN_PROTOCOLS) {
      const entry = getProtocol(id)
      expect(entry.id).toBe(id)
      expect(entry.networks.length).toBeGreaterThan(0)
      expect(entry.networks).toContain(entry.defaultNetwork)
    }
    expect(listProtocols().map((one) => one.id).sort()).toEqual(
      [...KNOWN_PROTOCOLS].sort()
    )
  })

  it("carries the trading blocks exactly where the flags say they are", () => {
    for (const id of KNOWN_PROTOCOLS) {
      const entry = getProtocol(id)
      expect(Boolean(entry.account)).toBe(entry.capabilities.accounts)
      expect(Boolean(entry.orders)).toBe(entry.capabilities.orders)
      // The sign-in form travels with accounts: an exchange someone can hold
      // a wallet on must say how that wallet signs in, and one they cannot
      // must not offer a form for it.
      expect(Boolean(entry.credentials)).toBe(entry.capabilities.accounts)
    }
  })
})
