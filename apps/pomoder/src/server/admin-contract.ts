import { z } from "zod"

export const pomoderAdminSections = [
  "users",
  "tasks",
  "sessions",
  "rooms",
  "media",
  "billing",
  "ai",
  "reports",
] as const
export const pomoderAdminSectionSchema = z.enum(pomoderAdminSections)

export type PomoderAdminSection = z.infer<typeof pomoderAdminSectionSchema>
export type PomoderAdminResource = PomoderAdminSection

const id = z.string().min(1).max(36)
const uuid = z.string().uuid()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const nullableDateTime = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date and time")
  .nullable()
const optionalText = (max: number) => z.string().trim().max(max).nullable()
const count = z.number().int().min(0).max(2_147_483_647)

const userFields = {
  resource: z.literal("users"),
  email: z.string().trim().toLowerCase().email().max(255),
  name: z.string().trim().min(1).max(255),
  role: z.enum(["user", "admin"]),
  verified: z.boolean(),
}

const taskRecordSchema = z.object({
  resource: z.literal("tasks"),
  userId: id,
  title: z.string().trim().min(1).max(160),
  plannedDate: date,
  status: z.enum(["active", "completed", "carried", "abandoned"]),
  pomodoroCount: count,
})

const sessionRecordSchema = z.object({
  resource: z.literal("sessions"),
  userId: id,
  taskId: uuid.nullable(),
  roomId: uuid.nullable(),
  mode: z.enum(["focus", "short", "long"]),
  status: z.enum(["running", "paused", "completed", "cancelled"]),
  plannedSeconds: z.number().int().min(1).max(86_400),
  accumulatedSeconds: z.number().int().min(0).max(86_400),
})

const roomRecordSchema = z.object({
  resource: z.literal("rooms"),
  hostUserId: id,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(80),
  visibility: z.enum(["public", "unlisted"]),
  phase: z.enum(["waiting", "focus", "short", "long", "closed"]),
  focusMinutes: z.number().int().min(1).max(90),
  shortBreakMinutes: z.number().int().min(1).max(90),
  longBreakMinutes: z.number().int().min(1).max(90),
  autoStart: z.boolean(),
})

const mediaMetadataFields = {
  resource: z.literal("media"),
  status: z.enum(["queued", "processing", "ready", "failed"]),
  name: z.string().trim().min(1).max(100),
  mimeType: z.string().trim().min(1).max(100),
  fileSize: z.number().int().min(0).max(2_147_483_648),
  premium: z.boolean(),
}

const mediaCreateRecordSchema = z
  .object({
    ...mediaMetadataFields,
    ownerUserId: id.nullable(),
    kind: z.enum(["image", "video", "audio"]),
    source: z.enum(["curated", "upload", "ai"]),
    storageKey: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/),
  })
  .superRefine((record, context) => {
    const expectedPrefix = record.ownerUserId
      ? `users/${record.ownerUserId}/`
      : "curated/"
    if (
      !record.storageKey.startsWith(expectedPrefix) ||
      record.storageKey.includes("..") ||
      record.storageKey.includes("//")
    ) {
      context.addIssue({
        code: "custom",
        path: ["storageKey"],
        message: `Storage key must use the ${expectedPrefix} namespace`,
      })
    }
  })

const mediaUpdateRecordSchema = z.object(mediaMetadataFields)

const billingRecordSchema = z.object({
  resource: z.literal("billing"),
  userId: id,
  stripeCustomerId: z.string().trim().min(1).max(120),
  stripeSubscriptionId: optionalText(120),
  status: z.string().trim().min(1).max(30),
  priceId: optionalText(120),
  currentPeriodEnd: nullableDateTime,
  cancelAtPeriodEnd: z.boolean(),
})

const aiRecordSchema = z.object({
  resource: z.literal("ai"),
  userId: id,
  month: date,
  kind: z.enum(["background", "soundscape"]),
  reserved: count,
  completed: count,
  refunded: count,
})

const reportRecordSchema = z.object({
  resource: z.literal("reports"),
  roomId: uuid,
  reporterUserId: id,
  reason: z.string().trim().min(1).max(300),
})

const sharedRecordSchemas = [
  taskRecordSchema,
  sessionRecordSchema,
  roomRecordSchema,
  billingRecordSchema,
  aiRecordSchema,
  reportRecordSchema,
] as const

export const adminCreateRecordSchema = z.discriminatedUnion("resource", [
  z.object({ ...userFields, password: z.string().min(8).max(128) }),
  ...sharedRecordSchemas,
  mediaCreateRecordSchema,
])

export const adminUpdateRecordSchema = z.discriminatedUnion("resource", [
  z.object({ ...userFields, password: z.string().min(8).max(128).optional() }),
  ...sharedRecordSchemas,
  mediaUpdateRecordSchema,
])

export const adminCreateActionSchema = z.object({
  type: z.literal("create_record"),
  record: adminCreateRecordSchema,
})
export const adminUpdateActionSchema = z.object({
  type: z.literal("update_record"),
  id,
  record: adminUpdateRecordSchema,
})
export const reportStatuses = ["pending", "resolved", "dismissed"] as const
export type PomoderReportStatus = (typeof reportStatuses)[number]

export const adminActionSchema = z.discriminatedUnion("type", [
  adminCreateActionSchema,
  adminUpdateActionSchema,
  z.object({ type: z.literal("revoke_user_sessions"), userId: id }),
  z.object({
    type: z.literal("delete_records"),
    resource: pomoderAdminSectionSchema,
    ids: z.array(id).min(1).max(100),
  }),
  // Reviewing back to "pending" reopens the report and clears the reviewer.
  z.object({
    type: z.literal("review_report"),
    id,
    decision: z.enum(reportStatuses),
  }),
])

export const adminLoadSchema = z.object({
  section: pomoderAdminSectionSchema,
  page: z.number().int().min(1).max(100_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  sortColumn: z.number().int().min(0).max(10).default(0),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  reportStatus: z.enum(["all", ...reportStatuses]).default("all"),
})

export type PomoderAdminCreateRecord = z.infer<typeof adminCreateRecordSchema>
export type PomoderAdminUpdateRecord = z.infer<typeof adminUpdateRecordSchema>
export type PomoderAdminAction = z.infer<typeof adminActionSchema>
export type PomoderAdminLoad = z.infer<typeof adminLoadSchema>
