import { describe, it, expect } from "vitest"
import { formatTransactionReceipt } from "viem"
import type { Address, RpcTransactionReceipt } from "viem"
import fixture from "./swap.fixture.json"
import { bnbReceiptFill, bnbReceiptFailure } from "./receipts"
const receipt = formatTransactionReceipt(
  fixture.receipt as RpcTransactionReceipt
)
const wallet = fixture.receipt.from as Address
const coin = "0xa2120b9e674d3fc3875f415a7df52e382f141225"
const at = Number(BigInt(fixture.block.timestamp)) * 1000
it("reads a real successful swap from net Transfer logs rather than quoted amounts", () => {
  const fill = bnbReceiptFill(receipt, wallet, at, new Map([[coin, 18]]), 750)!
  expect(fill.side).toBe("buy")
  expect(fill.sz).toBeCloseTo(10999.84805120629, 8)
  expect(fill.px * fill.sz).toBeCloseTo(7.227355150720868, 12)
  expect(fill.fee).toBeCloseTo(0.000018431215 * 750, 12)
  expect(fill.orderId).toBe(fixture.receipt.transactionHash)
  expect(fill.executionNote).toContain("BNB")
})
describe("receipt refusals", () => {
  it("does not invent a fill for another wallet, failed receipt or unknown decimals", () => {
    expect(
      bnbReceiptFill(
        receipt,
        "0x1111111111111111111111111111111111111111",
        at,
        new Map([[coin, 18]]),
        750
      )
    ).toBeNull()
    expect(
      bnbReceiptFill(
        { ...receipt, status: "reverted" },
        wallet,
        at,
        new Map([[coin, 18]]),
        750
      )
    ).toBeNull()
    expect(bnbReceiptFill(receipt, wallet, at, new Map(), 750)).toBeNull()
  })
  it("says that a reverted transaction still spent gas", () => {
    expect(
      bnbReceiptFailure(receipt.transactionHash, "swap", receipt)
    ).toContain("0.000018431215 BNB was spent")
  })
})
