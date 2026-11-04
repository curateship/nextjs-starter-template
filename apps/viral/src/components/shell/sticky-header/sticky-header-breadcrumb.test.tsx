// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
import { StickyHeaderBreadcrumb } from "@/components/shell/sticky-header/sticky-header-breadcrumb"

const steps = [
  { label: "Automations", href: "/admin/automations", icon: "workflow" },
  { label: "Templates", href: "/admin/automations/templates" },
  { label: "Welcome series" },
]

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
function setWidth(width: number) {
  Object.assign(window, { innerWidth: width })
  window.matchMedia = vi.fn().mockReturnValue({
    matches: width < 768,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
})

it("links every step but the page you are on", async () => {
  setWidth(1280)
  await act(async () => root.render(<StickyHeaderBreadcrumb steps={steps} />))

  const links = Array.from(host.querySelectorAll("a")).map((a) => a.textContent)
  expect(links).toEqual(["Automations", "Templates"])
  const current = host.querySelector('[aria-current="page"]')
  expect(current?.textContent).toBe("Welcome series")
  expect(current?.tagName).toBe("SPAN")
})

it("folds the middle into … on a phone, keeping the first and last", async () => {
  setWidth(390)
  await act(async () => root.render(<StickyHeaderBreadcrumb steps={steps} />))

  expect(host.textContent).toContain("Automations")
  expect(host.textContent).toContain("Welcome series")
  expect(host.textContent).not.toContain("Templates")
  expect(host.querySelector('[aria-label="1 more step"]')).not.toBeNull()
})

it("keeps a two-step trail whole on a phone", async () => {
  setWidth(390)
  await act(async () =>
    root.render(<StickyHeaderBreadcrumb steps={[steps[0], steps[2]]} />)
  )
  expect(host.querySelector('[aria-label$="more step"]')).toBeNull()
  expect(host.textContent).toContain("Automations")
})

it("draws nothing for an empty trail", async () => {
  setWidth(1280)
  await act(async () => root.render(<StickyHeaderBreadcrumb steps={[]} />))
  expect(host.innerHTML).toBe("")
})
