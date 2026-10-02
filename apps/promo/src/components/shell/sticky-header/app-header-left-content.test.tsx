// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type {
  AppHeaderLeftContent as AppHeaderLeftContentOption,
} from "@/lib/app-options"

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
})
afterEach(async () => {
  await act(async () => root.unmount())
})

it("hands empty app content the original sidebar navigation", async () => {
  const action: AppHeaderLeftContentOption = {
    component: async () => ({ default: ({ fallback }) => <>{fallback}</> }),
  }
  await act(async () =>
    root.render(
      <AppHeaderLeftContent action={action} role="member" navLinks={[]} />
    )
  )
  expect(host.textContent).toBe("Home")
})

it("keeps the sidebar navigation visible while app content loads", async () => {
  let finishLoading!: (
    value: Awaited<ReturnType<AppHeaderLeftContentOption["component"]>>
  ) => void
  const action: AppHeaderLeftContentOption = {
    component: () =>
      new Promise((resolve) => {
        finishLoading = resolve
      }),
  }

  await act(async () =>
    root.render(
      <AppHeaderLeftContent action={action} role="member" navLinks={[]} />
    )
  )
  expect(host.textContent).toBe("Home")

  await act(async () => {
    finishLoading({ default: () => <span>Loaded pins</span> })
  })
  expect(host.textContent).toBe("Loaded pins")
})

it("replaces the links with loaded app content", async () => {
  const action: AppHeaderLeftContentOption = {
    component: async () => ({
      default: ({ role }) => <span>{role} pins</span>,
    }),
  }
  await act(async () =>
    root.render(
      <AppHeaderLeftContent action={action} role="member" navLinks={[]} />
    )
  )
  expect(host.textContent).toBe("member pins")
})
