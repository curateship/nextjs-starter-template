import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The CRM's reply store (CRM task 38, parts 1 and 5): Send waits ten seconds
 * with Undo, a refused send puts everything back, and the words stay saved on
 * the server until the reply has really gone.
 */

const api = vi.hoisted(() => ({
  sendReply: vi.fn(async () => ({ messageId: "m-1", reopened: false })),
  startConversation: vi.fn(async () => ({ threadId: "t-new", leadExisted: false })),
  loadReplyDrafts: vi.fn(async () => ({}) as Record<string, string>),
  saveReplyDraftToServer: vi.fn(async () => ({ saved: true })),
}))
const toast = vi.hoisted(() => ({ showErrorToast: vi.fn() }))

vi.mock("@/lib/api/crm/inbox", () => ({
  ...api,
  getCrmErrorMessage: (error: unknown) => String(error),
}))
vi.mock("@/lib/toast/error-toast", () => toast)

async function freshStore() {
  vi.resetModules()
  return import("@/components/crm/reply-store")
}

beforeEach(() => {
  vi.useFakeTimers()
  for (const fn of Object.values(api)) fn.mockClear()
  toast.showErrorToast.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("undo send", () => {
  it("holds the reply ten seconds, then sends it once with its files", async () => {
    const store = await freshStore()
    const sent = vi.fn()
    const off = store.listenReplySent(sent)
    store.changeReplyDraft("t-1", "Hi Jane")
    store.holdReply("t-1", "Hi Jane", [{ kind: "media", url: "https://cdn/x/plan.png", name: "plan.png" }])

    expect(store.readReplyStore().pending["t-1"]?.body).toBe("Hi Jane")
    expect(store.readReplyStore().drafts["t-1"]).toBeUndefined()
    // The words are saved the moment Send is pressed, so a shut tab keeps them.
    expect(api.saveReplyDraftToServer).toHaveBeenCalledWith("t-1", "Hi Jane")

    await vi.advanceTimersByTimeAsync(9_999)
    expect(api.sendReply).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.sendReply).toHaveBeenCalledOnce()
    expect(api.sendReply).toHaveBeenCalledWith("t-1", "Hi Jane", ["https://cdn/x/plan.png"], [])
    expect(store.readReplyStore().pending["t-1"]).toBeUndefined()
    expect(sent).toHaveBeenCalledWith({ kind: "reply", threadId: "t-1" })
    off()
  })

  it("Undo sends nothing and puts the words and files back", async () => {
    const store = await freshStore()
    const file = { kind: "media" as const, url: "https://cdn/x/plan.png", name: "plan.png" }
    store.holdReply("t-1", "Hi Jane", [file])
    await vi.advanceTimersByTimeAsync(4_000)
    store.undoHeldReply("t-1")
    await vi.advanceTimersByTimeAsync(20_000)

    expect(api.sendReply).not.toHaveBeenCalled()
    expect(store.readReplyStore().drafts["t-1"]).toBe("Hi Jane")
    expect(store.readReplyStore().files["t-1"]).toEqual([file])
  })

  it("keeps words typed during the wait, after the reply's own", async () => {
    const store = await freshStore()
    store.holdReply("t-1", "Hi Jane", [])
    store.changeReplyDraft("t-1", "PS")
    store.undoHeldReply("t-1")
    expect(store.readReplyStore().drafts["t-1"]).toBe("Hi Jane\n\nPS")
  })

  it("keeps the waiting reply's words on the server when more is typed during the wait", async () => {
    const store = await freshStore()
    store.holdReply("t-1", "Hi Jane", [])
    api.saveReplyDraftToServer.mockClear()
    store.changeReplyDraft("t-1", "PS")
    await vi.advanceTimersByTimeAsync(1_000)
    expect(api.saveReplyDraftToServer).toHaveBeenCalledWith("t-1", "Hi Jane\n\nPS")
  })

  it("a refused send puts everything back with the reason", async () => {
    const store = await freshStore()
    api.sendReply.mockRejectedValueOnce(new Error("CRM_SEND_REFUSED: nope"))
    store.holdReply("t-1", "Hi Jane", [])
    await vi.advanceTimersByTimeAsync(10_000)

    expect(store.readReplyStore().pending["t-1"]).toBeUndefined()
    expect(store.readReplyStore().drafts["t-1"]).toBe("Hi Jane")
    expect(toast.showErrorToast).toHaveBeenCalledOnce()
  })

  it("does not save an empty box over the words of a reply that is waiting", async () => {
    const store = await freshStore()
    store.holdReply("t-1", "Hi Jane", [])
    api.saveReplyDraftToServer.mockClear()
    store.changeReplyDraft("t-1", "x")
    store.changeReplyDraft("t-1", "")
    await vi.advanceTimersByTimeAsync(1_500)
    expect(api.saveReplyDraftToServer).not.toHaveBeenCalled()
  })

  it("holds a New email the same way, and Undo stops it", async () => {
    const store = await freshStore()
    store.holdNewEmail({ to: "sam@example.com", subject: "Hello", body: "Hi Sam" })
    store.undoHeldNewEmail()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(api.startConversation).not.toHaveBeenCalled()

    const sent = vi.fn()
    store.listenReplySent(sent)
    store.holdNewEmail({ to: "sam@example.com", subject: "Hello", body: "Hi Sam" })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.startConversation).toHaveBeenCalledOnce()
    expect(sent).toHaveBeenCalledWith({ kind: "new-email", threadId: "t-new" })
  })
})

describe("kept drafts", () => {
  it("saves a second after typing stops, the last words only", async () => {
    const store = await freshStore()
    store.changeReplyDraft("t-1", "Hi")
    await vi.advanceTimersByTimeAsync(500)
    store.changeReplyDraft("t-1", "Hi Jane")
    await vi.advanceTimersByTimeAsync(999)
    expect(api.saveReplyDraftToServer).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.saveReplyDraftToServer).toHaveBeenCalledOnce()
    expect(api.saveReplyDraftToServer).toHaveBeenCalledWith("t-1", "Hi Jane")
  })
})
