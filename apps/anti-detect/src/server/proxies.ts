import { and, desc, eq } from "drizzle-orm"

import { db, type Db } from "@/server/db"
import { decryptSecret, encryptSecret } from "@/server/encryption"
import { createAlert } from "@/server/notifications"
import {
  testProxyConnection,
  type ProxyProtocol,
  type ProxyTestResult,
} from "@/server/proxy-test"
import { proxies, type Proxy } from "@/server/schema"
import { now, uuid } from "@/server/security"

// True only on the ok/untested -> dead transition, so repeated failing tests
// (manual clicks or a periodic sweep) don't re-alert for an already-dead proxy.
export function proxyBecameDead(
  previous: ProxyTestResult | null | undefined,
  current: ProxyTestResult
) {
  return !current.ok && previous?.ok !== false
}

export type ProxyType = "residential" | "mobile" | "datacenter"

export type ProxyInput = {
  label: string
  type: ProxyType
  protocol: ProxyProtocol
  host: string
  port: number
  username?: string | null
  password?: string | null
  country?: string | null
}

// All queries filter by userId — that filter IS the ownership check.
export async function listUserProxies(
  userId: string,
  database: Db = db
) {
  return database
    .select()
    .from(proxies)
    .where(eq(proxies.userId, userId))
    .orderBy(desc(proxies.createdAt))
}

export async function createUserProxy(
  userId: string,
  input: ProxyInput,
  database: Db = db
) {
  const label = input.label.trim()
  const host = input.host.trim()
  if (!label) throw new Error("Proxy label is required")
  if (!host) throw new Error("Proxy host is required")
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error("Proxy port must be between 1 and 65535")
  }

  const createdAt = now()
  const [proxy] = await database
    .insert(proxies)
    .values({
      id: uuid(),
      userId,
      label: label.slice(0, 255),
      type: input.type,
      protocol: input.protocol,
      host: host.slice(0, 255),
      port: input.port,
      username: input.username?.trim()
        ? input.username.trim().slice(0, 255)
        : null,
      // Encrypted at rest (AES-256-GCM); decrypted only when handed to the engine.
      password: encryptSecret(input.password),
      country: input.country?.trim()
        ? input.country.trim().slice(0, 2).toUpperCase()
        : null,
      lastTestedAt: null,
      lastTestResult: null,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!proxy) throw new Error("Proxy was not created")
  return proxy
}

export async function updateUserProxy(
  userId: string,
  proxyId: string,
  input: ProxyInput,
  database: Db = db
) {
  const label = input.label.trim()
  const host = input.host.trim()
  if (!label) throw new Error("Proxy label is required")
  if (!host) throw new Error("Proxy host is required")
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error("Proxy port must be between 1 and 65535")
  }

  const updates = {
    label: label.slice(0, 255),
    type: input.type,
    protocol: input.protocol,
    host: host.slice(0, 255),
    port: input.port,
    username: input.username?.trim()
      ? input.username.trim().slice(0, 255)
      : null,
    country: input.country?.trim()
      ? input.country.trim().slice(0, 2).toUpperCase()
      : null,
    updatedAt: now(),
    // Only replace the password when a new one is supplied — blank keeps the current.
    ...(input.password ? { password: encryptSecret(input.password) } : {}),
  }

  // The userId in the WHERE is the ownership check: a foreign id updates 0 rows.
  const [proxy] = await database
    .update(proxies)
    .set(updates)
    .where(and(eq(proxies.id, proxyId), eq(proxies.userId, userId)))
    .returning()

  if (!proxy) throw new Error("Proxy not found")
  return proxy
}

export async function deleteUserProxy(
  userId: string,
  proxyId: string,
  database: Db = db
) {
  const [deleted] = await database
    .delete(proxies)
    .where(
      and(
        eq(proxies.id, proxyId),
        eq(proxies.userId, userId)
      )
    )
    .returning({ id: proxies.id })

  if (!deleted) throw new Error("Proxy not found")
  return { proxyId: deleted.id }
}

export function serializeProxy(row: Proxy) {
  // password is intentionally NOT included — secrets never reach the client.
  return {
    id: row.id,
    label: row.label,
    type: row.type as ProxyType,
    protocol: row.protocol as ProxyProtocol,
    host: row.host,
    port: row.port,
    username: row.username,
    country: row.country,
    // last_test_result holds no secrets — safe to surface so the UI can badge it.
    last_test_result: (row.lastTestResult as ProxyTestResult | null) ?? null,
    last_tested_at: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  }
}

// Routes a probe through the proxy, records the result, and (when the proxy has
// no country set yet) back-fills it from a successful geo lookup. Ownership is
// the userId in the WHERE — a foreign id finds nothing and throws.
export async function testUserProxy(
  userId: string,
  proxyId: string,
  database: Db = db
): Promise<ProxyTestResult> {
  const [proxy] = await database
    .select()
    .from(proxies)
    .where(and(eq(proxies.id, proxyId), eq(proxies.userId, userId)))
    .limit(1)
  if (!proxy) throw new Error("Proxy not found")

  const previousResult = proxy.lastTestResult as ProxyTestResult | null
  const result = await testProxyConnection({
    protocol: (proxy.protocol as ProxyProtocol) ?? "http",
    host: proxy.host,
    port: proxy.port,
    username: proxy.username,
    password: decryptSecret(proxy.password),
  })

  const testedAt = now()
  await database
    .update(proxies)
    .set({
      lastTestedAt: testedAt,
      lastTestResult: result,
      updatedAt: testedAt,
      // Non-destructive geo-detect: only fill country when it was blank.
      ...(result.ok && result.country && !proxy.country
        ? { country: result.country }
        : {}),
    })
    .where(and(eq(proxies.id, proxyId), eq(proxies.userId, userId)))

  if (proxyBecameDead(previousResult, result)) {
    await createAlert({
      recipientUserId: userId,
      type: "proxy_dead",
      severity: "warning",
      title: `Proxy “${proxy.label}” is not responding`,
      body: result.ok ? undefined : result.error,
      entityType: "proxy",
      entityId: proxyId,
      metadata: { latencyMs: result.latencyMs },
      database,
    })
  }

  return result
}

// Bulk-imports proxies from pasted "host:port:user:pass" lines (user:pass
// optional; colons in the password are preserved). Defaults type=residential,
// protocol=http, label=host — all editable afterward. All-or-nothing: one bad
// line throws before anything is inserted.
export async function createUserProxiesBulk(
  userId: string,
  text: string,
  database: Db = db
) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) throw new Error("No proxies to import")
  if (lines.length > 500) throw new Error("Import is limited to 500 proxies at once")

  const createdAt = now()
  const rows = lines.map((line) => {
    const parts = line.split(":")
    if (parts.length < 2) {
      throw new Error(`Invalid line (need host:port): ${line}`)
    }
    const [host, portStr, username, ...passwordParts] = parts
    const port = Number.parseInt(portStr, 10)
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid host or port: ${line}`)
    }
    const password = passwordParts.join(":") || null
    return {
      id: uuid(),
      userId,
      label: host.slice(0, 255),
      type: "residential" as ProxyType,
      protocol: "http" as ProxyProtocol,
      host: host.slice(0, 255),
      port,
      username: username ? username.slice(0, 255) : null,
      password: encryptSecret(password),
      country: null,
      lastTestedAt: null,
      lastTestResult: null,
      createdAt,
      updatedAt: createdAt,
    }
  })

  await database.insert(proxies).values(rows)
  return { imported: rows.length }
}
