import { expect, it } from "vitest"

import { loadProtocols } from "@/lib/api/protocols"
import { listProtocols } from "@/server/protocols/registry"

it("ships the same public exchange descriptions as the server adapters", async () => {
  const browser = (await loadProtocols()).protocols
  const server = listProtocols().map((entry) => ({
    id: entry.id,
    label: entry.label,
    networks: entry.networks,
    defaultNetwork: entry.defaultNetwork,
    capabilities: entry.capabilities,
    credentialForm: entry.credentials?.form ?? null,
  }))

  expect(browser).toEqual(server)
})
