import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type ProxyItem = {
  id: string
  label: string
  type: "residential" | "mobile" | "datacenter"
  host: string
  port: number
  username: string | null
  country: string | null
  created_at: string
}

export type ProxyListResponse = { proxies: ProxyItem[] }

const createProxySchema = z.object({
  label: z.string().min(1).max(255),
  type: z.enum(["residential", "mobile", "datacenter"]),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(255).optional(),
  password: z.string().max(1024).optional(),
  country: z.string().max(2).optional(),
})

const updateProxySchema = createProxySchema.extend({
  proxyId: z.string().min(1),
})

const deleteProxySchema = z.object({ proxyId: z.string().min(1) })

export function getProxyErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Proxy request failed."
}

const loadProxiesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProxyListResponse> => {
    const user = await requireUser()
    return proxyListForUser(user.id)
  }
)

const createProxyFn = createServerFn({ method: "POST" })
  .inputValidator(createProxySchema)
  .handler(async ({ data }): Promise<ProxyListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { createUserProxy } = await import("@/server/proxies")
    requireAppOrigin()
    const user = await requireUser()
    await createUserProxy(user.id, data)
    return proxyListForUser(user.id)
  })

const updateProxyFn = createServerFn({ method: "POST" })
  .inputValidator(updateProxySchema)
  .handler(async ({ data }): Promise<ProxyListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { updateUserProxy } = await import("@/server/proxies")
    requireAppOrigin()
    const user = await requireUser()
    const { proxyId, ...input } = data
    await updateUserProxy(user.id, proxyId, input)
    return proxyListForUser(user.id)
  })

const deleteProxyFn = createServerFn({ method: "POST" })
  .inputValidator(deleteProxySchema)
  .handler(async ({ data }): Promise<ProxyListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { deleteUserProxy } = await import("@/server/proxies")
    requireAppOrigin()
    const user = await requireUser()
    await deleteUserProxy(user.id, data.proxyId)
    return proxyListForUser(user.id)
  })

export function loadProxies() {
  return loadProxiesFn()
}

export function createProxy(input: {
  label: string
  type: ProxyItem["type"]
  host: string
  port: number
  username?: string
  password?: string
  country?: string
}) {
  return createProxyFn({ data: input })
}

export function updateProxy(
  proxyId: string,
  input: {
    label: string
    type: ProxyItem["type"]
    host: string
    port: number
    username?: string
    password?: string
    country?: string
  }
) {
  return updateProxyFn({ data: { proxyId, ...input } })
}

export function deleteProxy(proxyId: string) {
  return deleteProxyFn({ data: { proxyId } })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing session")
  }
  return user
}

async function proxyListForUser(userId: string): Promise<ProxyListResponse> {
  const { listUserProxies, serializeProxy } = await import("@/server/proxies")
  const proxies = await listUserProxies(userId)
  return { proxies: proxies.map(serializeProxy) }
}
