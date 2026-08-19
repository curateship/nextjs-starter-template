import { createServerFn } from "@tanstack/react-start"

import type {
  CredentialForm,
  NetworkId,
  ProtocolCapabilities,
  ProtocolId,
} from "@/lib/protocols/contracts"
import { userGet } from "@/server/guards"
import { listProtocols } from "@/server/protocols/registry"

/**
 * The exchanges this build ships, as data a screen can draw.
 *
 * The wallet dialog is the customer: it needs to offer "which exchange is
 * this wallet on?" and then draw that exchange's own sign-in fields — labels,
 * a passphrase where one is demanded, help copy — without ever comparing a
 * protocol id, which the fence forbids. So the registry's descriptions travel
 * to the browser as plain data. No secrets live anywhere near this: the form
 * says what to ASK for, never what anyone answered.
 */
export type ProtocolDescription = {
  id: ProtocolId
  label: string
  networks: readonly NetworkId[]
  defaultNetwork: NetworkId
  capabilities: ProtocolCapabilities
  /** Present exactly where accounts are — how a wallet there signs in. */
  credentialForm: CredentialForm | null
}

const loadProtocolsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async (): Promise<{ protocols: ProtocolDescription[] }> => {
    return {
      protocols: listProtocols().map((entry) => ({
        id: entry.id,
        label: entry.label,
        networks: entry.networks,
        defaultNetwork: entry.defaultNetwork,
        capabilities: entry.capabilities,
        credentialForm: entry.credentials?.form ?? null,
      })),
    }
  })

export function loadProtocols() {
  return loadProtocolsFn()
}
