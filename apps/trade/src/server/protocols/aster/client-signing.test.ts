import { describe, expect, it } from "vitest"

import {
  asterSigningQuery,
  packAsterCredential,
  parseAsterCredential,
  signAsterQuery,
} from "@/server/protocols/aster/client"

const PRIVATE_KEY = `0x${"1".padStart(64, "0")}`

describe("Aster credentials and signing", () => {
  it("packs the derived signer beside the key and round-trips", () => {
    const blob = packAsterCredential({ agentKey: PRIVATE_KEY })
    const parsed = parseAsterCredential(blob)
    expect(parsed.privateKey).toBe(PRIVATE_KEY)
    expect(parsed.signer).toBe("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf")
  })

  it("signs the exact URL-encoded parameter string", async () => {
    const credential = parseAsterCredential(
      packAsterCredential({ agentKey: PRIVATE_KEY })
    )
    const query = asterSigningQuery({
      symbol: "BTC USDT",
      user: "0xabc",
      signer: credential.signer,
      nonce: 1_748_310_859_508_867,
    })
    expect(query).toBe(
      "symbol=BTC+USDT&user=0xabc&signer=0x7e5f4552091a69125d5dfcb7b8c2659029395bdf&nonce=1748310859508867"
    )
    expect(await signAsterQuery(credential, query)).toBe(
      "0xb5fbe896e8ebb0e265d58cc64ef1ef8166cbb7b75a747fc6296343453470f5432f55204fd804ed6a9badb2e94dce071edaa7e65048f775f223e89915f86a84f81b"
    )
  })

  it("rejects a blob whose signer does not match its key", () => {
    expect(() =>
      parseAsterCredential(
        JSON.stringify({
          signer: "0x0000000000000000000000000000000000000000",
          privateKey: PRIVATE_KEY,
        })
      )
    ).toThrow("LIVE_WALLET_KEY")
  })
})
