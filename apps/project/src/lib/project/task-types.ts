import { z } from "zod"

import { createTaskSchema, LIMITS, PROJECT_COLORS, type ProjectColor } from "@/lib/project/rules"
import { storedTaskNotes } from "@/lib/project/notes"
import { FIELD_KINDS, WHO_CAN_CHANGE, type FieldRule } from "@/lib/project/task-fields"

/**
 * A team's kinds of task, such as "Research" or "Video editing", as the
 * server sends them and the screens draw them. The fields' own rules are in
 * `task-fields.ts`.
 */

/** The icons a type can pick. Each is drawn by `task-type-icon.tsx`. */
export const TYPE_ICONS = [
  "file",
  "search",
  "video",
  "image",
  "palette",
  "code",
  "bug",
  "megaphone",
  "mail",
  "phone",
  "calendar",
  "package",
  "book",
  "users",
  "flag",
  "star",
] as const
export type TypeIcon = (typeof TYPE_ICONS)[number]

export const TYPE_ICON_LABEL: Record<TypeIcon, string> = {
  file: "Page",
  search: "Magnifier",
  video: "Camera",
  image: "Picture",
  palette: "Palette",
  code: "Code",
  bug: "Bug",
  megaphone: "Megaphone",
  mail: "Envelope",
  phone: "Phone",
  calendar: "Calendar",
  package: "Box",
  book: "Book",
  users: "People",
  flag: "Flag",
  star: "Star",
}

/** The small chip on a Board card or a List row. */
export type TaskTypeChip = { id: string; name: string; icon: TypeIcon; color: ProjectColor }

export type TaskTypeField = FieldRule & {
  /** Tasks with a value or a file in it, for the editor's warnings. Only Team settings fills it. */
  inUse?: number
}

export type TaskType = TaskTypeChip & {
  archived: boolean
  /** New task starts with these steps and these notes when the type is picked. */
  steps: string[]
  notes: string
  fields: TaskTypeField[]
}

/** The team's types a project offers: every live one it hasn't unticked. */
export function offeredTypes(types: readonly TaskType[], hiddenTypeIds: readonly string[]) {
  return types.filter((type) => !type.archived && !hiddenTypeIds.includes(type.id))
}

const id = z.string().min(1).max(36)
const named = (max: number, what: string) =>
  z
    .string()
    .trim()
    .min(1, `${what} can't be empty.`)
    .max(max, `${what} can be at most ${max} characters.`)

const typeNameSchema = named(LIMITS.typeName, "The type's name")
const fieldNameSchema = named(LIMITS.fieldName, "The field's name")

export const createTypeSchema = z.object({
  name: typeNameSchema,
  icon: z.enum(TYPE_ICONS),
  color: z.enum(PROJECT_COLORS),
})

export const updateTypeSchema = z.object({
  typeId: id,
  name: typeNameSchema.optional(),
  icon: z.enum(TYPE_ICONS).optional(),
  color: z.enum(PROJECT_COLORS).optional(),
  steps: z
    .array(named(LIMITS.stepText, "A step"))
    .max(LIMITS.stepsPerTask, `A type can start with at most ${LIMITS.stepsPerTask} steps.`)
    .optional(),
  notes: z
    .unknown()
    .transform(storedTaskNotes)
    .refine((notes) => notes.length <= LIMITS.taskNotes, "The notes are too long.")
    .optional(),
})

export const archiveTypeSchema = z.object({ typeId: id, archived: z.boolean() })

export const reorderSchema = z.object({ ids: z.array(id).min(1).max(LIMITS.typesPerTeam) })

export const createFieldSchema = z.object({
  typeId: id,
  name: fieldNameSchema,
  kind: z.enum(FIELD_KINDS),
})

export const updateFieldSchema = z.object({
  fieldId: id,
  name: fieldNameSchema.optional(),
  kind: z.enum(FIELD_KINDS).optional(),
  neededBeforeDone: z.boolean().optional(),
  neededWhenMade: z.boolean().optional(),
  whoCanChange: z.enum(WHO_CAN_CHANGE).optional(),
  showWhen: z.object({ fieldId: id, choiceId: id }).nullable().optional(),
  /** The dropdown's choices in order. One without an id is new; one left out is removed. */
  choices: z
    .array(z.object({ id: id.optional(), name: named(LIMITS.choiceName, "A choice") }))
    .max(LIMITS.choicesPerField, `A dropdown can have at most ${LIMITS.choicesPerField} choices.`)
    .optional(),
})

export const reorderFieldsSchema = z.object({
  typeId: id,
  ids: z.array(id).min(1).max(LIMITS.fieldsPerType),
})

export const setTaskTypeSchema = z.object({ taskId: id, typeId: id.nullable() })

export const setFieldValueSchema = z.object({
  taskId: id,
  fieldId: id,
  /** Checked against the field's kind on the server. Null empties the field. */
  value: z.union([z.string().max(LIMITS.fieldLongText + 100), z.number(), z.boolean(), z.null()]),
})

/** A project's own pick of the team's types, and the one New task starts on. */
export const projectTypesSchema = z.object({
  projectId: id,
  hiddenTypeIds: z.array(id).max(LIMITS.typesPerTeam).optional(),
  defaultTypeId: id.nullable().optional(),
})

/** Field values sent with New task, by field id. */
export const newTaskFieldValuesSchema = z
  .record(id, z.union([z.string().max(LIMITS.fieldLongText + 100), z.number(), z.boolean(), z.null()]))
  .refine(
    (values) => Object.keys(values).length <= LIMITS.fieldsPerType,
    `A task type can have at most ${LIMITS.fieldsPerType} fields.`
  )

/** New task, with the type picked and the fields it needs when made. */
export const newTaskSchema = createTaskSchema.extend({
  typeId: id.nullable().default(null),
  fieldValues: newTaskFieldValuesSchema.default({}),
})
