// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/events/sign-ups", () => ({
  getSignUpErrorMessage: () => "That did not go through. Please try again.",
  signUp: vi.fn(),
}))
// A real router is a page. What is being proved here is what the box says and
// which button it offers, so invalidating is only a call that happened.
const invalidate = vi.fn()
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}))

import { signUp } from "@/lib/api/events/sign-ups"
import { SignUpBox } from "@/components/events/public/sign-up-box"
import type { SignUpBox as SignUpBoxState } from "@/lib/api/events/public"

/**
 * The event page's sign-up box, in the states a visitor meets: seats left,
 * full with a waiting list, and what each of the server's three yeses reads
 * as. The server itself is `server/events/waiting-list.test.ts`.
 */

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

const openWithSeats: SignUpBoxState = {
  seats: 20,
  left: 12,
  full: false,
  closed: false,
  waitingList: false,
}
const fullWithQueue: SignUpBoxState = {
  seats: 20,
  left: 0,
  full: true,
  closed: false,
  waitingList: true,
}
const closed: SignUpBoxState = {
  seats: 20,
  left: 0,
  full: true,
  closed: true,
  waitingList: false,
}

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  vi.mocked(signUp).mockReset()
  invalidate.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function draw(box: SignUpBoxState) {
  act(() => {
    root.render(<SignUpBox eventId="event-1" box={box} />)
  })
}

function text() {
  return host.textContent ?? ""
}

function button() {
  return host.querySelector<HTMLButtonElement>("button[type=submit]")
}

function type(id: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`#${id}`)!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!
    setter.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function send() {
  type("sign-up-name", "Sam")
  type("sign-up-email", "sam@example.com")
  await act(async () => {
    button()!.click()
  })
}

describe("the states of the box", () => {
  it("offers a plain sign-up while seats are left", () => {
    draw(openWithSeats)
    expect(text()).toContain("12 of 20 seats left")
    expect(button()?.textContent).toBe("Sign up")
  })

  it("offers the waiting list once every seat is taken", () => {
    draw(fullWithQueue)
    expect(text()).toContain("Full")
    expect(text()).toContain(
      "Every seat is taken. Join the waiting list and we'll email you if one frees up."
    )
    expect(button()?.textContent).toBe("Join the waiting list")
  })

  it("takes no names once the event has started", () => {
    draw(closed)
    expect(text()).toContain("Sign-ups have closed.")
    expect(button()).toBeNull()
  })
})

describe("what the server's answer reads as", () => {
  it("says you have a seat", async () => {
    vi.mocked(signUp).mockResolvedValue({ done: "signed-up" })
    draw(openWithSeats)
    await send()
    expect(text()).toContain("You're on the list, Sam.")
    expect(button()).toBeNull()
    expect(invalidate).toHaveBeenCalled()
  })

  it("says your place in the queue", async () => {
    vi.mocked(signUp).mockResolvedValue({ done: "waiting", place: 3 })
    draw(fullWithQueue)
    await send()
    expect(text()).toContain(
      "You're 3rd on the waiting list, Sam. We'll email you if a seat frees up."
    )
    expect(button()).toBeNull()
  })

  it("says the link is already in your email", async () => {
    vi.mocked(signUp).mockResolvedValue({ done: "offered" })
    draw(fullWithQueue)
    await send()
    expect(text()).toContain(
      "A seat has already come free for you. The link to claim it is in your email."
    )
  })

  it("keeps the form and reads the box again when the answer is no", async () => {
    vi.mocked(signUp).mockResolvedValue({
      done: false,
      problem: "Sign-ups have closed. The event has started.",
    })
    draw(fullWithQueue)
    await send()
    expect(button()).not.toBeNull()
    expect(invalidate).toHaveBeenCalled()
  })
})
