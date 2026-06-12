import { and, desc, eq } from "drizzle-orm"

import { db, type Db } from "@/server/db"
import { encryptSecret } from "@/server/encryption"
import { proxies, type Proxy } from "@/server/schema"
import { now, uuid } from "@/server/security"

export type ProxyType = "residential" | "mobile" | "datacenter"

export type ProxyInput = {
  label: string
  type: ProxyType
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
    host: row.host,
    port: row.port,
    username: row.username,
    country: row.country,
    created_at: row.createdAt.toISOString(),
  }
}
