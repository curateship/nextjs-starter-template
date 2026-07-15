import { asc, count, desc, eq, inArray } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import type {
  PomoderAdminAction,
  PomoderAdminCreateRecord,
  PomoderAdminLoad,
  PomoderAdminResource,
  PomoderAdminUpdateRecord,
} from "@/server/admin-contract"
import {
  adminAuditLogs,
  focusSessions,
  generationUsage,
  mediaAssets,
  roomBans,
  roomReports,
  rooms,
  sessions,
  storageDeletionJobs,
  subscriptions,
  tasks,
  userPreferences,
  users,
} from "@/server/schema"
import { hashPassword, uuid } from "@/server/security"

type PomoderTransaction = Parameters<Parameters<PomoderDb["transaction"]>[0]>[0]
type AdminDatabase = PomoderDb | PomoderTransaction

const defaultLoad: PomoderAdminLoad = {
  section: "users",
  page: 1,
  pageSize: 25,
}

export async function loadPomoderAdminData(
  query: PomoderAdminLoad = defaultLoad,
  database: PomoderDb = db
) {
  const offset = (query.page - 1) * query.pageSize
  const direction = query.sortDirection === "asc" ? asc : desc
  const userOrder = direction(
    [users.name, users.role, users.emailVerifiedAt, users.id][
      query.sortColumn
    ] ?? users.name
  )
  const taskOrder = direction(
    [users.email, tasks.title, tasks.plannedDate, tasks.status, tasks.id][
      query.sortColumn
    ] ?? users.email
  )
  const focusOrder = direction(
    [
      users.email,
      focusSessions.mode,
      focusSessions.status,
      focusSessions.accumulatedSeconds,
      focusSessions.id,
    ][query.sortColumn] ?? users.email
  )
  const roomOrder = direction(
    [rooms.name, users.email, rooms.phase, rooms.id][query.sortColumn] ??
      rooms.name
  )
  const mediaOrder = direction(
    [
      mediaAssets.name,
      users.email,
      mediaAssets.status,
      mediaAssets.premium,
      mediaAssets.id,
    ][query.sortColumn] ?? mediaAssets.name
  )
  const billingOrder = direction(
    [
      users.email,
      subscriptions.status,
      subscriptions.priceId,
      subscriptions.currentPeriodEnd,
      subscriptions.id,
    ][query.sortColumn] ?? users.email
  )
  const usageOrder = direction(
    [
      users.email,
      generationUsage.month,
      generationUsage.kind,
      generationUsage.completed,
      generationUsage.id,
    ][query.sortColumn] ?? users.email
  )
  const reportOrder = direction(
    [rooms.name, users.email, roomReports.reason, roomReports.id][
      query.sortColumn
    ] ?? rooms.name
  )
  const [
    userRows,
    taskRows,
    focusRows,
    roomRows,
    mediaRows,
    subscriptionRows,
    usageRows,
    reportRows,
    userOptions,
    taskOptions,
    roomOptions,
    total,
  ] = await Promise.all([
    query.section === "users"
      ? database
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            emailVerifiedAt: users.emailVerifiedAt,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(userOrder, asc(users.id))
          .limit(query.pageSize)
          .offset(offset)
      : Promise.resolve([]),
    query.section === "tasks"
      ? database
          .select({ task: tasks, email: users.email })
          .from(tasks)
          .innerJoin(users, eq(tasks.userId, users.id))
          .orderBy(taskOrder, asc(tasks.id))
          .limit(query.pageSize)
          .offset(offset)
      : Promise.resolve([]),
    query.section === "sessions"
      ? database
          .select({ session: focusSessions, email: users.email })
          .from(focusSessions)
          .innerJoin(users, eq(focusSessions.userId, users.id))
          .orderBy(focusOrder, asc(focusSessions.id))
          .limit(query.pageSize)
          .offset(offset)
      : Promise.resolve([]),
    query.section === "rooms"
      ? database
          .select({ room: rooms, hostEmail: users.email })
          .from(rooms)
          .innerJoin(users, eq(rooms.hostUserId, users.id))
          .orderBy(roomOrder, asc(rooms.id))
          .limit(query.pageSize)
          .offset(offset)
      : Promise.resolve([]),
    query.section === "media"
      ? database
          .select({ media: mediaAssets, ownerEmail: users.email })
          .from(mediaAssets)
          .leftJoin(users, eq(mediaAssets.ownerUserId, users.id))
          .orderBy(mediaOrder, asc(mediaAssets.id))
          .limit(query.pageSize)
          .offset(offset)
      : Promise.resolve([]),
    query.section === "billing"
      ? database
          .select({ subscription: subscriptions, email: users.email })
          .from(subscriptions)
          .innerJoin(users, eq(subscriptions.userId, users.id))
          .orderBy(billingOrder, asc(subscriptions.id))
          .limit(query.pageSize)
          .offset(offset)
      : Promise.resolve([]),
    query.section === "ai"
      ? database
          .select({ usage: generationUsage, email: users.email })
          .from(generationUsage)
          .innerJoin(users, eq(generationUsage.userId, users.id))
          .orderBy(usageOrder, asc(generationUsage.id))
          .limit(query.pageSize)
          .offset(offset)
      : Promise.resolve([]),
    query.section === "reports"
      ? database
          .select({
            report: roomReports,
            roomName: rooms.name,
            reporterEmail: users.email,
          })
          .from(roomReports)
          .innerJoin(rooms, eq(roomReports.roomId, rooms.id))
          .innerJoin(users, eq(roomReports.reporterUserId, users.id))
          .orderBy(reportOrder, asc(roomReports.id))
          .limit(query.pageSize)
          .offset(offset)
      : Promise.resolve([]),
    database
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .orderBy(users.email),
    query.section === "tasks" || query.section === "sessions"
      ? database
          .select({ id: tasks.id, title: tasks.title, email: users.email })
          .from(tasks)
          .innerJoin(users, eq(tasks.userId, users.id))
          .orderBy(tasks.title)
      : Promise.resolve([]),
    query.section === "sessions" || query.section === "reports"
      ? database
          .select({ id: rooms.id, name: rooms.name })
          .from(rooms)
          .orderBy(rooms.name)
      : Promise.resolve([]),
    countResource(query.section, database),
  ])

  return {
    users: userRows,
    tasks: taskRows,
    focusSessions: focusRows,
    rooms: roomRows,
    media: mediaRows,
    subscriptions: subscriptionRows,
    generationUsage: usageRows,
    reports: reportRows,
    lookups: { users: userOptions, tasks: taskOptions, rooms: roomOptions },
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}

export async function applyPomoderAdminAction(
  actorId: string,
  action: PomoderAdminAction,
  database: PomoderDb = db
) {
  if (action.type === "create_record") {
    const passwordHash =
      action.record.resource === "users"
        ? await hashPassword(action.record.password)
        : undefined
    await database.transaction(async (tx) => {
      const recordId = await createPomoderAdminRecord(
        action.record,
        tx,
        passwordHash
      )
      await writeAuditLog(tx, actorId, "create", action.record.resource, [
        recordId,
      ])
    })
    return { ok: true }
  }

  if (action.type === "update_record") {
    if (
      action.record.resource === "users" &&
      action.id === actorId &&
      action.record.role !== "admin"
    )
      throw new Error("CANNOT_DEMOTE_SELF")
    const passwordHash =
      action.record.resource === "users" && action.record.password
        ? await hashPassword(action.record.password)
        : undefined
    await database.transaction(async (tx) => {
      await updatePomoderAdminRecord(action.id, action.record, tx, passwordHash)
      if (passwordHash)
        await tx.delete(sessions).where(eq(sessions.userId, action.id))
      await writeAuditLog(tx, actorId, "update", action.record.resource, [
        action.id,
      ])
    })
    return { ok: true }
  }

  if (action.type === "delete_records") {
    const ids = [...new Set(action.ids)]
    if (!ids.length) return { ok: true }
    if (action.resource === "users" && ids.includes(actorId))
      throw new Error("CANNOT_DELETE_SELF")
    await database.transaction(async (tx) => {
      const storageKeys = await findDeletedStorageKeys(action.resource, ids, tx)
      if (storageKeys.length) {
        await tx
          .insert(storageDeletionJobs)
          .values(storageKeys.map((storageKey) => ({ storageKey })))
          .onConflictDoNothing()
      }
      await deleteRecords(action.resource, ids, tx)
      await writeAuditLog(tx, actorId, "delete", action.resource, ids)
    })
    return { ok: true }
  }

  await database.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, action.userId))
    await writeAuditLog(tx, actorId, "revoke_sessions", "users", [
      action.userId,
    ])
  })
  return { ok: true }
}

async function createPomoderAdminRecord(
  record: PomoderAdminCreateRecord,
  database: AdminDatabase,
  passwordHash?: string
) {
  const timestamp = new Date()
  if (record.resource === "users") {
    if (!passwordHash) throw new Error("PASSWORD_HASH_REQUIRED")
    const [user] = await database
      .insert(users)
      .values({
        email: record.email,
        name: record.name,
        role: record.role,
        passwordHash,
        emailVerifiedAt: record.verified ? timestamp : null,
      })
      .returning({ id: users.id })
    await database.insert(userPreferences).values({ userId: user.id })
    return user.id
  }
  if (record.resource === "tasks") {
    const [created] = await database
      .insert(tasks)
      .values({
        userId: record.userId,
        title: record.title,
        plannedDate: record.plannedDate,
        status: record.status,
        pomodoroCount: record.pomodoroCount,
        completedAt: record.status === "completed" ? timestamp : null,
      })
      .returning({ id: tasks.id })
    return created.id
  }
  if (record.resource === "sessions") {
    const [created] = await database
      .insert(focusSessions)
      .values({
        userId: record.userId,
        taskId: record.taskId,
        roomId: record.roomId,
        mode: record.mode,
        status: record.status,
        plannedSeconds: record.plannedSeconds,
        accumulatedSeconds: record.accumulatedSeconds,
        idempotencyKey: `admin-${uuid()}`,
        completedAt: record.status === "completed" ? timestamp : null,
      })
      .returning({ id: focusSessions.id })
    return created.id
  }
  if (record.resource === "rooms") {
    const [created] = await database
      .insert(rooms)
      .values({
        hostUserId: record.hostUserId,
        slug: record.slug,
        name: record.name,
        visibility: record.visibility,
        phase: record.phase,
        focusMinutes: record.focusMinutes,
        shortBreakMinutes: record.shortBreakMinutes,
        longBreakMinutes: record.longBreakMinutes,
        autoStart: record.autoStart,
        closedAt: record.phase === "closed" ? timestamp : null,
      })
      .returning({ id: rooms.id })
    return created.id
  }
  if (record.resource === "media") {
    const [created] = await database
      .insert(mediaAssets)
      .values({
        ownerUserId: record.ownerUserId,
        kind: record.kind,
        source: record.source,
        status: record.status,
        name: record.name,
        storageKey: record.storageKey,
        mimeType: record.mimeType,
        fileSize: record.fileSize,
        premium: record.premium,
      })
      .returning({ id: mediaAssets.id })
    return created.id
  }
  if (record.resource === "billing") {
    const [created] = await database
      .insert(subscriptions)
      .values({
        userId: record.userId,
        stripeCustomerId: record.stripeCustomerId,
        stripeSubscriptionId: record.stripeSubscriptionId,
        status: record.status,
        priceId: record.priceId,
        currentPeriodEnd: record.currentPeriodEnd
          ? new Date(record.currentPeriodEnd)
          : null,
        cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      })
      .returning({ id: subscriptions.id })
    return created.id
  }
  if (record.resource === "ai") {
    const [created] = await database
      .insert(generationUsage)
      .values({
        userId: record.userId,
        month: record.month,
        kind: record.kind,
        reserved: record.reserved,
        completed: record.completed,
        refunded: record.refunded,
      })
      .returning({ id: generationUsage.id })
    return created.id
  }
  const [created] = await database
    .insert(roomReports)
    .values({
      roomId: record.roomId,
      reporterUserId: record.reporterUserId,
      reason: record.reason,
    })
    .returning({ id: roomReports.id })
  return created.id
}

async function updatePomoderAdminRecord(
  recordId: string,
  record: PomoderAdminUpdateRecord,
  database: AdminDatabase,
  passwordHash?: string
) {
  const timestamp = new Date()
  if (record.resource === "users") {
    return requireUpdatedRecord(
      database
        .update(users)
        .set({
          email: record.email,
          name: record.name,
          role: record.role,
          emailVerifiedAt: record.verified ? timestamp : null,
          updatedAt: timestamp,
          ...(passwordHash ? { passwordHash } : {}),
        })
        .where(eq(users.id, recordId))
        .returning({ id: users.id })
    )
  } else if (record.resource === "tasks") {
    return requireUpdatedRecord(
      database
        .update(tasks)
        .set({
          userId: record.userId,
          title: record.title,
          plannedDate: record.plannedDate,
          status: record.status,
          pomodoroCount: record.pomodoroCount,
          completedAt: record.status === "completed" ? timestamp : null,
          updatedAt: timestamp,
        })
        .where(eq(tasks.id, recordId))
        .returning({ id: tasks.id })
    )
  } else if (record.resource === "sessions") {
    return requireUpdatedRecord(
      database
        .update(focusSessions)
        .set({
          userId: record.userId,
          taskId: record.taskId,
          roomId: record.roomId,
          mode: record.mode,
          status: record.status,
          plannedSeconds: record.plannedSeconds,
          accumulatedSeconds: record.accumulatedSeconds,
          completedAt: record.status === "completed" ? timestamp : null,
          updatedAt: timestamp,
        })
        .where(eq(focusSessions.id, recordId))
        .returning({ id: focusSessions.id })
    )
  } else if (record.resource === "rooms") {
    return requireUpdatedRecord(
      database
        .update(rooms)
        .set({
          hostUserId: record.hostUserId,
          slug: record.slug,
          name: record.name,
          visibility: record.visibility,
          phase: record.phase,
          focusMinutes: record.focusMinutes,
          shortBreakMinutes: record.shortBreakMinutes,
          longBreakMinutes: record.longBreakMinutes,
          autoStart: record.autoStart,
          closedAt: record.phase === "closed" ? timestamp : null,
          updatedAt: timestamp,
        })
        .where(eq(rooms.id, recordId))
        .returning({ id: rooms.id })
    )
  } else if (record.resource === "media") {
    return requireUpdatedRecord(
      database
        .update(mediaAssets)
        .set({
          status: record.status,
          name: record.name,
          mimeType: record.mimeType,
          fileSize: record.fileSize,
          premium: record.premium,
          updatedAt: timestamp,
        })
        .where(eq(mediaAssets.id, recordId))
        .returning({ id: mediaAssets.id })
    )
  } else if (record.resource === "billing") {
    return requireUpdatedRecord(
      database
        .update(subscriptions)
        .set({
          userId: record.userId,
          stripeCustomerId: record.stripeCustomerId,
          stripeSubscriptionId: record.stripeSubscriptionId,
          status: record.status,
          priceId: record.priceId,
          currentPeriodEnd: record.currentPeriodEnd
            ? new Date(record.currentPeriodEnd)
            : null,
          cancelAtPeriodEnd: record.cancelAtPeriodEnd,
          updatedAt: timestamp,
        })
        .where(eq(subscriptions.id, recordId))
        .returning({ id: subscriptions.id })
    )
  } else if (record.resource === "ai") {
    return requireUpdatedRecord(
      database
        .update(generationUsage)
        .set({
          userId: record.userId,
          month: record.month,
          kind: record.kind,
          reserved: record.reserved,
          completed: record.completed,
          refunded: record.refunded,
          updatedAt: timestamp,
        })
        .where(eq(generationUsage.id, recordId))
        .returning({ id: generationUsage.id })
    )
  } else {
    return requireUpdatedRecord(
      database
        .update(roomReports)
        .set({
          roomId: record.roomId,
          reporterUserId: record.reporterUserId,
          reason: record.reason,
        })
        .where(eq(roomReports.id, recordId))
        .returning({ id: roomReports.id })
    )
  }
}

async function requireUpdatedRecord(
  operation: PromiseLike<Array<{ id: string }>>
) {
  const [updated] = await operation
  if (!updated) throw new Error("RECORD_NOT_FOUND")
}

async function deleteRecords(
  resource: PomoderAdminResource,
  ids: string[],
  database: AdminDatabase
) {
  if (resource === "users") {
    await database.delete(roomBans).where(inArray(roomBans.bannedByUserId, ids))
    await database.delete(users).where(inArray(users.id, ids))
  } else if (resource === "tasks")
    await database.delete(tasks).where(inArray(tasks.id, ids))
  else if (resource === "sessions")
    await database.delete(focusSessions).where(inArray(focusSessions.id, ids))
  else if (resource === "rooms")
    await database.delete(rooms).where(inArray(rooms.id, ids))
  else if (resource === "media")
    await database.delete(mediaAssets).where(inArray(mediaAssets.id, ids))
  else if (resource === "billing")
    await database.delete(subscriptions).where(inArray(subscriptions.id, ids))
  else if (resource === "ai")
    await database
      .delete(generationUsage)
      .where(inArray(generationUsage.id, ids))
  else await database.delete(roomReports).where(inArray(roomReports.id, ids))
}

async function findDeletedStorageKeys(
  resource: PomoderAdminResource,
  ids: string[],
  database: AdminDatabase
) {
  if (resource !== "media" && resource !== "users") return []
  if (resource === "users") {
    await database
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, ids))
      .for("update")
  }
  const where =
    resource === "media"
      ? inArray(mediaAssets.id, ids)
      : inArray(mediaAssets.ownerUserId, ids)
  const rows = await database
    .select({
      storageKey: mediaAssets.storageKey,
      thumbnailKey: mediaAssets.thumbnailKey,
    })
    .from(mediaAssets)
    .where(where)
    .for("update")
  return [
    ...new Set(
      rows
        .flatMap(({ storageKey, thumbnailKey }) => [storageKey, thumbnailKey])
        .filter((key): key is string => Boolean(key))
    ),
  ]
}

async function writeAuditLog(
  database: AdminDatabase,
  actorId: string,
  action: string,
  resource: PomoderAdminResource,
  recordIds: string[]
) {
  await database
    .insert(adminAuditLogs)
    .values({ actorUserId: actorId, action, resource, recordIds })
}

async function countResource(
  resource: PomoderAdminResource,
  database: PomoderDb
) {
  const table =
    resource === "users"
      ? users
      : resource === "tasks"
        ? tasks
        : resource === "sessions"
          ? focusSessions
          : resource === "rooms"
            ? rooms
            : resource === "media"
              ? mediaAssets
              : resource === "billing"
                ? subscriptions
                : resource === "ai"
                  ? generationUsage
                  : roomReports
  const [row] = await database.select({ value: count() }).from(table)
  return row?.value ?? 0
}
