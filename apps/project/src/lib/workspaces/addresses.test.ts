import { describe, expect, it } from "vitest"

import { workspacePublicOrigin } from "@/lib/workspaces/addresses"

/**
 * Where an open button sends an admin: the site being edited, on the machine
 * it is being edited on.
 */
describe("workspacePublicOrigin", () => {
  const joes = { subdomain: "joes", customDomain: "joes.com" }
  const plain = { subdomain: "plain", customDomain: "" }

  it("opens a site's own domain from a deployment", () => {
    expect(workspacePublicOrigin(joes, "example.com", "https://example.com")).toBe(
      "https://joes.com"
    )
  })

  it("never opens a site's own domain from localhost, which would show the live site", () => {
    expect(workspacePublicOrigin(joes, "localhost", "http://localhost:3019")).toBe(
      "http://joes.localhost:3019"
    )
  })

  it("opens the subdomain, on this machine's protocol and port, for a site with no domain", () => {
    expect(workspacePublicOrigin(plain, "localhost", "http://localhost:3019")).toBe(
      "http://plain.localhost:3019"
    )
    expect(workspacePublicOrigin(plain, "example.com", "https://example.com")).toBe(
      "https://plain.example.com"
    )
  })

  it("leaves the path on this host when the deployment serves one site", () => {
    expect(workspacePublicOrigin(plain, "", "http://localhost:3002")).toBe("")
  })

  it("still answers while the server draws the page and has no browser to ask", () => {
    expect(workspacePublicOrigin(plain, "localhost", "")).toBe("http://plain.localhost")
    expect(workspacePublicOrigin(plain, "example.com", "")).toBe("https://plain.example.com")
  })
})
