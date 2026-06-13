import { and, eq, inArray, sql } from "drizzle-orm"

import {
  createContactListForCurrentUser,
  requireWorkspaceList,
} from "@/server/contact-lists"
import { normalizePhone } from "@/server/contacts"
import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  aiAgentsContactListMembers,
  aiAgentsContacts,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { requireUserWorkspace } from "@/server/workspace-context"

export type ImportRowInput = {
  firstName: string
  lastName: string | null
  phone: string
  email: string | null
  customFields: Record<string, string>
}

export type ImportContactsInput = {
  rows: ImportRowInput[]
  // Add imported contacts to an existing list, or create one by name.
  listId: string | null
  newListName: string | null
}

export type ImportSkippedRow = {
  // 1-based data row number (matching the CSV minus its header).
  row: number
  reason: string
}

export type ImportContactsResult = {
  created: number
  updated: number
  skipped: ImportSkippedRow[]
  listId: string | null
  listName: string | null
}

const INSERT_CHUNK_SIZE = 500

// Custom field keys become {{variables}} in agent prompts, so they must be
// identifier-shaped. The mapping UI sanitizes; this is the backstop.
const CUSTOM_FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

export async function importContactsForCurrentUser(
  input: ImportContactsInput
): Promise<ImportContactsResult> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()

  for (const row of input.rows) {
    for (const key of Object.keys(row.customFields)) {
      if (!CUSTOM_FIELD_KEY_PATTERN.test(key)) {
        throw new Error(`Invalid custom field name: ${key}`)
      }
    }
  }

  // Resolve the target list up front so a bad list id fails before any writes.
  let listId = input.listId
  let listName: string | null = null
  if (listId) {
    listName = (await requireWorkspaceList(workspace.id, listId)).name
  } else if (input.newListName) {
    const list = await createContactListForCurrentUser(input.newListName)
    listId = list.id
    listName = list.name
  }

  // Normalize phones and drop rows we can't dial. First occurrence of a
  // phone wins; later duplicates within the file are reported as skipped.
  const skipped: ImportSkippedRow[] = []
  const validRows: Array<ImportRowInput & { normalizedPhone: string }> = []
  const seenPhones = new Set<string>()
  input.rows.forEach((row, index) => {
    const rowNumber = index + 1
    let normalizedPhone: string
    try {
      normalizedPhone = normalizePhone(row.phone)
    } catch {
      skipped.push({ row: rowNumber, reason: `Invalid phone: ${row.phone}` })
      return
    }
    if (seenPhones.has(normalizedPhone)) {
      skipped.push({
        row: rowNumber,
        reason: `Duplicate phone in file: ${normalizedPhone}`,
      })
      return
    }
    seenPhones.add(normalizedPhone)
    validRows.push({ ...row, normalizedPhone })
  })

  let created = 0
  let updated = 0
  const affectedContactIds: string[] = []

  await db.transaction(async (tx) => {
    // Which phones already exist? (Needed for counts, affected ids, and the
    // name fallback that only applies to brand-new contacts.)
    const existingRows = validRows.length
      ? await tx
          .select({ id: aiAgentsContacts.id, phone: aiAgentsContacts.phone })
          .from(aiAgentsContacts)
          .where(
            and(
              eq(aiAgentsContacts.workspaceId, workspace.id),
              inArray(
                aiAgentsContacts.phone,
                validRows.map((row) => row.normalizedPhone)
              )
            )
          )
      : []
    const existingIdByPhone = new Map(
      existingRows.map((row) => [row.phone, row.id])
    )

    const timestamp = now()
    const toUpsert = validRows.map((row) => {
      const existingId = existingIdByPhone.get(row.normalizedPhone)
      if (existingId) {
        updated += 1
        affectedContactIds.push(existingId)
      } else {
        created += 1
      }
      return {
        id: uuid(),
        workspaceId: workspace.id,
        // Number-only CSVs are common; new contacts fall back to the phone as
        // the name. Existing contacts keep theirs (the conflict SET below
        // ignores empty incoming names).
        firstName: existingId ? row.firstName : row.firstName || row.normalizedPhone,
        lastName: row.lastName,
        phone: row.normalizedPhone,
        email: row.email,
        customFields: row.customFields,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    })
    affectedContactIds.push(
      ...toUpsert
        .filter((row) => !existingIdByPhone.has(row.phone))
        .map((row) => row.id)
    )

    // One chunked upsert instead of a round trip per re-imported row:
    // non-empty incoming values win, custom fields merge (incoming keys win).
    for (let start = 0; start < toUpsert.length; start += INSERT_CHUNK_SIZE) {
      await tx
        .insert(aiAgentsContacts)
        .values(toUpsert.slice(start, start + INSERT_CHUNK_SIZE))
        .onConflictDoUpdate({
          target: [aiAgentsContacts.workspaceId, aiAgentsContacts.phone],
          set: {
            firstName: sql`COALESCE(NULLIF(excluded.first_name, ''), ${aiAgentsContacts.firstName})`,
            lastName: sql`COALESCE(excluded.last_name, ${aiAgentsContacts.lastName})`,
            email: sql`COALESCE(excluded.email, ${aiAgentsContacts.email})`,
            customFields: sql`${aiAgentsContacts.customFields} || excluded.custom_fields`,
            updatedAt: timestamp,
          },
        })
    }

    if (listId && affectedContactIds.length > 0) {
      const memberRows = affectedContactIds.map((contactId) => ({
        id: uuid(),
        workspaceId: workspace.id,
        listId: listId as string,
        contactId,
        createdAt: timestamp,
      }))
      for (let start = 0; start < memberRows.length; start += INSERT_CHUNK_SIZE) {
        await tx
          .insert(aiAgentsContactListMembers)
          .values(memberRows.slice(start, start + INSERT_CHUNK_SIZE))
          .onConflictDoNothing()
      }
    }
  })

  return { created, updated, skipped, listId, listName }
}
