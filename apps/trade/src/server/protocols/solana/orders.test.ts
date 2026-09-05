import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderAuth } from "@/lib/protocols/contracts"
import account from "@/server/protocols/solana/account.fixture.json"
import {
  clearSolanaAccountState,
  SOL_MINT,
  solanaHoldings,
} from "@/server/protocols/solana/account"
import { encodeBase58 } from "@/server/protocols/solana/base58"
import { clearSolanaClientState } from "@/server/protocols/solana/client"
import {
  clearSolanaMarketState,
  USDC_MINT,
} from "@/server/protocols/solana/markets"
import {
  clearSolanaOrderState,
  fetchSolanaOrderFills,
  fromSmallestUnit,
  placeSolanaOrder,
  quoteSolanaSwap,
  readSwapOrder,
  swapFillFromTransaction,
  swapRefusal,
  toSmallestUnit,
} from "@/server/protocols/solana/orders"
import fixture from "@/server/protocols/solana/swap.fixture.json"

/**
 * Buying and selling through Jupiter, proved on real answers.
 *
 * `swap.fixture.json` holds three things read on 4 Sep 2026: Jupiter's
 * answer to "buy $10 of SOL" for a real wallet, a confirmed transaction in
 * which a wallet paid $0.20 of USDC for 0.001962107 SOL, and a confirmed
 * transaction in which a wallet swapped SOL for some other coin with no
 * USDC involved. The tests here are what the app does with those, plus
 * the whole place path with the network stubbed.
 */

// Only the Settings-toggle half of the gate is stubbed: reading it needs a
// database no unit test here has. The environment half is left exactly as
// it is, because the switched-off test below depends on it.
vi.mock("@/server/protocols/real-money", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/protocols/real-money")>()
  return {
    ...original,
    assertRealMoneyAllowed: async (network: "mainnet" | "testnet") => {
      original.assertRealOrdersAllowed(network)
    },
  }
})

/** The wallet that made the saved buy of SOL. */
const BUYER = "CDaiLxxGiFyAtMkxmBmETjqHrRpHdkZBjDa8udWKMhdS"
const BUY_SIGNATURE = fixture.buyOfSol.transaction.signatures[0]

/** A throwaway keypair: never funded, never on the chain. */
const wallet = Keypair.generate()
const ADDRESS = wallet.publicKey.toBase58()
const AUTH: OrderAuth = {
  agentKey: encodeBase58(wallet.secretKey),
  accountAddress: ADDRESS,
  allocateNonce: async () => 1,
}

/**
 * An unsigned transaction the throwaway key is allowed to sign, in place
 * of the one Jupiter built for another wallet. Signing is the thing under
 * test, and a transaction built for somebody else refuses a stranger's key.
 */
function unsignedForWallet(): string {
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    ],
  }).compileToV0Message()
  return Buffer.from(new VersionedTransaction(message).serialize()).toString(
    "base64"
  )
}

/** The saved buy of SOL, as if the throwaway wallet had made it. */
function buyAsThrowaway(): unknown {
  return JSON.parse(JSON.stringify(fixture.buyOfSol).replaceAll(BUYER, ADDRESS))
}

type Sent = {
  method: string
  url: string
  body: {
    method?: string
    requestId?: string
    signedTransaction?: string
  } | null
}

/**
 * The network, stubbed: Jupiter's order and execute calls and the node's
 * JSON-RPC methods, each answered by the case that needs it.
 */
function stubNetwork(answers: {
  order?: unknown
  execute?: { status: number; body: unknown }
  rpc?: Record<string, unknown>
}): Sent[] {
  const sent: Sent[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (rawUrl: string | URL, init?: RequestInit) => {
      const url = String(rawUrl)
      const body = init?.body ? JSON.parse(String(init.body)) : null
      sent.push({ method: init?.method ?? "GET", url, body })
      if (url.includes("jup.ag")) {
        if (url.includes("/ultra/v1/order")) {
          return Response.json(answers.order ?? { error: "no order stubbed" })
        }
        // A wallet read prices its held coins through Jupiter; none of
        // these cases care what they are worth.
        if (url.includes("/price/v3")) return Response.json({})
        if (url.includes("/ultra/v1/execute")) {
          const answer = answers.execute ?? {
            status: 400,
            body: { code: -1, error: "no execute stubbed" },
          }
          return Response.json(answer.body, { status: answer.status })
        }
        return Response.json({}, { status: 404 })
      }
      const result = answers.rpc?.[body.method] ?? null
      return Response.json({ jsonrpc: "2.0", id: 1, result })
    })
  )
  return sent
}

function ordersAsked(sent: Sent[]): Sent[] {
  return sent.filter((one) => one.url.includes("/ultra/v1/order"))
}

function executesSent(sent: Sent[]): Sent[] {
  return sent.filter((one) => one.url.includes("/ultra/v1/execute"))
}

beforeEach(() => {
  delete process.env.TRADE_ENABLE_MAINNET
  delete process.env.TRADE_JUPITER_API_KEY
  clearSolanaClientState()
  clearSolanaOrderState()
  clearSolanaAccountState()
  clearSolanaMarketState()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TRADE_ENABLE_MAINNET
})

describe("amounts in the coin's smallest unit", () => {
  it("writes $10 of USDC as 10000000", () => {
    expect(toSmallestUnit(10, 6)).toBe("10000000")
  })

  it("keeps every digit of a nine-decimal coin", () => {
    expect(toSmallestUnit(0.001962107, 9)).toBe("1962107")
    expect(toSmallestUnit(1_972_010.475425346, 9)).toBe("1972010475425346")
  })

  it("cuts rather than rounds up, so no order sends more than asked", () => {
    expect(toSmallestUnit(1.9999999999, 9)).toBe("1999999999")
    expect(toSmallestUnit(0.0000001, 6)).toBe("0")
  })

  it("reads the chain's integer back as coins", () => {
    expect(fromSmallestUnit("98149876", 9)).toBeCloseTo(0.098149876, 12)
    expect(fromSmallestUnit("200000", 6)).toBe(0.2)
  })
})

describe("reading Jupiter's order answer", () => {
  it("turns the saved buy of $10 of SOL into coins, dollars and a price", () => {
    const order = readSwapOrder(fixture.order, { side: "buy", coinDecimals: 9 })
    expect(order.usd).toBe(10)
    expect(order.coins).toBeCloseTo(0.098149876, 12)
    // $10 / 0.098149876 SOL.
    expect(order.price).toBeCloseTo(101.885, 2)
    expect(order.priceImpact).toBeCloseTo(0.0000808619757525235, 12)
    expect(order.route).toBe("JupiterZ")
    expect(order.transaction).toBe(fixture.order.transaction)
    expect(order.requestId).toBe(fixture.order.requestId)
    expect(order.error).toBeNull()
  })

  it("carries Jupiter's own words when it could not build the swap", () => {
    const order = readSwapOrder(
      { error: "Invalid taker" },
      { side: "buy", coinDecimals: 9 }
    )
    expect(order.error).toBe("Invalid taker")
    expect(order.coins).toBe(0)
    const built = readSwapOrder(
      {
        ...fixture.order,
        transaction: "",
        errorMessage: "Missing associated token account",
      },
      { side: "buy", coinDecimals: 9 }
    )
    expect(built.error).toBe("Missing associated token account")
    expect(built.transaction).toBeNull()
  })
})

describe("what is refused before signing", () => {
  const order = readSwapOrder(fixture.order, { side: "buy", coinDecimals: 9 })

  it("lets a quote through that is inside the cap", () => {
    expect(
      swapRefusal(order, { side: "buy", px: 101.9, slippage: 0.005 })
    ).toBeNull()
    // A close takes today's price and skips the price check.
    expect(
      swapRefusal(order, { side: "buy", px: null, slippage: 0.005 })
    ).toBeNull()
  })

  it("refuses a swap whose price impact is over the cap", () => {
    // A thin coin: the saved impact is 0.008% and the cap is 0.001%.
    const refusal = swapRefusal(order, {
      side: "buy",
      px: 101.9,
      slippage: 0.00001,
    })
    expect(refusal).toContain("would move the price by 0.01%")
    expect(refusal).toContain("more than the 0% cap")
  })

  it("refuses a buy quoted worse than the order's price plus the cap", () => {
    // Quoted $101.885; the order says $100 and allows half a percent more.
    const refusal = swapRefusal(order, {
      side: "buy",
      px: 100,
      slippage: 0.005,
    })
    expect(refusal).toContain("Jupiter quotes $101.88 a coin")
    expect(refusal).toContain("allows up to $100.50")
  })

  it("refuses a sell quoted worse than the order's price less the cap", () => {
    const sell = readSwapOrder(
      { ...fixture.order, inAmount: "98149876", outAmount: "10000000" },
      { side: "sell", coinDecimals: 9 }
    )
    expect(
      swapRefusal(sell, { side: "sell", px: 101.5, slippage: 0.005 })
    ).toBeNull()
    const refusal = swapRefusal(sell, {
      side: "sell",
      px: 103,
      slippage: 0.005,
    })
    expect(refusal).toContain("allows no less than $102.49")
  })

  it("refuses when Jupiter could not build the swap", () => {
    const failed = readSwapOrder(
      { error: "Invalid taker" },
      { side: "buy", coinDecimals: 9 }
    )
    expect(swapRefusal(failed, { side: "buy", px: 100, slippage: 0.005 })).toBe(
      "Jupiter could not build this swap: Invalid taker."
    )
  })
})

describe("reading a fill off the chain", () => {
  it("reads the saved buy: $0.20 of USDC for 0.001962107 SOL", () => {
    const fill = swapFillFromTransaction(fixture.buyOfSol, BUYER)
    expect(fill).not.toBeNull()
    expect(fill!.side).toBe("buy")
    expect(fill!.marketId).toBe(SOL_MINT)
    expect(fill!.sz).toBeCloseTo(0.001962107, 12)
    // $0.20 / 0.001962107 SOL.
    expect(fill!.px).toBeCloseTo(101.93, 1)
    expect(fill!.at).toBe(fixture.buyOfSol.blockTime * 1_000)
    expect(fill!.fillId).toBe(BUY_SIGNATURE)
    expect(fill!.orderId).toBe(BUY_SIGNATURE)
    expect(fill!.dir).toBe("Open Long")
    expect(fill!.closedPnl).toBe(0)
    expect(fill!.liquidation).toBe(false)
  })

  it("is nobody else's fill", () => {
    expect(swapFillFromTransaction(fixture.buyOfSol, ADDRESS)).toBeNull()
  })

  it("leaves out a swap of SOL for another coin, because no USDC moved", () => {
    const signer =
      fixture.solForAnotherCoin.transaction.message.accountKeys[0].pubkey
    expect(
      swapFillFromTransaction(fixture.solForAnotherCoin, signer)
    ).toBeNull()
  })

  it("leaves out a transaction that failed", () => {
    const failed = {
      ...fixture.buyOfSol,
      meta: {
        ...fixture.buyOfSol.meta,
        err: { InstructionError: [3, { Custom: 6001 }] },
      },
    }
    expect(swapFillFromTransaction(failed, BUYER)).toBeNull()
  })
})

describe("placing a buy", () => {
  const order = { ...fixture.order, transaction: unsignedForWallet() }
  const buy = {
    marketId: SOL_MINT,
    side: "buy" as const,
    kind: "market" as const,
    px: 101.9,
    sz: 0.0981,
    reduceOnly: false,
    leverage: null,
    tpPx: null,
    slPx: null,
    slippage: 0.005,
  }

  it("with real money switched off, quotes and stops before signing", async () => {
    const sent = stubNetwork({ order })
    await expect(placeSolanaOrder("mainnet", AUTH, buy)).rejects.toThrow(
      "LIVE_MAINNET_OFF"
    )
    // The quote was asked, sized in USDC: 0.0981 SOL at $101.90 is $9.996.
    const asked = ordersAsked(sent)
    expect(asked).toHaveLength(1)
    const url = new URL(asked[0].url)
    expect(url.searchParams.get("inputMint")).toBe(USDC_MINT)
    expect(url.searchParams.get("outputMint")).toBe(SOL_MINT)
    expect(url.searchParams.get("amount")).toBe("9996390")
    expect(url.searchParams.get("taker")).toBe(ADDRESS)
    expect(url.searchParams.get("slippageBps")).toBe("50")
    expect(executesSent(sent)).toHaveLength(0)
  })

  it("signs, sends, and answers with the fill read off the chain", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent = stubNetwork({
      order,
      execute: {
        status: 200,
        body: { status: "Success", signature: BUY_SIGNATURE, code: 0 },
      },
      rpc: { getTransaction: buyAsThrowaway() },
    })
    const outcome = await placeSolanaOrder("mainnet", AUTH, buy)
    expect(outcome.status).toBe("filled")
    expect(outcome.orderId).toBe(BUY_SIGNATURE)
    // The chain's figures, not the quote's.
    expect(outcome.filledSz).toBeCloseTo(0.001962107, 12)
    expect(outcome.avgPx).toBeCloseTo(101.93, 1)
    expect(outcome.protection).toBeNull()

    const [execute] = executesSent(sent)
    expect(execute.method).toBe("POST")
    expect(execute.body?.requestId).toBe(fixture.order.requestId)
    const signed = VersionedTransaction.deserialize(
      Buffer.from(execute.body?.signedTransaction ?? "", "base64")
    )
    expect(signed.signatures).toHaveLength(1)
    expect(signed.signatures[0].some((byte) => byte !== 0)).toBe(true)
  })

  it("says so when the swap went through but no stop or target could be placed", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    stubNetwork({
      order,
      execute: {
        status: 200,
        body: { status: "Success", signature: BUY_SIGNATURE },
      },
      rpc: { getTransaction: buyAsThrowaway() },
    })
    const outcome = await placeSolanaOrder("mainnet", AUTH, {
      ...buy,
      slPx: 95,
    })
    expect(outcome.status).toBe("filled")
    expect(outcome.protection).toBe("partial")
    expect(outcome.protectionNote).toContain("no stop or target")
  })

  it("refuses a thin coin before signing and sends nothing", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent = stubNetwork({ order })
    await expect(
      placeSolanaOrder("mainnet", AUTH, { ...buy, slippage: 0.00005 })
    ).rejects.toThrow("LIVE_ORDER_REFUSED:")
    await expect(
      placeSolanaOrder("mainnet", AUTH, { ...buy, slippage: 0.00005 })
    ).rejects.toThrow("would move the price")
    expect(executesSent(sent)).toHaveLength(0)
  })

  it("passes on a swap Jupiter reports as failed, with its words", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    stubNetwork({
      order,
      execute: {
        status: 400,
        body: { status: "Failed", code: -3, error: "Transaction expired" },
      },
    })
    await expect(placeSolanaOrder("mainnet", AUTH, buy)).rejects.toThrow(
      "The swap did not go through: Transaction expired. A swap that fails moves no coins."
    )
  })

  it("refuses a resting shape without asking Jupiter", async () => {
    const sent = stubNetwork({ order })
    await expect(
      placeSolanaOrder("mainnet", AUTH, { ...buy, kind: "postOnly" })
    ).rejects.toThrow("Nothing rests on Solana")
    expect(sent).toHaveLength(0)
  })
})

describe("placing a sell", () => {
  const chain = {
    getBalance: account.balance.result,
    getTokenAccountsByOwner: account.tokenAccounts.result,
  }
  const sell = {
    marketId: SOL_MINT,
    side: "sell" as const,
    kind: "market" as const,
    px: 101.9,
    sz: 2_000_000,
    reduceOnly: false,
    leverage: null,
    tpPx: null,
    slPx: null,
    slippage: 0.005,
  }

  it("refuses a sell of more than the wallet holds, before Jupiter is asked", async () => {
    const sent = stubNetwork({ rpc: chain })
    await expect(placeSolanaOrder("mainnet", AUTH, sell)).rejects.toThrow(
      'Tick "Sell only what I hold"'
    )
    expect(ordersAsked(sent)).toHaveLength(0)
  })

  it("shrinks a sell-only-what-I-hold to the holding", async () => {
    const sent = stubNetwork({ rpc: chain, order: { error: "stop here" } })
    await expect(
      placeSolanaOrder("mainnet", AUTH, { ...sell, reduceOnly: true })
    ).rejects.toThrow("Jupiter could not build this swap: stop here")
    const [asked] = ordersAsked(sent)
    const url = new URL(asked.url)
    expect(url.searchParams.get("inputMint")).toBe(SOL_MINT)
    expect(url.searchParams.get("outputMint")).toBe(USDC_MINT)
    // Every SOL the stubbed chain says the wallet holds, native and wrapped
    // together, as the holdings reader adds them up.
    const held = solanaHoldings({
      balance: chain.getBalance,
      tokenAccounts: chain.getTokenAccountsByOwner,
      token2022Accounts: chain.getTokenAccountsByOwner,
    }).coins.get(SOL_MINT)!
    expect(held).toBeGreaterThan(1_972_010)
    expect(url.searchParams.get("amount")).toBe(toSmallestUnit(held, 9))
  })

  it("refuses a sell of a coin the wallet does not hold", async () => {
    stubNetwork({ rpc: chain })
    await expect(
      placeSolanaOrder("mainnet", AUTH, {
        ...sell,
        marketId: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN".replace(
          "J",
          "K"
        ),
      })
    ).rejects.toThrow("nothing to sell")
  })

  it("refuses a buy marked sell-only-what-I-hold", async () => {
    const sent = stubNetwork({})
    await expect(
      placeSolanaOrder("mainnet", AUTH, {
        ...sell,
        side: "buy",
        reduceOnly: true,
      })
    ).rejects.toThrow("is for a sell")
    expect(sent).toHaveLength(0)
  })
})

describe("the order window's quote", () => {
  it("answers the figures and whether the swap could go out", async () => {
    stubNetwork({ order: fixture.order })
    const quote = await quoteSolanaSwap("mainnet", ADDRESS, {
      marketId: SOL_MINT,
      side: "buy",
      sz: 0.0981,
      px: 101.9,
      slippage: 0.005,
    })
    expect(quote.usd).toBe(10)
    expect(quote.sz).toBeCloseTo(0.098149876, 12)
    expect(quote.route).toBe("JupiterZ")
    expect(quote.refusal).toBeNull()
    const thin = await quoteSolanaSwap("mainnet", ADDRESS, {
      marketId: SOL_MINT,
      side: "buy",
      sz: 0.0981,
      px: 101.9,
      slippage: 0.00001,
    })
    expect(thin.refusal).toContain("would move the price")
  })
})

describe("fills read off the chain", () => {
  it("lists the wallet's swaps since a time, and reads each transaction once", async () => {
    const since = fixture.buyOfSol.blockTime * 1_000 - 60_000
    const sent = stubNetwork({
      rpc: {
        getSignaturesForAddress: [
          {
            signature: BUY_SIGNATURE,
            blockTime: fixture.buyOfSol.blockTime,
            err: null,
          },
          {
            signature: "older",
            blockTime: fixture.buyOfSol.blockTime - 3_600,
            err: null,
          },
          {
            signature: "failed",
            blockTime: fixture.buyOfSol.blockTime,
            err: { InstructionError: [] },
          },
        ],
        getTransaction: fixture.buyOfSol,
      },
    })
    const fills = await fetchSolanaOrderFills("mainnet", BUYER, since)
    expect(fills).toHaveLength(1)
    expect(fills[0].fillId).toBe(BUY_SIGNATURE)
    expect(fills[0].px).toBeCloseTo(101.93, 1)
    const reads = () =>
      sent.filter((one) => one.body?.method === "getTransaction")
    expect(reads()).toHaveLength(1)

    const again = await fetchSolanaOrderFills("mainnet", BUYER, since)
    expect(again).toHaveLength(1)
    // Remembered: the second sweep listed the signatures and read nothing.
    expect(reads()).toHaveLength(1)
  })
})
