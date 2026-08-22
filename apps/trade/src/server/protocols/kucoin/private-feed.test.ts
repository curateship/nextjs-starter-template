import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The line only ever says one thing — "nothing has happened since then" — and
 * everything that matters is when it refuses to say it. A wrong "quiet" means
 * a read is skipped and a filled order goes on being shown as resting, so
 * every one of these is a case where the honest answer is "I cannot say".
 *
 * KuCoin needs one signed request before its socket will open at all, so that
 * is the one thing stubbed here.
 */

const signed = vi.fn()

vi.mock("@/server/protocols/kucoin/client", () => ({
  kucoinSigned: (...args: unknown[]) => signed(...args),
  parseKucoinCredential: (blob: string) => JSON.parse(blob),
}))

const { closeKucoinPrivateFeeds, kucoinQuietSince } =
  await import("@/server/protocols/kucoin/private-feed")
const { kucoinTouched, clearKucoinTouched } =
  await import("@/server/protocols/kucoin/touched")

const KEY_ID = "key-1"
/**
 * How the line reads a credential: a closure over the ciphertext, opened only
 * when a signature is needed. `wallet-auth.ts` states the rule — decrypted per
 * call, never cached — and the line holds this rather than a secret.
 */
const CREDENTIAL = () =>
  JSON.stringify({ keyId: KEY_ID, secret: "s3cret", passphrase: "phrase" })

type Listener = (event: { data?: unknown }) => void

class FakeSocket {
  static latest: FakeSocket | null = null
  static made = 0
  readonly listeners = new Map<string, Listener[]>()
  readonly sent: string[] = []
  closed = false

  constructor(readonly url: string) {
    FakeSocket.latest = this
    FakeSocket.made += 1
  }

  addEventListener(name: string, listener: Listener): void {
    const list = this.listeners.get(name) ?? []
    list.push(listener)
    this.listeners.set(name, list)
  }

  send(text: string): void {
    this.sent.push(text)
  }

  close(): void {
    this.closed = true
  }

  fire(name: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(name) ?? []) listener(event)
  }

  reply(body: unknown): void {
    this.fire("message", { data: JSON.stringify(body) })
  }
}

/**
 * Lets the ticket request settle and brings the socket up.
 *
 * The ticket is a real promise, so the line cannot dial and connect inside one
 * synchronous call — which is exactly the point of it never being awaited by a
 * caller.
 */
async function comeUp(): Promise<FakeSocket> {
  await vi.waitFor(() => {
    if (!FakeSocket.latest) throw new Error("no socket yet")
  })
  const socket = FakeSocket.latest
  if (!socket) throw new Error("expected a socket")
  socket.fire("open")
  socket.reply({ id: "sub-orders", type: "ack" })
  return socket
}

beforeEach(() => {
  FakeSocket.latest = null
  FakeSocket.made = 0
  clearKucoinTouched()
  signed.mockReset()
  signed.mockResolvedValue({
    token: "t0ken",
    instanceServers: [
      { endpoint: "wss://kucoin.test/endpoint", pingInterval: 18_000 },
    ],
  })
  vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
  closeKucoinPrivateFeeds()
  vi.unstubAllGlobals()
})

describe("what the private line will and will not vouch for", () => {
  it("says nothing at all until the subscription is acknowledged", async () => {
    // The very first ask starts the dial and is answered honestly: nobody was
    // watching a moment ago, so nobody can say what happened then.
    expect(kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())).toBe(
      false
    )
    await vi.waitFor(() => {
      if (!FakeSocket.latest) throw new Error("no socket yet")
    })
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    socket.fire("open")
    // Connected but not acknowledged: the exchange is not sending this
    // account's order events yet, so its silence proves nothing.
    expect(
      kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now() - 1)
    ).toBe(false)
  })

  it("asks for its ticket once, not once per attempt", async () => {
    kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    await comeUp()
    // The ticket is a signed request against the very key this whole file
    // exists to spare.
    expect(signed).toHaveBeenCalledTimes(1)
    expect(signed.mock.calls[0][3]).toBe("/api/v1/bullet-private")
  })

  it("vouches for a stretch it watched all the way through", async () => {
    kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    await comeUp()
    const readAt = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(true)
  })

  it("refuses a stretch that started before it was watching", async () => {
    const longBefore = Date.now() - 60_000
    kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, longBefore)
    await comeUp()
    // The line is healthy now, and still cannot say what happened an hour ago.
    expect(kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, longBefore)).toBe(
      false
    )
  })

  it("stops vouching the moment an order event arrives", async () => {
    kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const socket = await comeUp()
    const readAt = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 5))
    socket.reply({
      type: "message",
      topic: "/contractMarket/tradeOrders",
      data: { symbol: "SOLUSDTM", status: "done" },
    })
    expect(kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(false)
  })

  it("does not ring its own bell for a heartbeat", async () => {
    kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const socket = await comeUp()
    const readAt = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 5))
    socket.reply({ id: "p1", type: "pong" })
    expect(kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(true)
  })

  it("stops vouching when this app itself changes an order", async () => {
    kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    await comeUp()
    const readAt = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 5))
    // The exchange will push this too, a moment from now. A moment is long
    // enough to be told the account is quiet and skip the read that would have
    // shown the order just placed.
    kucoinTouched()
    expect(kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(false)
  })

  it("stops vouching after the line drops", async () => {
    kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const socket = await comeUp()
    const readAt = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 5))
    socket.fire("close")
    // Something may have happened while nobody was looking, and there is no
    // way to find out which.
    expect(kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(false)
  })

  it("reads the credential only when it dials, and never keeps it", async () => {
    // **`wallet-auth.ts` states the rule: decrypted per call, never cached.**
    // A line lives for hours and asks for a fresh ticket on every reconnect,
    // so it holds the way to read a credential rather than the credential.
    const reads = vi.fn(CREDENTIAL)
    kucoinQuietSince("mainnet", KEY_ID, reads, Date.now())
    await comeUp()
    // Once, for the one ticket it asked for.
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it("never dials when the credential cannot be read", async () => {
    kucoinQuietSince("mainnet", KEY_ID, () => null, Date.now())
    await new Promise((resolve) => setTimeout(resolve, 5))
    // No credential means no ticket, so no socket and nothing claimed. Every
    // read falls back to asking, which refuses out loud for the same reason.
    expect(signed).not.toHaveBeenCalled()
    expect(FakeSocket.made).toBe(0)
    expect(
      kucoinQuietSince("mainnet", KEY_ID, () => null, Date.now() - 1)
    ).toBe(false)
  })

  it("never claims a thing when the exchange will not grant a ticket", async () => {
    signed.mockRejectedValue(new Error("KUCOIN_401"))
    expect(
      kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now() - 1)
    ).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(FakeSocket.made).toBe(0)
    expect(
      kucoinQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now() - 1)
    ).toBe(false)
  })
})
