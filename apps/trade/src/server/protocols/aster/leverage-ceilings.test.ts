import { beforeEach, describe, expect, it, vi } from "vitest"

const { asterSigned } = vi.hoisted(() => ({ asterSigned: vi.fn() }))
vi.mock("@/server/protocols/aster/client", () => ({
  asterSigned,
  parseAsterCredential: (blob: string) => JSON.parse(blob),
}))

import {
  fetchAsterLeverageCeilings,
  toAsterLeverageCeilings,
} from "@/server/protocols/aster/leverage-ceilings"

beforeEach(() => {
  asterSigned.mockReset()
})

describe("Aster leverage ceilings", () => {
  it("takes each market's highest bracket as its ceiling", () => {
    const ceilings = toAsterLeverageCeilings([
      {
        symbol: "BTCUSDT",
        brackets: [
          { bracket: 1, initialLeverage: 125, notionalCap: 50_000 },
          { bracket: 2, initialLeverage: 100, notionalCap: 250_000 },
        ],
      },
      // Out of order and as text: still the highest, as a whole number.
      {
        symbol: "ETHUSDT",
        brackets: [
          { bracket: 2, initialLeverage: "50" },
          { bracket: 1, initialLeverage: "75.5" },
        ],
      },
    ])
    expect(ceilings).toEqual(
      new Map([
        ["BTCUSDT", 125],
        ["ETHUSDT", 75],
      ])
    )
  })

  it("leaves out a market it cannot read rather than guessing", () => {
    expect(
      toAsterLeverageCeilings([
        { symbol: "NOBRACKETS", brackets: [] },
        { symbol: "BADNUMBER", brackets: [{ initialLeverage: "lots" }] },
        { symbol: "ZERO", brackets: [{ initialLeverage: 0 }] },
        { brackets: [{ initialLeverage: 20 }] },
        { symbol: "SOLUSDT", brackets: [{ initialLeverage: 20 }] },
      ])
    ).toEqual(new Map([["SOLUSDT", 20]]))
    expect(toAsterLeverageCeilings({ code: -1000 })).toEqual(new Map())
  })

  it("asks for every market in one signed read costing one unit", async () => {
    asterSigned.mockResolvedValue([
      { symbol: "BTCUSDT", brackets: [{ initialLeverage: 125 }] },
    ])
    const credential = JSON.stringify({ signer: "0xsigner", privateKey: "0xk" })

    const ceilings = await fetchAsterLeverageCeilings(
      "mainnet",
      "0xaccount",
      () => credential
    )

    expect(ceilings).toEqual(new Map([["BTCUSDT", 125]]))
    expect(asterSigned).toHaveBeenCalledTimes(1)
    expect(asterSigned).toHaveBeenCalledWith(
      "mainnet",
      "0xaccount",
      { signer: "0xsigner", privateKey: "0xk" },
      "GET",
      "/fapi/v3/leverageBrackets",
      1
    )
  })

  it("makes no signed call without a key", async () => {
    await expect(
      fetchAsterLeverageCeilings("mainnet", "0xaccount", () => null)
    ).rejects.toThrow("LIVE_WALLET_KEY")
    expect(asterSigned).not.toHaveBeenCalled()
  })
})
