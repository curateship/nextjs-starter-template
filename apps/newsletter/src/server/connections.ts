import { createHash, randomBytes } from "node:crypto"

import { and, desc, eq, isNull } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { newsletterConnections } from "@/server/schema"
import { now, uuid } from "@/server/security"

export const CONNECTION_SECRET_PREFIX = "nlk_"
const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/

export function isValidAppKey(value: string) {
  return APP_KEY_PATTERN.test(value)
}

function hashConnectionSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex")
}

/**
 * Creates a connection key for a source app. The plaintext secret is returned
 * exactly once — only its sha256 hash is stored.
 */
export async function createConnection(
  workspaceId: string,
  input: { name: string; appKey: string },
  database: CustomShellDb = db
) {
  const name = input.name.trim()
  if (!name) throw new Error("Connection name is required")

  const appKey = input.appKey.trim().toLowerCase()
  if (!isValidAppKey(appKey)) {
    throw new Error(
      "App key must be 2-64 lowercase letters, digits, or dashes"
    )
  }

  const secret = CONNECTION_SECRET_PREFIX + randomBytes(24).toString("hex")
  const createdAt = now()
  const [connection] = await database
    .insert(newsletterConnections)
    .values({
      id: uuid(),
      workspaceId,
      name: name.slice(0, 255),
      appKey,
      secretHash: hashConnectionSecret(secret),
      secretPrefix: secret.slice(0, 12),
      createdAt,
    })
    .returning()

  if (!connection) throw new Error("Connection was not created")
  return { connection, secret }
}

export async function findConnectionBySecret(
  secret: string,
  database: CustomShellDb = db
) {
  if (!secret.startsWith(CONNECTION_SECRET_PREFIX)) return null

  const [connection] = await database
    .select()
    .from(newsletterConnections)
    .where(
      and(
        eq(newsletterConnections.secretHash, hashConnectionSecret(secret)),
        isNull(newsletterConnections.revokedAt)
      )
    )
    .limit(1)

  if (!connection) return null

  void database
    .update(newsletterConnections)
    .set({ lastUsedAt: now() })
    .where(eq(newsletterConnections.id, connection.id))
    .then(
      () => {},
      () => {}
    )

  return connection
}

export async function listConnections(
  workspaceId: string,
  database: CustomShellDb = db
) {
  return database
    .select()
    .from(newsletterConnections)
    .where(eq(newsletterConnections.workspaceId, workspaceId))
    .orderBy(desc(newsletterConnections.createdAt))
}

export async function revokeConnection(
  workspaceId: string,
  connectionId: string,
  database: CustomShellDb = db
) {
  const [revoked] = await database
    .update(newsletterConnections)
    .set({ revokedAt: now() })
    .where(
      and(
        eq(newsletterConnections.id, connectionId),
        eq(newsletterConnections.workspaceId, workspaceId),
        isNull(newsletterConnections.revokedAt)
      )
    )
    .returning({ id: newsletterConnections.id })

  if (!revoked) throw new Error("Connection not found")
  return revoked
}
