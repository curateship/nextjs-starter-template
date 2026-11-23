import { and, asc, count, eq, inArray } from "drizzle-orm"

import {
  DEFAULT_TYPES,
  MAX_TYPES,
  readTypeColor,
  readTypeIcon,
  type ActivityType,
  type BuiltinType,
  type TypeColor,
  type TypeIcon,
} from "@/lib/travel/activity-types"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { travelActivities, travelActivityTypes, travelSavedPlaces, travelTrips } from "@/server/travel/schema"

function toType(row: typeof travelActivityTypes.$inferSelect): ActivityType {
  return {
    id: row.id,
    name: row.name,
    icon: readTypeIcon(row.icon),
    color: readTypeColor(row.color),
    builtin: (row.builtin as BuiltinType | null) ?? null,
    position: row.position,
  }
}

/**
 * The person's activity types, made from the six defaults the first time
 * they're needed. A person who removed some keeps them removed: the defaults
 * only go in when the list is empty, and Other can never be removed.
 */
export async function listTypes(userId: string, database: CustomShellDb = db): Promise<ActivityType[]> {
  const rows = await database
    .select()
    .from(travelActivityTypes)
    .where(eq(travelActivityTypes.ownerUserId, userId))
    .orderBy(asc(travelActivityTypes.position))
  if (rows.length > 0) return rows.map(toType)
  const made = DEFAULT_TYPES.map((type, index) => ({
    id: uuid(),
    ownerUserId: userId,
    name: type.name,
    icon: type.icon,
    color: type.color,
    builtin: type.builtin,
    position: index,
  }))
  await database.insert(travelActivityTypes).values(made)
  return made.map(toType)
}

/** The id of one of the person's built-in types, such as their Hotel. Null when they removed it. */
export async function builtinTypeId(userId: string, builtin: BuiltinType, database: CustomShellDb = db) {
  const types = await listTypes(userId, database)
  return types.find((type) => type.builtin === builtin)?.id ?? null
}

/** A type id the person may put on an activity: their own, or null. */
export async function checkTypeId(userId: string, typeId: string | null | undefined, database: CustomShellDb = db) {
  if (!typeId) return
  const [row] = await database
    .select({ id: travelActivityTypes.id })
    .from(travelActivityTypes)
    .where(and(eq(travelActivityTypes.id, typeId), eq(travelActivityTypes.ownerUserId, userId)))
    .limit(1)
  if (!row) throw new Error(TRAVEL_ERRORS.typeNotFound)
}

export async function createType(
  userId: string,
  input: { name: string; icon: TypeIcon; color: TypeColor },
  database: CustomShellDb = db
) {
  const types = await listTypes(userId, database)
  if (types.length >= MAX_TYPES) throw new Error(TRAVEL_ERRORS.tooManyTypes)
  const row = {
    id: uuid(),
    ownerUserId: userId,
    name: input.name,
    icon: input.icon,
    color: input.color,
    builtin: null,
    position: Math.max(-1, ...types.map((type) => type.position)) + 1,
  }
  await database.insert(travelActivityTypes).values(row)
  return toType(row)
}

export async function updateType(
  userId: string,
  input: { typeId: string; name?: string; icon?: TypeIcon; color?: TypeColor },
  database: CustomShellDb = db
) {
  await checkTypeId(userId, input.typeId, database)
  const { typeId, ...patch } = input
  if (Object.keys(patch).length === 0) return
  await database.update(travelActivityTypes).set(patch).where(eq(travelActivityTypes.id, typeId))
}

/** How many activities and saved places use a type, for the confirm before removing it. */
export async function countTypeUse(userId: string, typeId: string, database: CustomShellDb = db) {
  await checkTypeId(userId, typeId, database)
  const [activities] = await database
    .select({ value: count() })
    .from(travelActivities)
    .where(eq(travelActivities.typeId, typeId))
  return activities?.value ?? 0
}

/**
 * Removing a type moves its activities and saved places to Other first
 * (task part 19), so nothing loses its type silently.
 */
export async function deleteType(userId: string, typeId: string, database: CustomShellDb = db) {
  await checkTypeId(userId, typeId, database)
  const types = await listTypes(userId, database)
  const other = types.find((type) => type.builtin === "other")
  if (!other) throw new Error(TRAVEL_ERRORS.typeNotFound)
  if (other.id === typeId) throw new Error(TRAVEL_ERRORS.otherTypeStays)
  await database.transaction(async (tx) => {
    const tripIds = (
      await tx.select({ id: travelTrips.id }).from(travelTrips).where(eq(travelTrips.ownerUserId, userId))
    ).map((trip) => trip.id)
    if (tripIds.length > 0) {
      await tx
        .update(travelActivities)
        .set({ typeId: other.id, updatedAt: now() })
        .where(and(eq(travelActivities.typeId, typeId), inArray(travelActivities.tripId, tripIds)))
    }
    await tx
      .update(travelSavedPlaces)
      .set({ typeId: other.id })
      .where(and(eq(travelSavedPlaces.typeId, typeId), eq(travelSavedPlaces.ownerUserId, userId)))
    await tx.delete(travelActivityTypes).where(eq(travelActivityTypes.id, typeId))
  })
}

/** Puts the types in the order given. Ids that aren't the person's are ignored. */
export async function reorderTypes(userId: string, typeIds: string[], database: CustomShellDb = db) {
  const types = await listTypes(userId, database)
  const own = new Set(types.map((type) => type.id))
  await database.transaction(async (tx) => {
    let position = 0
    for (const typeId of typeIds) {
      if (!own.has(typeId)) continue
      await tx.update(travelActivityTypes).set({ position: position++ }).where(eq(travelActivityTypes.id, typeId))
    }
  })
}
