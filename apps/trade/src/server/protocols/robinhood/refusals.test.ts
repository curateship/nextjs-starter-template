import { describe, expect, it } from "vitest"
import {
  EstimateGasExecutionError,
  RpcRequestError,
  type TransactionReceipt,
} from "viem"
import { robinhoodReceipts } from "./receipts"
import { robinhoodRefusals } from "./refusals"

// Made-up revert data in the shape Stock.sol raises: Blocked(address) with a
// made-up address, and IsPaused() with nothing after it.
const BLOCKED = `0x75e91ce7${"0".repeat(24)}${"1".repeat(40)}`
const PAUSED = "0x1309a563"
const HASH = `0x${"a".repeat(64)}` as const

/** A node's estimate refusal as viem hands it over, revert data inside. */
function nodeRevert(data: string) {
  return new EstimateGasExecutionError(
    new RpcRequestError({
      body: {},
      url: "https://node.example",
      error: { code: 3, message: "execution reverted", data },
    }),
    {}
  )
}
function said(error: Error) {
  return error.message.replace(/^[A-Z_]+:/, "")
}

describe("Robinhood Chain's refusals", () => {
  it("says a Stock Token's compliance check refused, names it and points at the note", () => {
    const error = robinhoodRefusals.explain(nodeRevert(BLOCKED), { coin: "NVDA" })
    expect(error.message).toMatch(/^LIVE_ORDER_REFUSED:/)
    expect(said(error)).toContain(
      "NVDA's own contract refused the transfer: its compliance check blocked an address in it."
    )
    expect(said(error)).toContain("the note under the buy button")
    expect(said(error)).toContain("No swap coins moved.")
  })

  it("says a paused Stock Token cannot move", () => {
    expect(said(robinhoodRefusals.explain(nodeRevert(PAUSED), { coin: "TSLA" }))).toContain(
      "TSLA's own contract is paused, so it cannot move right now."
    )
  })

  it("reads any refusal that names the compliance check as one", () => {
    expect(
      robinhoodRefusals.classify(new Error("execution reverted: compliance check failed"))
    ).toBe("coin-blocked")
  })

  it("names the coin, the fee paid and the hash when a mined swap was refused", () => {
    const note = robinhoodReceipts.failure(
      HASH,
      "swap",
      { gasUsed: 100_000n, effectiveGasPrice: 42_000_000n } as TransactionReceipt,
      { reason: nodeRevert(BLOCKED), coin: "NVDA" }
    )
    expect(note).toContain("NVDA's own contract refused the transfer")
    expect(note).toContain("0.0000042 ETH")
    expect(note).toContain(HASH)
  })

  it("never repeats a node's own words, which can carry anything", () => {
    const error = robinhoodRefusals.explain(
      new Error("upstream said: api_key=sk_live_FAKE_SECRET_123 at 10.0.0.4")
    )
    expect(error.message).not.toMatch(/FAKE_SECRET|10\.0\.0\.4|api_key/)
    expect(said(error)).toContain("Robinhood Chain refused the trade")
  })
})

it("reads an error code only from revert data, never from an address in the words", () => {
  // An address that happens to start with the Blocked code, quoted in the
  // node's words about the request.
  const quoted = new Error(`execution reverted. Request: to 0x75e91ce7${"2".repeat(32)}`)
  expect(robinhoodRefusals.classify(quoted)).toBe("unknown")
})
