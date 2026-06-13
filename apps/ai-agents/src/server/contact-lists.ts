import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  aiAgentsContactListMembers,
  aiAgentsContactLists,
  aiAgentsContacts,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { requireUserWorkspace } from "@/server/workspace-context"

export type ContactListItem = {
  id: string
  name: string
  member_count: number
  created_at: string
}

export type ContactListResponse = {
  lists: ContactListItem[]
}

export async function listContactListsForCurrentUser(): Promise<ContactListResponse> {
  const { workspace } = await requireUserWorkspace()
  const rows = await db
    .select({
      list: aiAgentsContactLists,
      memberCount: sql<number>`count(${aiAgentsContactListMembers.id})::int`,
    })
    .from(aiAgentsContactLists)
    .leftJoin(
      aiAgentsContactListMembers,
      eq(aiAgentsContactListMembers.listId, aiAgentsContactLists.id)
    )
    .where(eq(aiAgentsContactLists.workspaceId, workspace.id))
    .groupBy(aiAgentsContactLists.id)
    .orderBy(asc(aiAgentsContactLists.name))
  return {
    lists: rows.map(({ list, memberCount }) => ({
      id: list.id,
      name: list.name,
      member_count: memberCount,
      created_at: list.createdAt.toISOString(),
    })),
  }
}

export async function createContactListForCurrentUser(
  name: string
): Promise<ContactListItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const createdAt = now()
  const [row] = await db
    .insert(aiAgentsContactLists)
    .values({
      id: uuid(),
      workspaceId: workspace.id,
      name,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  return {
    id: row.id,
    name: row.name,
    member_count: 0,
    created_at: row.createdAt.toISOString(),
  }
}

export async function renameContactListForCurrentUser(
  listId: string,
  name: string
): Promise<void> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const updated = await db
    .update(aiAgentsContactLists)
    .set({ name, updatedAt: now() })
    .where(
      and(
        eq(aiAgentsContactLists.workspaceId, workspace.id),
        eq(aiAgentsContactLists.id, listId)
      )
    )
    .returning({ id: aiAgentsContactLists.id })
  if (updated.length === 0) {
    throw new Error("List not found")
  }
}

// Deletes the list and its memberships; contacts themselves are untouched.
export async function deleteContactListForCurrentUser(
  listId: string
): Promise<void> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const deleted = await db
    .delete(aiAgentsContactLists)
    .where(
      and(
        eq(aiAgentsContactLists.workspaceId, workspace.id),
        eq(aiAgentsContactLists.id, listId)
      )
    )
    .returning({ id: aiAgentsContactLists.id })
  if (deleted.length === 0) {
    throw new Error("List not found")
  }
}

// Resolves a list owned by the current workspace or throws.
export async function requireWorkspaceList(workspaceId: string, listId: string) {
  const [list] = await db
    .select()
    .from(aiAgentsContactLists)
    .where(
      and(
        eq(aiAgentsContactLists.workspaceId, workspaceId),
        eq(aiAgentsContactLists.id, listId)
      )
    )
    .limit(1)
  if (!list) {
    throw new Error("List not found")
  }
  return list
}

export async function addContactsToListForCurrentUser(
  listId: string,
  contactIds: string[]
): Promise<{ addedCount: number }> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  await requireWorkspaceList(workspace.id, listId)

  // Only contacts belonging to this workspace can be added.
  const ownedContacts = await db
    .select({ id: aiAgentsContacts.id })
    .from(aiAgentsContacts)
    .where(
      and(
        eq(aiAgentsContacts.workspaceId, workspace.id),
        inArray(aiAgentsContacts.id, contactIds)
      )
    )
  if (ownedContacts.length === 0) {
    return { addedCount: 0 }
  }

  const createdAt = now()
  const inserted = await db
    .insert(aiAgentsContactListMembers)
    .values(
      ownedContacts.map((contact) => ({
        id: uuid(),
        workspaceId: workspace.id,
        listId,
        contactId: contact.id,
        createdAt,
      }))
    )
    .onConflictDoNothing()
    .returning({ id: aiAgentsContactListMembers.id })
  return { addedCount: inserted.length }
}

export async function removeContactsFromListForCurrentUser(
  listId: string,
  contactIds: string[]
): Promise<{ removedCount: number }> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  await requireWorkspaceList(workspace.id, listId)
  const removed = await db
    .delete(aiAgentsContactListMembers)
    .where(
      and(
        eq(aiAgentsContactListMembers.listId, listId),
        inArray(aiAgentsContactListMembers.contactId, contactIds)
      )
    )
    .returning({ id: aiAgentsContactListMembers.id })
  return { removedCount: removed.length }
}
