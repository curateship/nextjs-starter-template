// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it } from "vitest"
import type {
  AppHeaderLeftContent as AppHeaderLeftContentOption,
} from "@/lib/app-options"

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

it("hands empty app content the chosen top left", async () => {
  const action: AppHeaderLeftContentOption = {
    component: async () => ({ default: ({ fallback }) => <>{fallback}</> }),
  }
  await act(async () =>
    root.render(
      <AppHeaderLeftContent action={action} role="member" fallback={<a>Home</a>} />
    )
  )
  expect(host.textContent).toBe("Home")
})

it("keeps the chosen top left visible while app content loads", async () => {
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
      <AppHeaderLeftContent action={action} role="member" fallback={<a>Home</a>} />
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
      <AppHeaderLeftContent action={action} role="member" fallback={<a>Home</a>} />
    )
  )
  expect(host.textContent).toBe("member pins")
})
