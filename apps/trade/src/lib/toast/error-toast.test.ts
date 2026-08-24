import { beforeEach, describe, expect, it, vi } from "vitest"

const { dismiss, error } = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { dismiss, error } }))
vi.mock("@tanstack/react-router", () => ({ useRouterState: vi.fn() }))

const { dismissErrorToast, showErrorToast } =
  await import("@/lib/toast/error-toast")

beforeEach(() => {
  dismissErrorToast()
  vi.clearAllMocks()
})

describe("the shared error toast", () => {
  it("does not dismiss a newer error when an older request recovers", () => {
    error.mockReturnValueOnce("older").mockReturnValueOnce("newer")

    const older = showErrorToast("Older failure")
    showErrorToast("Newer failure")
    dismiss.mockClear()

    dismissErrorToast(older)

    expect(dismiss).not.toHaveBeenCalled()
  })
})
