import type { FormEvent, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}))

vi.mock("@/components/shell/auth-shell", () => ({
  authLinkClassName: "auth-link",
  AuthShell: ({
    title,
    description,
    footer,
    children,
  }: {
    title: string
    description?: string
    footer?: ReactNode
    children: ReactNode
    onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
      {footer}
    </main>
  ),
}))

import { visitorRouteErrorComponent } from "@/components/shell/route-error"

describe("visitorRouteErrorComponent", () => {
  it("keeps a failed page in the signed-out frame with retry and sign-in paths", () => {
    const RouteError = visitorRouteErrorComponent()
    const markup = renderToStaticMarkup(
      <RouteError error={new Error("private detail")} reset={vi.fn()} />
    )

    expect(markup).toContain("This page could not be loaded")
    expect(markup).toContain("The page did not finish loading.")
    expect(markup).toContain("Try again")
    expect(markup).toContain('href="/login"')
    expect(markup).not.toContain("private detail")
  })
})
