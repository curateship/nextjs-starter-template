import { createServerFn } from "@tanstack/react-start"
import { desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { proxies, type CoreProxy } from "@/server/schema"
import { findCurrentUser, now, uuid } from "@/server/security"
import {
  cleanHost,
  cleanNullableText,
  encryptProxyPassword,
  isValidPort,
  parseProxyImportLines,
  proxyConnectionTypes,
  proxyProtocols,
  serializeProxy,
  testProxyConnection,
  type ProxyImportLineError,
  type ProxyItem,
} from "@/server/proxies"

export type {
  ProxyConnectionType,
  ProxyImportLineError,
  ProxyItem,
  ProxyProtocol,
  ProxyStatus,
} from "@/server/proxies"

export type ProxyListResponse = {
  proxies: ProxyItem[]
}

export type ProxyImportResponse = {
  created_count: number
  skipped_count: number
  invalid_lines: ProxyImportLineError[]
  proxies: ProxyItem[]
}

const proxyProtocolSchema = z.enum(proxyProtocols)
const proxyConnectionTypeSchema = z.enum(proxyConnectionTypes)

const proxyPayloadSchema = z.object({
  name: z.string().min(1).max(255),
  protocol: proxyProtocolSchema,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(1000).optional(),
  password: z.string().max(2000).optional(),
  connectionType: proxyConnectionTypeSchema.nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  enabled: z.boolean(),
})

const updateProxySchema = proxyPayloadSchema.extend({
  proxyId: z.string().min(1),
})

const proxyIdSchema = z.object({
  proxyId: z.string().min(1),
})

const proxyIdsSchema = z.object({
  proxyIds: z.array(z.string().min(1)).min(1).max(100),
})

const toggleProxySchema = proxyIdSchema.extend({
  enabled: z.boolean(),
})

const importProxySchema = z.object({
  lines: z.string().min(1).max(50_000),
  protocol: proxyProtocolSchema,
  enabled: z.boolean(),
})

export function getProxyErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Proxy request failed."
}

const listProxiesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProxyListResponse> => {
    await requireAdminUser()

    const rows = await db
      .select()
      .from(proxies)
      .orderBy(desc(proxies.createdAt))

    return { proxies: rows.map(serializeProxy) }
  }
)

const createProxyFn = createServerFn({ method: "POST" })
  .inputValidator(proxyPayloadSchema)
  .handler(async ({ data }): Promise<ProxyItem> => {
    requireAppOrigin()
    await requireAdminUser()

    const createdAt = now()
    const [row] = await db
      .insert(proxies)
      .values({
        ...cleanProxyPayload(data),
        id: uuid(),
        lastStatus: "untested",
        createdAt,
        updatedAt: createdAt,
      })
      .returning()

    return serializeProxy(row)
  })

const updateProxyFn = createServerFn({ method: "POST" })
  .inputValidator(updateProxySchema)
  .handler(async ({ data }): Promise<ProxyItem> => {
    requireAppOrigin()
    await requireAdminUser()

    const [existing] = await db
      .select()
      .from(proxies)
      .where(eq(proxies.id, data.proxyId))
      .limit(1)

    if (!existing) {
      throw new Error("Proxy not found.")
    }

    const [row] = await db
      .update(proxies)
      .set({
        ...cleanProxyPayload(data, existing),
        updatedAt: now(),
      })
      .where(eq(proxies.id, data.proxyId))
      .returning()

    return serializeProxy(row)
  })

const deleteProxyFn = createServerFn({ method: "POST" })
  .inputValidator(proxyIdSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdminUser()

    const [row] = await db
      .delete(proxies)
      .where(eq(proxies.id, data.proxyId))
      .returning({ id: proxies.id })

    if (!row) {
      throw new Error("Proxy not found.")
    }

    return { proxyId: row.id }
  })

const deleteProxiesFn = createServerFn({ method: "POST" })
  .inputValidator(proxyIdsSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdminUser()

    const uniqueIds = Array.from(new Set(data.proxyIds))
    const rows = await db
      .delete(proxies)
      .where(inArray(proxies.id, uniqueIds))
      .returning({ id: proxies.id })

    return { proxyIds: rows.map((row) => row.id) }
  })

const toggleProxyFn = createServerFn({ method: "POST" })
  .inputValidator(toggleProxySchema)
  .handler(async ({ data }): Promise<ProxyItem> => {
    requireAppOrigin()
    await requireAdminUser()

    const [row] = await db
      .update(proxies)
      .set({ enabled: data.enabled, updatedAt: now() })
      .where(eq(proxies.id, data.proxyId))
      .returning()

    if (!row) {
      throw new Error("Proxy not found.")
    }

    return serializeProxy(row)
  })

const testProxyFn = createServerFn({ method: "POST" })
  .inputValidator(proxyIdSchema)
  .handler(async ({ data }): Promise<ProxyItem> => {
    requireAppOrigin()
    await requireAdminUser()
    return testAndUpdateProxy(data.proxyId)
  })

const importProxiesFn = createServerFn({ method: "POST" })
  .inputValidator(importProxySchema)
  .handler(async ({ data }): Promise<ProxyImportResponse> => {
    requireAppOrigin()
    await requireAdminUser()

    const parsed = parseProxyImportLines(data.lines)
    const createdRows: CoreProxy[] = []
    let skippedCount = 0

    for (const item of parsed.proxies) {
      const createdAt = now()
      const [row] = await db
        .insert(proxies)
        .values({
          id: uuid(),
          name: `${item.host}:${item.port}`,
          protocol: data.protocol,
          host: item.host,
          port: item.port,
          username: item.username,
          passwordEncrypted: encryptProxyPassword(item.password),
          connectionType: null,
          country: null,
          enabled: data.enabled,
          lastStatus: "untested",
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing({
          target: [proxies.host, proxies.port, proxies.username],
        })
        .returning()

      if (row) {
        createdRows.push(row)
      } else {
        skippedCount += 1
      }
    }

    const testedRows: ProxyItem[] = []
    for (const row of createdRows) {
      testedRows.push(await testAndUpdateProxy(row.id))
    }

    return {
      created_count: testedRows.length,
      skipped_count: skippedCount,
      invalid_lines: parsed.errors,
      proxies: testedRows,
    }
  })

export function listProxies() {
  return listProxiesFn()
}

export function createProxy(data: z.infer<typeof proxyPayloadSchema>) {
  return createProxyFn({ data })
}

export function updateProxy(data: z.infer<typeof updateProxySchema>) {
  return updateProxyFn({ data })
}

export function deleteProxy(proxyId: string) {
  return deleteProxyFn({ data: { proxyId } })
}

export function deleteProxies(proxyIds: string[]) {
  return deleteProxiesFn({ data: { proxyIds } })
}

export function toggleProxy(proxyId: string, enabled: boolean) {
  return toggleProxyFn({ data: { proxyId, enabled } })
}

export function testProxy(proxyId: string) {
  return testProxyFn({ data: { proxyId } })
}

export function importProxies(data: z.infer<typeof importProxySchema>) {
  return importProxiesFn({ data })
}

async function testAndUpdateProxy(proxyId: string) {
  const [row] = await db
    .select()
    .from(proxies)
    .where(eq(proxies.id, proxyId))
    .limit(1)

  if (!row) {
    throw new Error("Proxy not found.")
  }

  const result = await testProxyConnection(row)
  const [updated] = await db
    .update(proxies)
    .set({
      lastStatus: result.status,
      lastCheckedAt: now(),
      lastResponseMs: result.responseMs,
      lastError: result.error,
      country: result.country ?? row.country,
      updatedAt: now(),
    })
    .where(eq(proxies.id, proxyId))
    .returning()

  return serializeProxy(updated)
}

function cleanProxyPayload(
  data: z.infer<typeof proxyPayloadSchema>,
  existing?: CoreProxy
) {
  const name = data.name.trim()
  if (!name) {
    throw new Error("Name is required.")
  }

  const host = cleanHost(data.host)
  if (!host) {
    throw new Error("Host is invalid.")
  }

  if (!isValidPort(data.port)) {
    throw new Error("Port is invalid.")
  }

  const username = data.username?.trim() ?? ""
  const password = data.password?.trim() ?? ""

  return {
    name,
    protocol: data.protocol,
    host,
    port: data.port,
    username,
    passwordEncrypted: password
      ? encryptProxyPassword(password)
      : existing?.passwordEncrypted ?? null,
    connectionType: data.connectionType ?? null,
    country: cleanNullableText(data.country, 100),
    enabled: data.enabled,
  }
}

async function requireAdminUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Core session.")
  }
  if (user.role !== "admin") {
    throw new Error("Not authorized.")
  }
  return user
}
