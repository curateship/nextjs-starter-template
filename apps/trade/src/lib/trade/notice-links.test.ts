import { describe, expect, it } from "vitest"

import { isOwnAppHref } from "@/lib/notification-action"
import { marketChartHref } from "@/lib/protocols/contracts"
import {
  flowEditorNoticeHref,
  flowRunNoticeHref,
} from "@/lib/trade/notice-links"

/**
 * Where a coin's notice leads is `marketChartHref`, and `contracts.test.ts`
 * already covers every exchange it knows and the null it gives for one it does
 * not. What is left for here is the flow addresses, and the promise that every
 * address this app writes is one the browser will actually follow.
 */
describe("the page a flow notice came off", () => {
  it("sends a flow notice to that run, and a refused start to the flow", () => {
    expect(flowRunNoticeHref("run-7")).toBe("/flow-runs/run-7")
    expect(flowEditorNoticeHref("flow-3")).toBe("/admin/automations/flow-3")
  })

  it("escapes an id rather than letting it change the address", () => {
    expect(flowRunNoticeHref("a/b?c")).toBe("/flow-runs/a%2Fb%3Fc")
    expect(flowEditorNoticeHref("a/b")).toBe("/admin/automations/a%2Fb")
  })

  it("writes every address it makes as one this app will follow", () => {
    for (const href of [
      marketChartHref("hyperliquid:mainnet:ETH"),
      flowRunNoticeHref("run-7"),
      flowEditorNoticeHref("flow-3"),
    ]) {
      expect(href).not.toBeNull()
      expect(isOwnAppHref(href as string)).toBe(true)
    }
  })
})

describe("which addresses this app will follow", () => {
  it("follows a path of its own", () => {
    expect(isOwnAppHref("/admin/hyper-liquid?market=x")).toBe(true)
    expect(isOwnAppHref("/flow-runs/run-7")).toBe(true)
  })

  // These are the shapes that matter: a database column is not a trusted
  // source, and each of these reads as a local path at a glance.
  it("refuses another site, a protocol-relative address and a script", () => {
    expect(isOwnAppHref("//evil.example/steal")).toBe(false)
    expect(isOwnAppHref("https://evil.example")).toBe(false)
    expect(isOwnAppHref("javascript:alert(1)")).toBe(false)
    expect(isOwnAppHref("admin/hyper-liquid")).toBe(false)
    expect(isOwnAppHref("")).toBe(false)
  })

  // A backslash is a slash to a browser, so each of these is `//evil.example`
  // in disguise and lands on another site. Reading the first two characters
  // says they are local; resolving them says they are not.
  it("refuses a backslash wearing one leading slash", () => {
    expect(isOwnAppHref("/\\evil.example")).toBe(false)
    expect(isOwnAppHref("/\\\\evil.example")).toBe(false)
    expect(isOwnAppHref("/\\/evil.example")).toBe(false)
  })

  // The other half of the same test: an odd-looking path that never leaves is
  // still a path, and dropping it would be a second bug in the other direction.
  it("still follows a path that only looks odd", () => {
    expect(isOwnAppHref("/%2f%2fevil.example")).toBe(true)
    expect(isOwnAppHref("/admin/automations/a b")).toBe(true)
  })
})
