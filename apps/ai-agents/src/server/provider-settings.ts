import { and, asc, eq, notInArray, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  getProviderWebhookUrl,
  getVoiceProvider,
  isVoiceProviderConfigured,
} from "@/server/providers"
import { aiAgentsPhoneNumbers } from "@/server/schema"
import { now, uuid } from "@/server/security"
import { requireUserWorkspace } from "@/server/workspace-context"

export type PhoneNumberItem = {
  id: string
  number: string
  name: string | null
  provider: string
}

export type ProviderStatus = {
  configured: boolean
  // Last 4 characters of the key, for display ("••••abcd").
  masked_key: string | null
  webhook_url: string | null
  phone_numbers: PhoneNumberItem[]
}

// Resolves a phone number owned by the workspace or throws.
export async function requireWorkspacePhoneNumber(
  workspaceId: string,
  phoneNumberId: string
) {
  const [row] = await db
    .select()
    .from(aiAgentsPhoneNumbers)
    .where(
      and(
        eq(aiAgentsPhoneNumbers.workspaceId, workspaceId),
        eq(aiAgentsPhoneNumbers.id, phoneNumberId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error("Phone number not found")
  }
  return row
}

async function listWorkspacePhoneNumbers(workspaceId: string) {
  const rows = await db
    .select()
    .from(aiAgentsPhoneNumbers)
    .where(eq(aiAgentsPhoneNumbers.workspaceId, workspaceId))
    .orderBy(asc(aiAgentsPhoneNumbers.number))
  return rows.map(
    (row): PhoneNumberItem => ({
      id: row.id,
      number: row.number,
      name: row.name,
      provider: row.provider,
    })
  )
}

export async function getProviderStatusForCurrentUser(): Promise<ProviderStatus> {
  const { workspace } = await requireUserWorkspace()
  const key = process.env.AI_AGENTS_VAPI_API_KEY
  return {
    configured: isVoiceProviderConfigured(),
    masked_key: key ? `••••${key.slice(-4)}` : null,
    webhook_url: getProviderWebhookUrl() ?? null,
    phone_numbers: await listWorkspacePhoneNumbers(workspace.id),
  }
}

// Cheap end-to-end credentials check: list phone numbers on the provider.
export async function testProviderConnectionForCurrentUser(): Promise<{
  ok: true
  phone_number_count: number
}> {
  await requireUserWorkspace()
  const numbers = await getVoiceProvider().listPhoneNumbers()
  return { ok: true, phone_number_count: numbers.length }
}

// Mirrors the provider's phone numbers into our table: upsert what exists,
// drop local rows the provider no longer has.
export async function syncPhoneNumbersForCurrentUser(): Promise<PhoneNumberItem[]> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const providerNumbers = await getVoiceProvider().listPhoneNumbers()

  const timestamp = now()
  if (providerNumbers.length > 0) {
    await db
      .insert(aiAgentsPhoneNumbers)
      .values(
        providerNumbers.map((entry) => ({
          id: uuid(),
          workspaceId: workspace.id,
          provider: "vapi",
          providerPhoneNumberId: entry.providerPhoneNumberId,
          number: entry.number,
          name: entry.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))
      )
      .onConflictDoUpdate({
        target: [
          aiAgentsPhoneNumbers.workspaceId,
          aiAgentsPhoneNumbers.providerPhoneNumberId,
        ],
        set: {
          number: sql`excluded.number`,
          name: sql`excluded.name`,
          updatedAt: timestamp,
        },
      })
  }

  // Remove numbers deleted on the provider side (campaign FK is restrict, so
  // a number still referenced by a campaign fails loudly instead of vanishing).
  const keepIds = providerNumbers.map((entry) => entry.providerPhoneNumberId)
  if (keepIds.length > 0) {
    await db
      .delete(aiAgentsPhoneNumbers)
      .where(
        and(
          eq(aiAgentsPhoneNumbers.workspaceId, workspace.id),
          notInArray(aiAgentsPhoneNumbers.providerPhoneNumberId, keepIds)
        )
      )
  } else {
    await db
      .delete(aiAgentsPhoneNumbers)
      .where(eq(aiAgentsPhoneNumbers.workspaceId, workspace.id))
  }

  return listWorkspacePhoneNumbers(workspace.id)
}
