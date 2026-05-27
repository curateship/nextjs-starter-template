import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { workspaces } from "@/server/schema"
import { now } from "@/server/security"
import {
  getOrCreateCurrentWorkspace,
  parseWorkspaceSettings,
} from "@/server/workspaces"

const TOKEN_HASH_REGEX = /^[a-f0-9]{64}$/

export function createPublicReadToken() {
  return randomBytes(32).toString("base64url")
}

export function hashPublicReadToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function isPublicReadTokenHash(value: unknown): value is string {
  return typeof value === "string" && TOKEN_HASH_REGEX.test(value)
}

export function publicReadTokenMatches(expectedHash: string, token: string) {
  if (!isPublicReadTokenHash(expectedHash)) return false

  const actual = Buffer.from(hashPublicReadToken(token), "hex")
  const expected = Buffer.from(expectedHash, "hex")

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function getWorkspacePublicReadTokenHash(workspaceId: string) {
  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace) return null

  return parseWorkspaceSettings(workspace.settings).publicReadTokenHash ?? null
}

export async function replaceCurrentWorkspacePublicReadToken(
  userId: string,
  tokenHash: string
) {
  if (!isPublicReadTokenHash(tokenHash)) {
    throw new Error("Invalid token hash.")
  }

  const workspace = await getOrCreateCurrentWorkspace(userId)
  const settings = parseWorkspaceSettings(workspace.settings)
  const [updated] = await db
    .update(workspaces)
    .set({
      settings: {
        ...settings,
        publicReadTokenHash: tokenHash,
      },
      updatedAt: now(),
    })
    .where(and(eq(workspaces.id, workspace.id), eq(workspaces.userId, userId)))
    .returning()

  if (!updated) throw new Error("Workspace not found.")

  return updated
}
