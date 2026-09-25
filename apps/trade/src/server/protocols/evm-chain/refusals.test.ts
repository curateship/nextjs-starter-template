import { describe, expect, it } from "vitest"
import { evmRefusals, evmRefused } from "./refusals"

const hash = `0x${"a".repeat(64)}`
const words = {
  chain: "Test Chain",
  feeCoin: "TST",
  feeReserve: 0.25,
  explorer: "explorer.example",
  historyHelp: "Point TEST_LOGS_RPC at another node.",
  unsupportedNetwork: "TEST_NETWORK_UNSUPPORTED",
}
const refusals = evmRefusals(words)

describe("the shared chain refusals", () => {
  it("names the chain, its fee coin, its reserve and its explorer", () => {
    expect(refusals.sentence("gas")).toBe(
      "The wallet does not have enough TST for network fees. Send TST to the wallet address on the card and keep at least 0.25 TST available. Wrapped TST cannot pay fees. No swap coins moved. No new transaction fee was paid."
    )
    expect(refusals.sentence("node-busy")).toContain(
      "Test Chain's node is limiting requests."
    )
    expect(refusals.sentence("unknown")).toContain(
      "Test Chain refused the trade, and no coins moved."
    )
    const paid = refusals.sentence("slippage", {
      hash,
      feeWei: 21000000000000n,
    })
    expect(paid).toContain("0.000021 TST was spent on network fees.")
    expect(paid).toContain(`Check transaction ${hash} on explorer.example.`)
  })
  it("gives the chain's own advice when its node will not serve history", () => {
    expect(refusals.error("history").message).toBe(
      "EXCHANGE_BUSY:This Test Chain node will not answer a trade history request, so new swaps cannot reach the Journal. Point TEST_LOGS_RPC at another node."
    )
  })
  it("lets the chain's own network code through and scrubs everything else", () => {
    expect(
      refusals.explain(new Error("TEST_NETWORK_UNSUPPORTED")).message
    ).toBe("TEST_NETWORK_UNSUPPORTED")
    expect(
      refusals.explain(new Error("OTHER_NETWORK_UNSUPPORTED")).message
    ).toContain("Test Chain refused the trade")
  })
  it("carries a refusal made by another chain's words unchanged", () => {
    const other = evmRefusals({ ...words, chain: "Other Chain" })
    const refused = other.error("no-route")
    expect(refusals.explain(refused)).toBe(refused)
    expect(refusals.explain(evmRefused("Plain words."))).toMatchObject({
      message: "LIVE_ORDER_REFUSED:Plain words.",
    })
  })
})
