import { and, asc, countDistinct, eq, inArray, isNotNull, max, ne, sql, type SQL } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS, runsTheTeam, type ProjectColor, type TeamRole } from "@/lib/project/rules"
import {
  canChangeField,
  canChangeTaskType,
  cleanFieldValue,
  fillInFirst,
  firstMissingField,
  onlyWhoCanChange,
  readFieldValue,
  type FieldChoice,
  type FieldKind,
  type FieldRule,
  type FieldSettings,
  type FieldValues,
  type WhoCanChange,
} from "@/lib/project/task-fields"
import type { TaskType, TaskTypeChip, TaskTypeField, TypeIcon } from "@/lib/project/task-types"
import { placesAfterReorder } from "@/lib/project/task-order"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findMembership,
  isProjectMember,
  requireProjectSettings,
  requireTaskAccess,
  requireTeamRunner,
  type Membership,
  type ProjectDb,
  type ProjectRow,
  type TaskRow,
} from "@/server/project/access"
import { fieldTeam, typeTeam } from "@/server/project/record-team"
import { requireSharedProject } from "@/server/project/personal"
import { writeTaskNotices } from "@/server/project/notices"
import {
  projectProjects,
  projectTaskFieldValues,
  projectTaskFiles,
  projectTaskFollowers,
  projectTaskTypeFields,
  projectTaskTypes,
  projectTasks,
} from "@/server/project/schema"
import {
  listFieldFiles,
  removeFieldFilesFromStorage,
  type FileStorage,
  type TaskFile,
} from "@/server/project/task-files"

/**
 * Task types: a team's own kinds of task, each with its own fields. Only the
 * owner and admins make and change types and their fields (Tyler, 11 Oct
 * 2026). A type is archived, never deleted, so its tasks keep their type and
 * their values. Anyone who can change a task picks its type and fills its
 * fields, except a field limited to the person assigned or to whoever handed
 * the task out. The rules for each kind of field are in
 * `src/lib/project/task-fields.ts`.
 */

type TypeRow = typeof projectTaskTypes.$inferSelect
type FieldRow = typeof projectTaskTypeFields.$inferSelect

function toField(row: FieldRow): TaskTypeField {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    neededBeforeDone: row.neededBeforeDone,
    neededWhenMade: row.neededWhenMade,
    whoCanChange: row.whoCanChange,
    settings: row.settings ?? {},
  }
}

function toChip(row: Pick<TypeRow, "id" | "name" | "icon" | "color">): TaskTypeChip {
  return { id: row.id, name: row.name, icon: row.icon as TypeIcon, color: row.color }
}

/** Every type in the team, in its order, archived ones included, each with its fields. */
export async function listTeamTypes(
  teamId: string,
  database: ProjectDb = db,
  { withUse = false }: { withUse?: boolean } = {}
): Promise<TaskType[]> {
  const types = await database
    .select()
    .from(projectTaskTypes)
    .where(eq(projectTaskTypes.teamId, teamId))
    .orderBy(asc(projectTaskTypes.position), asc(projectTaskTypes.createdAt))
  if (types.length === 0) return []
  const fields = await database
    .select()
    .from(projectTaskTypeFields)
    .where(
      inArray(
        projectTaskTypeFields.typeId,
        types.map((type) => type.id)
      )
    )
    .orderBy(asc(projectTaskTypeFields.position), asc(projectTaskTypeFields.createdAt))
  const use = withUse ? await fieldUse(fields.map((field) => field.id), database) : null
  return types.map((type) => ({
    ...toChip(type),
    archived: Boolean(type.archivedAt),
    steps: type.steps,
    notes: type.notes,
    fields: fields
      .filter((field) => field.typeId === type.id)
      .map((field) => ({ ...toField(field), ...(use ? { inUse: use.get(field.id) ?? 0 } : null) })),
  }))
}

/** How many tasks have a value or a file in each field. */
async function fieldUse(fieldIds: string[], database: ProjectDb) {
  const use = new Map<string, number>()
  if (fieldIds.length === 0) return use
  const values = await database
    .select({ fieldId: projectTaskFieldValues.fieldId, tasks: countDistinct(projectTaskFieldValues.taskId) })
    .from(projectTaskFieldValues)
    .where(inArray(projectTaskFieldValues.fieldId, fieldIds))
    .groupBy(projectTaskFieldValues.fieldId)
  const files = await database
    .select({ fieldId: projectTaskFiles.fieldId, tasks: countDistinct(projectTaskFiles.taskId) })
    .from(projectTaskFiles)
    .where(inArray(projectTaskFiles.fieldId, fieldIds))
    .groupBy(projectTaskFiles.fieldId)
  for (const row of [...values, ...files]) {
    if (row.fieldId) use.set(row.fieldId, (use.get(row.fieldId) ?? 0) + row.tasks)
  }
  return use
}

/**
 * The Task types dashboard: every type in the team, archived ones included,
 * with their fields. Everyone on the team reads it; the owner and admins
 * change it, and only they are told how many tasks use each field, since
 * that counts tasks in projects a member can't see. Null when the person
 * isn't on a team yet.
 */
export async function loadTaskTypesPage(
  userId: string,
  database = db
): Promise<{ myRole: TeamRole; types: TaskType[] } | null> {
  const membership = await findMembership(userId, database)
  if (!membership) return null
  return {
    myRole: membership.role,
    types: await listTeamTypes(membership.teamId, database, { withUse: runsTheTeam(membership.role) }),
  }
}

async function requireTeamType(teamId: string, typeId: string, database: ProjectDb) {
  const [type] = await database
    .select()
    .from(projectTaskTypes)
    .where(and(eq(projectTaskTypes.id, typeId), eq(projectTaskTypes.teamId, teamId)))
    .limit(1)
  if (!type) throw new Error(PROJECT_ERRORS.typeNotFound)
  return type
}

async function requireTeamField(teamId: string, fieldId: string, database: ProjectDb) {
  const [row] = await database
    .select({ field: projectTaskTypeFields })
    .from(projectTaskTypeFields)
    .innerJoin(projectTaskTypes, eq(projectTaskTypes.id, projectTaskTypeFields.typeId))
    .where(and(eq(projectTaskTypeFields.id, fieldId), eq(projectTaskTypes.teamId, teamId)))
    .limit(1)
  if (!row) throw new Error(PROJECT_ERRORS.fieldNotFound)
  return row.field
}

async function requireTypeNameFree(teamId: string, name: string, database: ProjectDb, exceptId?: string) {
  const [taken] = await database
    .select({ id: projectTaskTypes.id })
    .from(projectTaskTypes)
    .where(
      and(
        eq(projectTaskTypes.teamId, teamId),
        sql`lower(${projectTaskTypes.name}) = lower(${name})`,
        exceptId ? ne(projectTaskTypes.id, exceptId) : undefined
      )
    )
    .limit(1)
  if (taken) throw new Error(PROJECT_ERRORS.typeNameTaken)
}

async function requireFieldNameFree(typeId: string, name: string, database: ProjectDb, exceptId?: string) {
  const [taken] = await database
    .select({ id: projectTaskTypeFields.id })
    .from(projectTaskTypeFields)
    .where(
      and(
        eq(projectTaskTypeFields.typeId, typeId),
        sql`lower(${projectTaskTypeFields.name}) = lower(${name})`,
        exceptId ? ne(projectTaskTypeFields.id, exceptId) : undefined
      )
    )
    .limit(1)
  if (taken) throw new Error(PROJECT_ERRORS.fieldNameTaken)
}

export async function createTaskType(
  userId: string,
  input: { name: string; icon: TypeIcon; color: ProjectColor },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx)
    const [{ total, last }] = await tx
      .select({ total: countDistinct(projectTaskTypes.id), last: max(projectTaskTypes.position) })
      .from(projectTaskTypes)
      .where(eq(projectTaskTypes.teamId, membership.teamId))
    if (total >= LIMITS.typesPerTeam) throw new Error(PROJECT_ERRORS.tooManyTypes)
    await requireTypeNameFree(membership.teamId, input.name, tx)
    const id = uuid()
    await tx.insert(projectTaskTypes).values({
      id,
      teamId: membership.teamId,
      name: input.name,
      icon: input.icon,
      color: input.color,
      position: (last ?? 0) + 1,
      createdByUserId: userId,
      createdAt: now(),
    })
    return { id }
  })
}

export async function updateTaskType(
  userId: string,
  input: {
    typeId: string
    name?: string
    icon?: TypeIcon
    color?: ProjectColor
    steps?: string[]
    notes?: string
  },
  database = db
) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx, await typeTeam(userId, input.typeId, tx))
    await requireTeamType(membership.teamId, input.typeId, tx)
    const { typeId, ...fields } = input
    if (fields.name) await requireTypeNameFree(membership.teamId, fields.name, tx, typeId)
    if (Object.values(fields).every((value) => value === undefined)) return
    await tx.update(projectTaskTypes).set(fields).where(eq(projectTaskTypes.id, typeId))
  })
}

/**
 * Archive takes the type out of New task and every type picker. Its tasks
 * keep the type and every value, and Bring back undoes it.
 */
export async function archiveTaskType(
  userId: string,
  input: { typeId: string; archived: boolean },
  database = db
) {
  const membership = await requireTeamRunner(userId, database, await typeTeam(userId, input.typeId, database))
  await requireTeamType(membership.teamId, input.typeId, database)
  await database
    .update(projectTaskTypes)
    .set({ archivedAt: input.archived ? now() : null })
    .where(eq(projectTaskTypes.id, input.typeId))
}

/** These types in this order, among the places they already held. */
export async function reorderTaskTypes(userId: string, ids: string[], database = db) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx)
    const wanted = [...new Set(ids)]
    const rows = await tx
      .select({ id: projectTaskTypes.id, position: projectTaskTypes.position })
      .from(projectTaskTypes)
      .where(and(inArray(projectTaskTypes.id, wanted), eq(projectTaskTypes.teamId, membership.teamId)))
    if (rows.length !== wanted.length) throw new Error(PROJECT_ERRORS.typeNotFound)
    const places = placesAfterReorder(rows, wanted)
    for (const row of rows) {
      const place = places.get(row.id)!
      if (place !== row.position) {
        await tx.update(projectTaskTypes).set({ position: place }).where(eq(projectTaskTypes.id, row.id))
      }
    }
  })
}

export async function createTypeField(
  userId: string,
  input: { typeId: string; name: string; kind: FieldKind },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx, await typeTeam(userId, input.typeId, tx))
    await requireTeamType(membership.teamId, input.typeId, tx)
    const [{ total, last }] = await tx
      .select({ total: countDistinct(projectTaskTypeFields.id), last: max(projectTaskTypeFields.position) })
      .from(projectTaskTypeFields)
      .where(eq(projectTaskTypeFields.typeId, input.typeId))
    if (total >= LIMITS.fieldsPerType) throw new Error(PROJECT_ERRORS.tooManyFields)
    await requireFieldNameFree(input.typeId, input.name, tx)
    const id = uuid()
    await tx.insert(projectTaskTypeFields).values({
      id,
      typeId: input.typeId,
      name: input.name,
      kind: input.kind,
      position: (last ?? 0) + 1,
      settings: input.kind === "dropdown" ? { choices: [] } : {},
      createdAt: now(),
    })
    return { id }
  })
}

/** Removed choices kept for old values, at most this many, newest kept. */
const REMOVED_CHOICES_KEPT = 100

/**
 * One field's name, kind, switches, who can change it, "Show only when" and
 * a dropdown's choices. The kind is fixed once any task has a value in it.
 * A choice left out of `choices` is removed, but stays for the values that
 * picked it; a field that showed only when that choice was picked now always
 * shows.
 */
export async function updateTypeField(
  userId: string,
  input: {
    fieldId: string
    name?: string
    kind?: FieldKind
    neededBeforeDone?: boolean
    neededWhenMade?: boolean
    whoCanChange?: WhoCanChange
    showWhen?: { fieldId: string; choiceId: string } | null
    choices?: { id?: string; name: string }[]
  },
  database = db
) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx, await fieldTeam(userId, input.fieldId, tx))
    const field = await requireTeamField(membership.teamId, input.fieldId, tx)
    const siblings = (
      await tx.select().from(projectTaskTypeFields).where(eq(projectTaskTypeFields.typeId, field.typeId))
    ).map(toField)
    const kind = input.kind ?? field.kind
    const settings: FieldSettings = { ...(field.settings ?? {}) }
    const patch: Partial<FieldRow> = {}

    if (input.name !== undefined && input.name !== field.name) {
      await requireFieldNameFree(field.typeId, input.name, tx, field.id)
      patch.name = input.name
    }
    if (input.kind !== undefined && input.kind !== field.kind) {
      const used = (await fieldUse([field.id], tx)).get(field.id) ?? 0
      if (used > 0) throw new Error(PROJECT_ERRORS.fieldKindLocked)
      patch.kind = input.kind
      settings.choices = input.kind === "dropdown" ? [] : undefined
      // Files can't be added before a task exists.
      if (input.kind === "file") patch.neededWhenMade = false
    }
    if (input.neededBeforeDone !== undefined) patch.neededBeforeDone = input.neededBeforeDone
    if (input.neededWhenMade !== undefined) {
      if (input.neededWhenMade && kind === "file") throw new Error(PROJECT_ERRORS.fileFieldWhenMade)
      patch.neededWhenMade = input.neededWhenMade
    }
    if (input.whoCanChange !== undefined) patch.whoCanChange = input.whoCanChange

    if (input.choices !== undefined) {
      if (kind !== "dropdown") throw new Error(PROJECT_ERRORS.fieldValueWrong)
      settings.choices = mergeChoices(settings.choices ?? [], input.choices)
    }
    if (input.showWhen !== undefined) {
      if (input.showWhen) requireShowWhen(field.id, input.showWhen, siblings)
      settings.showWhen = input.showWhen
    }

    await tx
      .update(projectTaskTypeFields)
      .set({ ...patch, settings: cleanSettings(settings) })
      .where(eq(projectTaskTypeFields.id, field.id))

    // Fields that showed only when a choice now gone (or a dropdown no longer
    // a dropdown) was picked now always show.
    const live = new Set(
      kind === "dropdown" ? (settings.choices ?? []).filter((c) => !c.removed).map((c) => c.id) : []
    )
    for (const sibling of siblings) {
      const when = sibling.settings.showWhen
      if (when?.fieldId === field.id && !live.has(when.choiceId)) {
        await tx
          .update(projectTaskTypeFields)
          .set({ settings: cleanSettings({ ...sibling.settings, showWhen: null }) })
          .where(eq(projectTaskTypeFields.id, sibling.id))
      }
    }
  })
}

function cleanSettings(settings: FieldSettings): FieldSettings {
  const clean: FieldSettings = {}
  if (settings.choices) clean.choices = settings.choices
  if (settings.showWhen) clean.showWhen = settings.showWhen
  return clean
}

function mergeChoices(existing: FieldChoice[], incoming: { id?: string; name: string }[]): FieldChoice[] {
  const names = incoming.map((choice) => choice.name.toLowerCase())
  if (new Set(names).size !== names.length) throw new Error(PROJECT_ERRORS.choiceNameTaken)
  const byId = new Map(existing.map((choice) => [choice.id, choice]))
  const kept = incoming.map((choice) => {
    if (choice.id && !byId.has(choice.id)) throw new Error(PROJECT_ERRORS.choiceNotFound)
    return { id: choice.id ?? uuid(), name: choice.name }
  })
  const keptIds = new Set(kept.map((choice) => choice.id))
  const removed = existing
    .filter((choice) => !keptIds.has(choice.id))
    .map((choice) => ({ ...choice, removed: true }))
    .slice(-REMOVED_CHOICES_KEPT)
  return [...kept, ...removed]
}

/**
 * "Show only when" names a Dropdown field of the same type and one of its
 * live choices, and never makes a loop: the dropdown can't itself depend on
 * this field, however far down the line.
 */
function requireShowWhen(
  fieldId: string,
  when: { fieldId: string; choiceId: string },
  siblings: FieldRule[]
) {
  const byId = new Map(siblings.map((field) => [field.id, field]))
  const controller = byId.get(when.fieldId)
  if (!controller || controller.id === fieldId || controller.kind !== "dropdown") {
    throw new Error(PROJECT_ERRORS.showWhenWrong)
  }
  if (!(controller.settings.choices ?? []).some((c) => c.id === when.choiceId && !c.removed)) {
    throw new Error(PROJECT_ERRORS.showWhenWrong)
  }
  const seen = new Set<string>()
  let step: FieldRule | undefined = controller
  while (step?.settings.showWhen && !seen.has(step.id)) {
    seen.add(step.id)
    if (step.settings.showWhen.fieldId === fieldId) throw new Error(PROJECT_ERRORS.showWhenLoop)
    step = byId.get(step.settings.showWhen.fieldId)
  }
}

export async function reorderTypeFields(
  userId: string,
  input: { typeId: string; ids: string[] },
  database = db
) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx, await typeTeam(userId, input.typeId, tx))
    await requireTeamType(membership.teamId, input.typeId, tx)
    const wanted = [...new Set(input.ids)]
    const rows = await tx
      .select({ id: projectTaskTypeFields.id, position: projectTaskTypeFields.position })
      .from(projectTaskTypeFields)
      .where(and(inArray(projectTaskTypeFields.id, wanted), eq(projectTaskTypeFields.typeId, input.typeId)))
    if (rows.length !== wanted.length) throw new Error(PROJECT_ERRORS.fieldNotFound)
    const places = placesAfterReorder(rows, wanted)
    for (const row of rows) {
      const place = places.get(row.id)!
      if (place !== row.position) {
        await tx.update(projectTaskTypeFields).set({ position: place }).where(eq(projectTaskTypeFields.id, row.id))
      }
    }
  })
}

/**
 * Removes a field and every value in it, and for a File field its files,
 * which leave storage first: if storage refuses, nothing is deleted. Fields
 * that showed only when this dropdown said so now always show.
 */
export async function deleteTypeField(
  userId: string,
  fieldId: string,
  database = db,
  storage?: FileStorage
) {
  const membership = await requireTeamRunner(userId, database, await fieldTeam(userId, fieldId, database))
  const field = await requireTeamField(membership.teamId, fieldId, database)
  await removeFieldFilesFromStorage(field.id, database, storage)
  await database.transaction(async (tx) => {
    const siblings = await tx
      .select()
      .from(projectTaskTypeFields)
      .where(eq(projectTaskTypeFields.typeId, field.typeId))
    for (const sibling of siblings) {
      if (sibling.settings?.showWhen?.fieldId === field.id) {
        await tx
          .update(projectTaskTypeFields)
          .set({ settings: cleanSettings({ ...sibling.settings, showWhen: null }) })
          .where(eq(projectTaskTypeFields.id, sibling.id))
      }
    }
    await tx.delete(projectTaskTypeFields).where(eq(projectTaskTypeFields.id, field.id))
  })
}

// ---------------------------------------------------------------------------
// A task's type and its values
// ---------------------------------------------------------------------------

/**
 * What each task holds in its fields, by task: saved values, and for a File
 * field how many files it has. Only the fields of each task's own type.
 */
export async function valuesForTasks(
  tasks: readonly Pick<TaskRow, "id" | "typeId">[],
  database: ProjectDb
): Promise<Map<string, FieldValues>> {
  const byTask = new Map<string, FieldValues>()
  const typed = tasks.filter((task) => task.typeId)
  if (typed.length === 0) return byTask
  const ids = typed.map((task) => task.id)
  const rows = await database
    .select({
      taskId: projectTaskFieldValues.taskId,
      fieldId: projectTaskFieldValues.fieldId,
      value: projectTaskFieldValues.value,
      kind: projectTaskTypeFields.kind,
    })
    .from(projectTaskFieldValues)
    .innerJoin(projectTaskTypeFields, eq(projectTaskTypeFields.id, projectTaskFieldValues.fieldId))
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskFieldValues.taskId))
    .where(
      and(inArray(projectTaskFieldValues.taskId, ids), eq(projectTaskTypeFields.typeId, projectTasks.typeId))
    )
  const files = await database
    .select({
      taskId: projectTaskFiles.taskId,
      fieldId: projectTaskFiles.fieldId,
      total: countDistinct(projectTaskFiles.id),
    })
    .from(projectTaskFiles)
    .where(and(inArray(projectTaskFiles.taskId, ids), isNotNull(projectTaskFiles.fieldId)))
    .groupBy(projectTaskFiles.taskId, projectTaskFiles.fieldId)
  for (const row of rows) {
    const value = readFieldValue(row.kind, row.value)
    if (value === null) continue
    byTask.set(row.taskId, { ...(byTask.get(row.taskId) ?? {}), [row.fieldId]: value })
  }
  for (const row of files) {
    if (!row.fieldId || !row.taskId) continue
    byTask.set(row.taskId, { ...(byTask.get(row.taskId) ?? {}), [row.fieldId]: row.total })
  }
  return byTask
}

/** The chip of each task's type, by type id. */
export async function typeChipsFor(typeIds: readonly string[], database: ProjectDb) {
  const wanted = [...new Set(typeIds)]
  if (wanted.length === 0) return new Map<string, TaskTypeChip>()
  const rows = await database
    .select({
      id: projectTaskTypes.id,
      name: projectTaskTypes.name,
      icon: projectTaskTypes.icon,
      color: projectTaskTypes.color,
    })
    .from(projectTaskTypes)
    .where(inArray(projectTaskTypes.id, wanted))
  return new Map(rows.map((row) => [row.id, toChip(row)]))
}

export type TaskFieldView = TaskTypeField & {
  /** This person may change it. Everyone else reads it as plain words. */
  canChange: boolean
  /** Why not, in the words the server refuses with. */
  lockedReason: string | null
}

export type TaskFields = {
  type: (Omit<TaskType, "fields"> & { fields: TaskFieldView[] }) | null
  values: FieldValues
  /** Each File field's files. The task's Files card leaves these out. */
  fieldFiles: Record<string, TaskFile[]>
  /** The types this task can be given: the project's live ones, and its own. */
  typeChoices: (TaskTypeChip & { archived: boolean })[]
  /** Every file on the task, in fields or not, toward its limit of 10. */
  fileCount: number
  /** Whoever handed it out, the owner and admins change a task's type. */
  canChangeType: boolean
}

/** A task's type, its fields as this person may use them, and the types it could have. */
export async function loadTaskFields(
  viewer: { userId: string; role: TeamRole },
  task: TaskRow,
  project: ProjectRow,
  archived: boolean,
  database: ProjectDb
): Promise<TaskFields> {
  const types = await listTeamTypes(project.teamId, database)
  const own = types.find((type) => type.id === task.typeId) ?? null
  const values = (await valuesForTasks([task], database)).get(task.id) ?? {}
  const fields = (own?.fields ?? []).map((field): TaskFieldView => {
    const canChange = !archived && canChangeField(field, task, viewer)
    return { ...field, canChange, lockedReason: canChange || archived ? null : onlyWhoCanChange(field) }
  })
  const fieldFiles: Record<string, TaskFile[]> = {}
  if (fields.some((field) => field.kind === "file")) {
    const files = await listFieldFiles(viewer, task.id, archived, database)
    for (const field of fields) {
      if (field.kind !== "file") continue
      fieldFiles[field.id] = files
        .filter((file) => file.fieldId === field.id)
        .map((file) => ({ ...file, canDelete: file.canDelete && field.canChange }))
    }
  }
  const offered = project.personalUserId
    ? types.filter((type) => !type.archived)
    : types.filter((type) => !type.archived && !project.hiddenTypeIds.includes(type.id))
  const choices = own && !offered.some((type) => type.id === own.id) ? [...offered, own] : offered
  return {
    type: own ? { ...own, fields } : null,
    values,
    fieldFiles,
    typeChoices: choices.map((type) => ({ ...toChip(type), archived: type.archived })),
    canChangeType: !archived && canChangeTaskType(task, viewer),
    fileCount: (
      await database
        .select({ total: countDistinct(projectTaskFiles.id) })
        .from(projectTaskFiles)
        .where(eq(projectTaskFiles.taskId, task.id))
    )[0].total,
  }
}

/**
 * The type a new task or a picked type may be: one of the team's, live, and
 * offered by the project. A "Just me" task may be any live type.
 */
export async function requireOfferedType(
  teamId: string,
  project: Pick<ProjectRow, "personalUserId" | "hiddenTypeIds">,
  typeId: string,
  database: ProjectDb
) {
  const type = await requireTeamType(teamId, typeId, database)
  if (type.archivedAt) throw new Error(PROJECT_ERRORS.typeArchived)
  if (!project.personalUserId && project.hiddenTypeIds.includes(type.id)) {
    throw new Error(PROJECT_ERRORS.typeNotOffered)
  }
  return type
}

async function typeFields(typeId: string, database: ProjectDb): Promise<FieldRule[]> {
  const rows = await database
    .select()
    .from(projectTaskTypeFields)
    .where(eq(projectTaskTypeFields.typeId, typeId))
    .orderBy(asc(projectTaskTypeFields.position), asc(projectTaskTypeFields.createdAt))
  return rows.map(toField)
}

/**
 * Picking a type on a task that already exists only changes its type: it
 * never adds steps or touches its notes. Values in the old type's fields are
 * kept, so picking it again brings them back. Only whoever handed the task
 * out, the owner and admins may do it, so nobody switches a task to a plain
 * one to get past "Needed before Done".
 */
export async function setTaskType(
  actor: { id: string },
  input: { taskId: string; typeId: string | null },
  database = db
) {
  await database.transaction(async (tx) => {
    const { membership, project, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (input.typeId === task.typeId) return
    if (!canChangeTaskType(task, { userId: actor.id, role: membership.role })) {
      throw new Error(PROJECT_ERRORS.cantChangeType)
    }
    if (input.typeId) await requireOfferedType(membership.teamId, project, input.typeId, tx)
    await tx
      .update(projectTasks)
      .set({ typeId: input.typeId, updatedAt: now() })
      .where(eq(projectTasks.id, task.id))
  })
}

/** A value checked against its field: kind, choice and person. Null empties it. */
async function checkedValue(field: FieldRule, raw: unknown, projectId: string, database: ProjectDb) {
  if (field.kind === "file") throw new Error(PROJECT_ERRORS.notAFileField)
  const value = cleanFieldValue(field.kind, raw)
  if (value === null) return null
  if (field.kind === "dropdown" && !(field.settings.choices ?? []).some((c) => c.id === value && !c.removed)) {
    throw new Error(PROJECT_ERRORS.choiceNotFound)
  }
  if (field.kind === "person" && !(await isProjectMember(projectId, String(value), database))) {
    throw new Error(PROJECT_ERRORS.fieldPersonNotOnProject)
  }
  return value
}

/**
 * One field's value on one task. The server checks who may change it on every
 * save, so a field limited to the person assigned holds for the screen, the
 * API and anything else alike.
 */
export async function setTaskFieldValue(
  actor: { id: string; name: string },
  input: { taskId: string; fieldId: string; value: unknown },
  database = db
) {
  await database.transaction(async (tx) => {
    const { membership, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    const row = await requireTeamField(membership.teamId, input.fieldId, tx)
    if (row.typeId !== task.typeId) throw new Error(PROJECT_ERRORS.fieldNotOnType)
    const field = toField(row)
    const refusal = canChangeField(field, task, { userId: actor.id, role: membership.role })
      ? null
      : onlyWhoCanChange(field)
    if (refusal) throw new Error(refusal)
    const value = await checkedValue(field, input.value, task.projectId, tx)
    const before = field.kind === "person" ? ((await valuesForTasks([task], tx)).get(task.id) ?? {})[field.id] : null
    await writeValue(tx, task.id, field.id, value, actor.id)
    await tx.update(projectTasks).set({ updatedAt: now() }).where(eq(projectTasks.id, task.id))
    if (field.kind === "person" && value !== null && value !== before) {
      await tellPeopleNamed(tx, actor, task, [{ personId: String(value), fieldName: field.name }])
    }
  })
}

/**
 * Someone named in a Person field hears about it and follows the task, so
 * its chat and its Done reach them too (Tyler, 16 Oct 2026). Naming yourself,
 * or the task's own person, tells nobody: they already know the task.
 */
async function tellPeopleNamed(
  tx: ProjectDb,
  actor: { id: string; name: string },
  task: Pick<TaskRow, "id" | "projectId" | "title" | "assigneeUserId">,
  named: { personId: string; fieldName: string }[]
) {
  const told = named.filter(({ personId }) => personId !== actor.id && personId !== task.assigneeUserId)
  if (told.length === 0) return
  await tx
    .insert(projectTaskFollowers)
    .values(told.map(({ personId }) => ({ taskId: task.id, userId: personId, createdAt: now() })))
    .onConflictDoNothing()
  await writeTaskNotices(
    tx,
    told.map(({ personId, fieldName }) => ({
      kind: "task_field_person" as const,
      recipientUserId: personId,
      actor,
      task: { id: task.id, projectId: task.projectId, title: task.title },
      detail: `${fieldName} on ${task.title}`,
    }))
  )
}

async function writeValue(
  tx: ProjectDb,
  taskId: string,
  fieldId: string,
  value: string | number | boolean | null,
  userId: string
) {
  const where = and(eq(projectTaskFieldValues.taskId, taskId), eq(projectTaskFieldValues.fieldId, fieldId))
  if (value === null) {
    await tx.delete(projectTaskFieldValues).where(where)
    return
  }
  await tx
    .insert(projectTaskFieldValues)
    .values({ taskId, fieldId, value, updatedByUserId: userId, updatedAt: now() })
    .onConflictDoUpdate({
      target: [projectTaskFieldValues.taskId, projectTaskFieldValues.fieldId],
      set: { value, updatedByUserId: userId, updatedAt: now() },
    })
}

/**
 * The type and values New task sends. Whoever makes the task writes its
 * brief, so every field may be filled here whoever may change it later. Any
 * field "Needed when made" that shows must be filled, or nothing is made.
 */
export async function writeNewTaskFields(
  tx: ProjectDb,
  input: {
    membership: Membership
    project: ProjectRow
    task: Pick<TaskRow, "id" | "projectId" | "title" | "assigneeUserId">
    typeId: string
    values: Record<string, unknown>
    actor: { id: string; name: string }
  }
) {
  await requireOfferedType(input.membership.teamId, input.project, input.typeId, tx)
  const fields = await typeFields(input.typeId, tx)
  const byId = new Map(fields.map((field) => [field.id, field]))
  const saved: FieldValues = {}
  for (const [fieldId, raw] of Object.entries(input.values)) {
    const field = byId.get(fieldId)
    if (!field) throw new Error(PROJECT_ERRORS.fieldNotOnType)
    const value = await checkedValue(field, raw, input.project.id, tx)
    if (value !== null) saved[fieldId] = value
  }
  const missing = firstMissingField(fields, saved, "made")
  if (missing) throw new Error(fillInFirst(missing))
  for (const [fieldId, value] of Object.entries(saved)) {
    await writeValue(tx, input.task.id, fieldId, value, input.actor.id)
  }
  const named = Object.entries(saved).flatMap(([fieldId, value]) => {
    const field = byId.get(fieldId)!
    return field.kind === "person" ? [{ personId: String(value), fieldName: field.name }] : []
  })
  await tellPeopleNamed(tx, input.actor, input.task, named)
}

/**
 * Before a task becomes Done: every field "Needed before Done" that shows has
 * to be filled. Refuses naming the first one missing.
 */
export async function requireDoneFields(task: Pick<TaskRow, "id" | "typeId">, database: ProjectDb) {
  if (!task.typeId) return
  const fields = await typeFields(task.typeId, database)
  if (!fields.some((field) => field.neededBeforeDone)) return
  const values = (await valuesForTasks([task], database)).get(task.id) ?? {}
  const missing = firstMissingField(fields, values, "done")
  if (missing) throw new Error(fillInFirst(missing))
}

/**
 * Copies the values in each task's own type to its new copy (Duplicate,
 * Copy project, a repeat's copy). Files aren't copied, so a File field starts
 * empty. A Person value is kept only when `keepPerson` says so.
 */
export async function copyFieldValues(
  tx: ProjectDb,
  pairs: readonly { from: string; to: string }[],
  actorId: string | null,
  keepPerson: (userId: string) => boolean = () => true
) {
  if (pairs.length === 0) return
  const target = new Map(pairs.map((pair) => [pair.from, pair.to]))
  const rows = await tx
    .select({
      taskId: projectTaskFieldValues.taskId,
      fieldId: projectTaskFieldValues.fieldId,
      value: projectTaskFieldValues.value,
      kind: projectTaskTypeFields.kind,
    })
    .from(projectTaskFieldValues)
    .innerJoin(projectTaskTypeFields, eq(projectTaskTypeFields.id, projectTaskFieldValues.fieldId))
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskFieldValues.taskId))
    .where(
      and(
        inArray(projectTaskFieldValues.taskId, [...target.keys()]),
        eq(projectTaskTypeFields.typeId, projectTasks.typeId)
      )
    )
  const copies = rows
    .filter((row) => row.kind !== "person" || keepPerson(String(row.value)))
    .map((row) => ({
      taskId: target.get(row.taskId)!,
      fieldId: row.fieldId,
      value: row.value,
      updatedByUserId: actorId,
      updatedAt: now(),
    }))
  if (copies.length) await tx.insert(projectTaskFieldValues).values(copies)
}

/** Person values naming this person, in the tasks `where` picks, are emptied. */
export async function clearPersonValues(userId: string, where: SQL, tx: ProjectDb) {
  await tx
    .delete(projectTaskFieldValues)
    .where(
      and(
        sql`${projectTaskFieldValues.value} = to_jsonb(${userId}::text)`,
        inArray(
          projectTaskFieldValues.fieldId,
          tx.select({ id: projectTaskTypeFields.id }).from(projectTaskTypeFields).where(eq(projectTaskTypeFields.kind, "person"))
        ),
        inArray(projectTaskFieldValues.taskId, tx.select({ id: projectTasks.id }).from(projectTasks).where(where))
      )
    )
}

/** After a move: Person values naming someone who isn't on the new project are emptied. */
export async function clearPersonValuesOffProject(taskId: string, projectId: string, tx: ProjectDb) {
  const rows = await tx
    .select({ fieldId: projectTaskFieldValues.fieldId, value: projectTaskFieldValues.value })
    .from(projectTaskFieldValues)
    .innerJoin(projectTaskTypeFields, eq(projectTaskTypeFields.id, projectTaskFieldValues.fieldId))
    .where(and(eq(projectTaskFieldValues.taskId, taskId), eq(projectTaskTypeFields.kind, "person")))
  for (const row of rows) {
    if (!(await isProjectMember(projectId, String(row.value), tx))) {
      await tx
        .delete(projectTaskFieldValues)
        .where(and(eq(projectTaskFieldValues.taskId, taskId), eq(projectTaskFieldValues.fieldId, row.fieldId)))
    }
  }
}

// ---------------------------------------------------------------------------
// A project's own pick of types
// ---------------------------------------------------------------------------

/**
 * Which of the team's types this project offers, and the one New task starts
 * on. Unticking a type changes nothing on tasks that already have it. It is
 * one of the project's settings, so only the site admin changes it.
 */
export async function setProjectTypes(
  userId: string,
  input: { projectId: string; hiddenTypeIds?: string[]; defaultTypeId?: string | null },
  database = db
) {
  await database.transaction(async (tx) => {
    const { membership, project } = await requireProjectSettings(userId, input.projectId, tx)
    requireSharedProject(project)
    const hidden = input.hiddenTypeIds ? [...new Set(input.hiddenTypeIds)] : project.hiddenTypeIds
    const wanted = [...new Set([...hidden, ...(input.defaultTypeId ? [input.defaultTypeId] : [])])]
    if (wanted.length) {
      const found = await tx
        .select({ id: projectTaskTypes.id })
        .from(projectTaskTypes)
        .where(and(inArray(projectTaskTypes.id, wanted), eq(projectTaskTypes.teamId, membership.teamId)))
      if (found.length !== wanted.length) throw new Error(PROJECT_ERRORS.typeNotFound)
    }
    let defaultTypeId = input.defaultTypeId === undefined ? project.defaultTypeId : input.defaultTypeId
    if (defaultTypeId && input.defaultTypeId) {
      await requireOfferedType(membership.teamId, { ...project, hiddenTypeIds: hidden }, defaultTypeId, tx)
    }
    // A type the project no longer offers can't be where New task starts.
    if (defaultTypeId && hidden.includes(defaultTypeId)) defaultTypeId = null
    await tx
      .update(projectProjects)
      .set({ hiddenTypeIds: hidden, defaultTypeId, updatedAt: now() })
      .where(eq(projectProjects.id, project.id))
  })
}

/** Whether a project offers a task's type, so a move can say when it doesn't. */
export function projectOffersType(project: Pick<ProjectRow, "hiddenTypeIds">, typeId: string | null) {
  return !typeId || !project.hiddenTypeIds.includes(typeId)
}
