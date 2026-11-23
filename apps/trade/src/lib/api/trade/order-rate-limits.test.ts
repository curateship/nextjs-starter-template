import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { getAsterMarginModeSaveErrorMessage } from "@/lib/api/trade/aster-margin-mode"
import { getLiveErrorMessage } from "@/lib/api/trade/live"
import { getSmartOrderErrorMessage } from "@/lib/api/trade/smart-orders"

const apiFiles = {
  aster: readFileSync(
    new URL("./aster-margin-mode.ts", import.meta.url),
    "utf8"
  ),
  live: readFileSync(new URL("./live.ts", import.meta.url), "utf8"),
  smart: readFileSync(new URL("./smart-orders.ts", import.meta.url), "utf8"),
}

function serverFunctionBody(source: string, name: string): string {
  const definitions = [...source.matchAll(/const (\w+) = createServerFn\(/g)]
  const index = definitions.findIndex((match) => match[1] === name)
  expect(index, `${name} must remain a server function`).toBeGreaterThanOrEqual(
    0
  )
  const start = definitions[index].index
  const end = definitions[index + 1]?.index ?? source.length
  return source.slice(start, end)
}

const cappedDoors = [
  ["aster", "saveFn", "order", "runLiveOrderAction("],
  ["live", "placeLiveOrderFn", "order", "runLiveOrderAction("],
  ["live", "moveLiveOrderFn", "order", "runLiveOrderAction("],
  ["live", "cancelLiveOrderFn", "cancel", "runLiveOrderAction("],
  ["live", "setLiveBracketsFn", "order", "runLiveOrderAction("],
  ["live", "changeLiveLeverageFn", "order", "runLiveOrderAction("],
  ["live", "changeLiveMarginFn", "order", "runLiveOrderAction("],
  ["live", "closeLivePositionFn", "order", "runLiveOrderAction("],
  ["live", "closeLivePositionsFn", "order", "runLiveOrderAction("],
  ["smart", "placeDcaLadderFn", "order", "runWalletOrderAction("],
  ["smart", "cancelLadderRungFn", "cancel", "runWalletOrderAction("],
  ["smart", "cancelLadderRestFn", "cancel", "runWalletOrderAction("],
  ["smart", "cancelAllSmartOrdersFn", "cancel", "runWalletOrderAction("],
  ["smart", "flattenWalletFn", "order", "runWalletOrderAction("],
  ["smart", "closePartOfPositionFn", "order", "runWalletOrderAction("],
  ["smart", "updateLadderExitsFn", "order", "runWalletOrderAction("],
  ["smart", "placeGridOrderFn", "order", "runWalletOrderAction("],
  ["smart", "cancelGridLevelFn", "cancel", "runWalletOrderAction("],
  ["smart", "cancelGridRestFn", "cancel", "runWalletOrderAction("],
  ["smart", "reverseGridFn", "order", "runWalletOrderAction("],
  ["smart", "moveGridRangeFn", "order", "runWalletOrderAction("],
  ["smart", "reshapeGridFn", "order", "runWalletOrderAction("],
  ["smart", "moveGridExitFn", "order", "runWalletOrderAction("],
  ["smart", "updateGridStopFn", "order", "runWalletOrderAction("],
  ["smart", "setGridFollowFn", "order", "runWalletOrderAction("],
  ["smart", "updateGridEndFn", "order", "runWalletOrderAction("],
] as const

describe("every signed-in door that can reach an exchange order", () => {
  for (const [file, name, direction, wrapper] of cappedDoors) {
    it(`${name} spends the ${direction} budget`, () => {
      const body = serverFunctionBody(apiFiles[file], name)
      expect(body).toContain(wrapper)
      expect(body).toContain(`"${direction}"`)
    })
  }

  it("leaves the worker-style reconciliation outside the browser order cap", () => {
    const body = serverFunctionBody(apiFiles.smart, "reconcileLiveLaddersFn")
    expect(body).not.toContain("runWalletOrderAction(")
  })

  it("never lets the deployed website stand in for the trading engine", () => {
    const body = serverFunctionBody(apiFiles.smart, "reconcileLiveLaddersFn")
    const refusal = body.indexOf("if (!nonEngineProcessMayTrade())")
    const lock = body.indexOf("tryBecomeLeaderForOnePass()")

    expect(refusal).toBeGreaterThanOrEqual(0)
    expect(lock).toBeGreaterThan(refusal)
  })
})

describe("the refusal shown on screen", () => {
  const sentence = "The app is sending orders too fast. Try again in a moment."

  it("uses a sentence for a plain live order", () => {
    expect(getLiveErrorMessage(new Error("TRADE_ORDER_RATE_LIMITED"))).toBe(
      sentence
    )
  })

  it("uses the same sentence for a smart order", () => {
    expect(
      getSmartOrderErrorMessage(new Error("TRADE_ORDER_RATE_LIMITED"))
    ).toBe(sentence)
  })

  it("uses the same sentence for Aster's account margin change", () => {
    expect(
      getAsterMarginModeSaveErrorMessage(new Error("TRADE_ORDER_RATE_LIMITED"))
    ).toBe(sentence)
  })
})
