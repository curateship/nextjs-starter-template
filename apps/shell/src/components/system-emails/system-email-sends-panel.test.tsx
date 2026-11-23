import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/email/system-emails", () => ({
  getSystemEmailErrorMessage: (error: unknown) => String(error),
  loadSystemEmailSends: vi.fn(),
}))

import { SystemEmailSendsPanel } from "@/components/system-emails/system-email-sends-panel"

describe("SystemEmailSendsPanel", () => {
  it("uses the shared title header for Recent sends", () => {
    const markup = renderToStaticMarkup(
      <SystemEmailSendsPanel kind="verify-email" refreshToken={0} />
    )

    expect(markup).toContain('data-slot="dashboard-card-header"')
    expect(markup).toMatch(/<h2[^>]*>Recent sends<\/h2>/)
    expect(markup).toContain("Looking…")
  })
})
