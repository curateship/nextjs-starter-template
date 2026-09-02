import { expect, it, vi } from "vitest"

import { createPrivateFeed } from "@/server/protocols/private-feed"

it("contains a close failure from a connection that opened too late", async () => {
  let finishOpening: (connection: object) => void = () => {}
  const opening = new Promise<object>((resolve) => {
    finishOpening = resolve
  })
  const close = vi.fn(() => {
    throw new Error("already closed")
  })
  const feed = createPrivateFeed({
    storageKey: "private-feed-late-open-test",
    touchedAt: () => 0,
    connect: () => opening,
    close,
  })

  expect(feed.quietSince("mainnet", "key", () => "credential", 0)).toBe(false)
  feed.close()
  finishOpening({})
  await Promise.resolve()
  await Promise.resolve()

  expect(close).toHaveBeenCalledOnce()
})
