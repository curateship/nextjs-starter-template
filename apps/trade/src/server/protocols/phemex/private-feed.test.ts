import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  closePhemexPrivateFeeds,
  phemexQuietSince,
} from "@/server/protocols/phemex/private-feed"
import {
  clearPhemexTouched,
  phemexTouched,
} from "@/server/protocols/phemex/touched"

/**
 * The line only ever says one thing — "nothing has happened since then" — and
 * everything that matters is when it refuses to say it. A wrong "quiet" means
 * a read is skipped and a filled order goes on being shown as resting, so
 * every one of these is a case where the honest answer is "I cannot say".
 */

const KEY_ID = "key-1"
/**
 * How the line reads a credential: a closure over the ciphertext, opened only
 * when a signature is needed. `wallet-auth.ts` states the rule — decrypted per
 * call, never cached — and the line holds this rather than a secret.
 */
const CREDENTIAL = () => JSON.stringify({ keyId: KEY_ID, secret: "s3cret" })

type Listener = (event: { data?: unknown }) => void

class FakeSocket {
  static latest: FakeSocket | null = null
  readonly listeners = new Map<string, Listener[]>()
  readonly sent: string[] = []
  closed = false

  constructor(readonly url: string) {
    FakeSocket.latest = this
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

  /** The exchange's reply to one of the messages the line sent. */
  reply(body: unknown): void {
    this.fire("message", { data: JSON.stringify(body) })
  }
}

/** Signs in and subscribes, the way a healthy line does within a tick. */
function comeUp(socket: FakeSocket): void {
  socket.fire("open")
  socket.reply({ id: 1, error: null, result: { status: "success" } })
  socket.reply({ id: 2, error: null, result: { status: "success" } })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-22T12:00:00Z"))
  FakeSocket.latest = null
  clearPhemexTouched()
  vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
  closePhemexPrivateFeeds()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("what the private line will and will not vouch for", () => {
  it("says nothing at all until it has signed in and subscribed", () => {
    const before = Date.now()
    // The very first ask opens the socket and is answered honestly: nobody was
    // watching a moment ago, so nobody can say what happened then.
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, before)).toBe(false)

    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    socket.fire("open")
    // Signed in but not subscribed: the exchange is not sending order events
    // yet, so its silence proves nothing.
    socket.reply({ id: 1, error: null, result: { status: "success" } })
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, before)).toBe(false)
  })

  it("vouches for a stretch it watched all the way through", () => {
    phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    comeUp(socket)

    vi.advanceTimersByTime(1_000)
    const readAt = Date.now()
    vi.advanceTimersByTime(5_000)
    // Nothing was pushed between the read and now, and the line was watching
    // the whole time.
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(true)
  })

  it("refuses a stretch that started before it was watching", () => {
    const longBefore = Date.now() - 60_000
    phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, longBefore)
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    comeUp(socket)
    // The line is healthy now, and still cannot say what happened an hour ago.
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, longBefore)).toBe(
      false
    )
  })

  it("stops vouching the moment an order event arrives", () => {
    phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    comeUp(socket)

    vi.advanceTimersByTime(1_000)
    const readAt = Date.now()
    vi.advanceTimersByTime(1_000)
    socket.reply({
      type: "incremental",
      orders_p: [{ orderID: "abc", ordStatus: "Filled" }],
    })
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(false)
  })

  it("does not ring its own bell for a message carrying no orders", () => {
    phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    comeUp(socket)

    vi.advanceTimersByTime(1_000)
    const readAt = Date.now()
    vi.advanceTimersByTime(1_000)
    // Market chatter rides the same socket, and an empty array is the exchange
    // saying nothing happened.
    socket.reply({ index_market24h: { symbol: ".USDT" }, timestamp: 1 })
    socket.reply({ type: "incremental", orders_p: [] })
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(true)
  })

  it("stops vouching when this app itself changes an order", () => {
    phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    comeUp(socket)

    vi.advanceTimersByTime(1_000)
    const readAt = Date.now()
    vi.advanceTimersByTime(1_000)
    // The exchange will push this too, a moment from now. A moment is long
    // enough to be told the account is quiet and skip the read that would have
    // shown the order just placed.
    phemexTouched()
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(false)
  })

  it("stops vouching once the socket has gone quiet for too long", () => {
    phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    comeUp(socket)

    vi.advanceTimersByTime(1_000)
    const readAt = Date.now()
    // Past the heartbeat window with not a word. A dead socket is silent in
    // exactly the same way a quiet account is, and only one of those is safe.
    vi.advanceTimersByTime(31_000)
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(false)
  })

  it("stops vouching after the line drops, even once it is back", () => {
    phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const first = FakeSocket.latest
    if (!first) throw new Error("expected a socket")
    comeUp(first)

    vi.advanceTimersByTime(1_000)
    const readAt = Date.now()
    first.fire("close")
    // Something may have happened while nobody was looking, and there is no
    // way to find out which.
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(false)

    vi.advanceTimersByTime(5_000)
    const second = FakeSocket.latest
    if (second && second !== first) comeUp(second)
    // Watching again, but only from now — the gap is still a gap.
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(false)
  })

  it("reads the credential only when it signs in, and never keeps it", () => {
    // **`wallet-auth.ts` states the rule: decrypted per call, never cached.**
    // A line lives for hours and re-signs on every reconnect, so it holds the
    // way to read a credential rather than the credential itself.
    const reads = vi.fn(CREDENTIAL)
    phemexQuietSince("mainnet", KEY_ID, reads, Date.now())
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    // Making the line does not open the secret. Signing in does.
    expect(reads).not.toHaveBeenCalled()
    socket.fire("open")
    expect(reads).toHaveBeenCalledTimes(1)
    // And nothing anywhere in the line is holding what came back.
    expect(JSON.stringify(socket.sent)).not.toContain("s3cret")
  })

  it("never signs in when the credential cannot be read", () => {
    phemexQuietSince("mainnet", KEY_ID, () => null, Date.now())
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    socket.fire("open")
    // No signature could be made, so the line goes rather than sitting open
    // and silent. Every read falls back to asking, which refuses out loud.
    expect(socket.sent).toEqual([])
    expect(socket.closed).toBe(true)
    expect(
      phemexQuietSince("mainnet", KEY_ID, () => null, Date.now() - 1)
    ).toBe(false)
  })

  it("keeps trying when the very first socket refuses to open", () => {
    // A line that gave up here would stay safe — no socket, so it never
    // vouches — and would quietly never save a request again, which is the
    // most expensive kind of silence.
    vi.stubGlobal("WebSocket", function Refuses(): never {
      throw new Error("no socket for you")
    })
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())).toBe(
      false
    )
    expect(FakeSocket.latest).toBeNull()

    // The retry clock is running, so a later tick gets a real socket.
    vi.stubGlobal("WebSocket", FakeSocket)
    vi.advanceTimersByTime(10_000)
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a retry to open a socket")
    comeUp(socket)
    const readAt = Date.now()
    vi.advanceTimersByTime(2_000)
    expect(phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, readAt)).toBe(true)
  })

  it("drops the line when the exchange refuses the key", () => {
    phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now())
    const socket = FakeSocket.latest
    if (!socket) throw new Error("expected a socket")
    socket.fire("open")
    socket.reply({ id: 1, error: { code: 6012, message: "auth failed" } })
    expect(socket.closed).toBe(true)
    // And it never subscribed, so it can never be believed.
    expect(
      phemexQuietSince("mainnet", KEY_ID, CREDENTIAL, Date.now() - 1)
    ).toBe(false)
  })
})
