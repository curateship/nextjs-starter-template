// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { AppHeaderAction } from "@/lib/app-options"

const state = vi.hoisted(() => ({ action: null as AppHeaderAction | null }))
vi.mock("@/lib/app-options", () => ({
  appHeaderLeftContentForRole: () => state.action,
}))
vi.mock("@/components/shell/sticky-header/sticky-header-left-nav", () => ({
  StickyHeaderLeftNav: () => <a>Home</a>,
}))
import { AppHeaderLeftContent } from "@/components/shell/sticky-header/app-header-left-content"

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  root = createRoot(host)
  state.action = null
})
afterEach(async () => {
  await act(async () => root.unmount())
})

it("keeps the sidebar navigation when there is no app content", async () => {
  await act(async () =>
    root.render(<AppHeaderLeftContent role="member" navLinks={[]} />)
  )
  expect(host.textContent).toBe("Home")
})

it("hands empty app content the original sidebar navigation", async () => {
  state.action = {
    id: "test",
    label: "Test",
    icon: () => null,
    component: async () => ({ default: ({ fallback }) => <>{fallback}</> }),
  }
  await act(async () =>
    root.render(<AppHeaderLeftContent role="member" navLinks={[]} />)
  )
  expect(host.textContent).toBe("Home")
})

it("replaces the links with loaded app content", async () => {
  state.action = {
    id: "test",
    label: "Test",
    icon: () => null,
    component: async () => ({
      default: ({ role }) => <span>{role} pins</span>,
    }),
  }
  await act(async () =>
    root.render(<AppHeaderLeftContent role="member" navLinks={[]} />)
  )
  expect(host.textContent).toBe("member pins")
})
