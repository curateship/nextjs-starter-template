import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  createProxy,
  deleteProxies,
  importProxies,
  listProxies,
  testProxy,
  updateProxy,
  type ImportProblem,
  type ProxyView,
} from "@/server/browser/proxies"
import {
  PROXY_KINDS,
  PROXY_PROTOCOLS,
  type ProxyTestResult,
} from "@/lib/social/options"

import { createErrorMessage } from "../error-message"

export type { ImportProblem, ProxyView }

/**
 * The Proxies dashboard's endpoints. Every one is admin-only and scoped to
 * the signed-in person, and none ever returns a proxy password.
 */

export const getProxyErrorMessage = createErrorMessage(
  {
    "has to be a number": "A proxy port has to be a number between 1 and 65535.",
    "needs a host": "A proxy needs a host.",
    "resolve to a public address":
      "That proxy host points back inside the network, so it was refused.",
    "does not exist": "That proxy is not there any more. Refresh the list.",
    "no proxies in that paste": "There are no proxies in that paste.",
    "at most": "One paste can hold at most 500 proxies.",
    ENCRYPTION_NOT_CONFIGURED:
      "A proxy password cannot be stored until CUSTOM_SHELL_SECRET_ENCRYPTION_KEY is set.",
  },
  "That did not work. Please try again."
)

const proxyInput = z.object({
  label: z.string().trim().max(120).default(""),
  kind: z.enum(PROXY_KINDS),
  protocol: z.enum(PROXY_PROTOCOLS),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65_535),
  username: z.string().trim().max(255).default(""),
  /** Left out entirely to keep whatever password is stored. */
  password: z.string().max(500).optional(),
})

export type ProxyFormInput = z.input<typeof proxyInput>

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ProxyView[]> => listProxies(context.user.id))

export function loadProxies() {
  return listFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).nullable(), proxy: proxyInput }))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    if (data.id) {
      await updateProxy(context.user.id, data.id, data.proxy)
      return { id: data.id }
    }
    return { id: await createProxy(context.user.id, data.proxy) }
  })

export function saveProxy(id: string | null, proxy: ProxyFormInput) {
  return saveFn({ data: { id, proxy } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }))
  .handler(async ({ context, data }) => deleteProxies(context.user.id, data.ids))

export function removeProxies(ids: string[]) {
  return deleteFn({ data: { ids } })
}

const importFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ text: z.string().max(100_000) }))
  .handler(
    async ({ context, data }): Promise<{ added: number; problems: ImportProblem[] }> =>
      importProxies(context.user.id, data.text)
  )

export function pasteProxies(text: string) {
  return importFn({ data: { text } })
}

const testFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<ProxyTestResult> =>
    testProxy(context.user.id, data.id)
  )

export function runProxyTest(id: string) {
  return testFn({ data: { id } })
}
