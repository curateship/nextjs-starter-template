import { describe, expect, it } from "vitest"

import { getLiveErrorMessage } from "@/lib/api/trade/live"
import { flowWaitCode } from "@/lib/trade/flow-waiting"
import { readSwapOrder } from "@/server/protocols/solana/orders"
import {
  explainSolanaError,
  jupiterExecuteRefusal,
  jupiterOrderRefusal,
  solanaRefusalError,
  solanaRefusalSentence,
} from "@/server/protocols/solana/refusals"
import saved from "@/server/protocols/solana/refusals.fixture.json"

/**
 * Solana's refusals, proved on Jupiter's real answers.
 *
 * `refusals.fixture.json` says where each answer came from: measured
 * against the live hosts on 5 Sep 2026 (a bad key, a mint that does not
 * exist, a wallet holding nothing, a broken execute), or copied from
 * Jupiter's own response reference. The made-up one is the unknown case,
 * and it carries secret-looking text to prove the text goes nowhere.
 */

/** Jupiter's execute body as the refusal reader takes it. */
function execute(body: Record<string, unknown>) {
  return jupiterExecuteRefusal({
    code: typeof body.code === "number" ? body.code : null,
    error: typeof body.error === "string" ? body.error : null,
    signature:
      typeof body.signature === "string" &&
      body.signature !== "transaction-signature"
        ? body.signature
        : null,
  })
}

describe("what Jupiter's order answer means", () => {
  it("reads the documented codes: no funds, no SOL for the fee, under the fee-free minimum", () => {
    const noFunds = readSwapOrder(saved.orderNoFunds.body, {
      side: "buy",
      coinDecimals: 9,
    })
    expect(jupiterOrderRefusal(noFunds, "buy")?.code).toBe("SOLANA_NO_USDC")
    expect(jupiterOrderRefusal(noFunds, "sell")?.code).toBe("SOLANA_NO_COIN")

    const topUp = readSwapOrder(saved.orderTopUp.body, {
      side: "buy",
      coinDecimals: 9,
    })
    expect(jupiterOrderRefusal(topUp, "buy")).toEqual({
      code: "SOLANA_NO_SOL",
      detail: { sol: 0.01 },
    })

    const gasless = readSwapOrder(saved.orderGaslessMinimum.body, {
      side: "buy",
      coinDecimals: 9,
    })
    expect(jupiterOrderRefusal(gasless, "buy")?.code).toBe("SOLANA_NO_ROUTE")
  })

  it("reads the measured empty-wallet answer, which has no code, as not enough of what the swap hands over", () => {
    const order = readSwapOrder(saved.emptyWalletOrder.body, {
      side: "buy",
      coinDecimals: 9,
    })
    expect(order.transaction).toBeNull()
    expect(order.error).toBeNull()
    expect(jupiterOrderRefusal(order, "buy")?.code).toBe("SOLANA_NO_USDC")
  })

  it("lets a real quote through, words or no words, because Jupiter says the words can ride on a valid order", () => {
    expect(
      jupiterOrderRefusal(
        { errorCode: null, error: null, transaction: "AgAAAA" },
        "buy"
      )
    ).toBeNull()
    expect(
      jupiterOrderRefusal(
        { errorCode: 3, error: "Minimum 0.05 for gasless", transaction: "AgAAAA" },
        "buy"
      )
    ).toBeNull()
    expect(
      jupiterOrderRefusal(
        { errorCode: 2, error: "Top up 0.01 SOL for gas", transaction: "AgAAAA" },
        "buy"
      )?.code
    ).toBe("SOLANA_NO_SOL")
  })

  it("reads a route problem from the shape of the words, and drops the words", () => {
    const refusal = jupiterOrderRefusal(
      { errorCode: null, error: "Could not find any route", transaction: null },
      "buy"
    )
    expect(refusal?.code).toBe("SOLANA_NO_ROUTE")
    expect(solanaRefusalSentence(refusal!.code, refusal!.detail)).not.toContain(
      "Could not find"
    )
  })
})

describe("what Jupiter's execute answer means", () => {
  it("an order that went stale never reached the network, so a fresh one may be asked for", () => {
    expect(execute(saved.executeOrderNotFound.body)).toEqual({
      code: "SOLANA_EXPIRED",
      detail: {},
      expired: true,
    })
    expect(execute(saved.executeExpired.body).expired).toBe(true)
  })

  it("the price moving past the cap landed on the chain and failed there, so the signature is kept", () => {
    const refusal = execute(saved.executeSlippage.body)
    expect(refusal.code).toBe("SOLANA_SLIPPAGE")
    expect(refusal.expired).toBe(false)
    expect(refusal.detail.signature).toBe(saved.executeSlippage.body.signature)
    const sentence = solanaRefusalSentence(refusal.code, refusal.detail)
    expect(sentence).toContain("nothing was bought or sold")
    expect(sentence).toContain(saved.executeSlippage.body.signature)
    expect(sentence).toContain("solscan.io")
  })

  it("a program error with a signature is the chain saying no, and the signature is shown", () => {
    const refusal = execute(saved.executeProgramFailed.body)
    expect(refusal.code).toBe("SOLANA_CHAIN_FAILED")
    const sentence = solanaRefusalSentence(refusal.code, refusal.detail)
    expect(sentence).toContain("confirmed the swap as failed")
    expect(sentence).toContain(saved.executeProgramFailed.body.signature)
    expect(sentence).not.toContain("InvalidTokenAccount")
    expect(sentence).not.toContain("deadbeef")
  })

  it("the measured broken execute and Jupiter's own internal error are unknown, and their words go nowhere", () => {
    for (const body of [
      saved.executeGarbage.body,
      saved.executeRfqInternal.body,
    ]) {
      const refusal = execute(body)
      expect(refusal.code).toBe("SOLANA_REFUSED")
      expect(refusal.expired).toBe(false)
      const sentence = solanaRefusalSentence(refusal.code, refusal.detail)
      expect(sentence).toBe(
        "Solana refused the trade, and nothing moved. Try it again in a moment."
      )
      expect(sentence).not.toContain(String(body.error))
    }
  })
})

describe("what the client's codes mean", () => {
  it("a bad key, measured as 401, says where to get one", () => {
    const error = explainSolanaError(
      new Error(`SOLANA_JUPITER_REFUSED:${saved.badKey.status}`)
    )
    expect(error.message).toMatch(/^LIVE_ORDER_REFUSED:/)
    expect(error.message).toContain("TRADE_JUPITER_API_KEY")
    expect(error.message).toContain("portal.jup.ag")
    expect(error.message).not.toContain("Unauthorized")
  })

  it("a 400 on the order call is Jupiter finding nothing to swap", () => {
    const error = explainSolanaError(
      new Error(`SOLANA_JUPITER_REFUSED:${saved.orderNoQuotes.status}`)
    )
    expect(error.message).toContain("no pool with enough money")
  })

  it("the measured 500 for a mint that does not exist is unknown", () => {
    const error = explainSolanaError(
      new Error(`SOLANA_JUPITER_REFUSED:${saved.unknownMint.status}`)
    )
    expect(error.message).toBe(
      "LIVE_ORDER_REFUSED:Solana refused the trade, and nothing moved. Try it again in a moment."
    )
  })

  it("a 429 that came back after the one retry says what the free key allows", () => {
    const error = explainSolanaError(new Error("EXCHANGE_BUSY"))
    expect(error.message).toMatch(/^EXCHANGE_BUSY:/)
    expect(error.message).toContain("waited a second and asked once more")
    expect(error.message).toContain("60 calls a minute")
  })

  it("the app's own budget saying no carries the count", () => {
    const error = explainSolanaError(
      new Error("EXCHANGE_BUSY:Jupiter — spent 40 of 40 this minute")
    )
    expect(error.message).toBe(
      "EXCHANGE_BUSY:Trade has spent 40 of its 40 Jupiter calls this minute, and the free key allows 60 a minute. Wait for the minute to roll over, then try again."
    )
  })

  it("anything else, the node's words included, is unknown and the words go nowhere", () => {
    const error = explainSolanaError(
      new Error("SOLANA_NODE_REFUSED:-32602:Invalid param: secret 0xabc")
    )
    expect(error.message).toBe(
      "LIVE_ORDER_REFUSED:Solana refused the trade, and nothing moved. Try it again in a moment."
    )
    expect(error.message).not.toContain("Invalid param")
  })
})

describe("the shared shape the screens print", () => {
  it("the order form prints each sentence as written", () => {
    for (const code of [
      "SOLANA_KEY",
      "SOLANA_SLIPPAGE",
      "SOLANA_NO_SOL",
      "SOLANA_NO_USDC",
      "SOLANA_NO_COIN",
      "SOLANA_NOT_ENOUGH",
      "SOLANA_EXPIRED",
      "SOLANA_NO_ROUTE",
      "SOLANA_CHAIN_FAILED",
      "SOLANA_REFUSED",
    ] as const) {
      const sentence = solanaRefusalSentence(code, { signature: "5Uf" })
      expect(getLiveErrorMessage(solanaRefusalError(code, { signature: "5Uf" }))).toBe(
        sentence
      )
      expect(sentence).not.toContain("SOLANA_")
    }
  })

  it("a busy sentence prints as written on the order form and counts as busy in a flow", () => {
    const busy = solanaRefusalError("SOLANA_BUSY")
    expect(getLiveErrorMessage(busy)).toBe(solanaRefusalSentence("SOLANA_BUSY"))
    expect(flowWaitCode(busy)).toBe("EXCHANGE_BUSY")
  })

  it("no SOL names the figure Jupiter stated, and none when it stated none", () => {
    expect(solanaRefusalSentence("SOLANA_NO_SOL", { sol: 0.01 })).toContain(
      "at least 0.01 SOL"
    )
    expect(solanaRefusalSentence("SOLANA_NO_SOL")).toContain("a little SOL")
  })
})
