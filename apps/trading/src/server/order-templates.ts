import { and, asc, eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  tradingOrderTemplates,
  type TradingOrderTemplate,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

type OrderTemplateDb =
  | CustomShellDb
  | Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

export type OrderTemplateValues = {
  name: string
  orderSizePct: number
  sizingMode: "wallet" | "risk"
  leverage: number
  stopLossPct: number
  takeProfitPct: number
  useLimitOrder: boolean
  isDefault: boolean
}

export async function listOrderTemplates(
  userId: string,
  database: OrderTemplateDb = db
) {
  return database
    .select()
    .from(tradingOrderTemplates)
    .where(eq(tradingOrderTemplates.userId, userId))
    .orderBy(asc(tradingOrderTemplates.createdAt))
}

export async function getOrderTemplate(
  userId: string,
  templateId: string,
  database: OrderTemplateDb = db
) {
  const [template] = await database
    .select()
    .from(tradingOrderTemplates)
    .where(
      and(
        eq(tradingOrderTemplates.id, templateId),
        eq(tradingOrderTemplates.userId, userId)
      )
    )
    .limit(1)

  return template ?? null
}

export async function createOrderTemplate(
  userId: string,
  values: OrderTemplateValues,
  database: CustomShellDb = db
) {
  return database.transaction(async (tx) => {
    const existing = await listOrderTemplates(userId, tx)
    const createdAt = now()
    const [template] = await tx
      .insert(tradingOrderTemplates)
      .values({
        id: uuid(),
        userId,
        ...cleanValues(values),
        isDefault: existing.length === 0 || values.isDefault,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()

    if (!template) throw new Error("Order template was not created")
    if (template.isDefault) {
      return applyDefaultOrderTemplate(userId, template.id, tx)
    }
    return template
  })
}

export async function updateOrderTemplate(
  userId: string,
  templateId: string,
  values: OrderTemplateValues,
  database: CustomShellDb = db
) {
  return database.transaction(async (tx) => {
    const [template] = await tx
      .update(tradingOrderTemplates)
      .set({ ...cleanValues(values), updatedAt: now() })
      .where(
        and(
          eq(tradingOrderTemplates.id, templateId),
          eq(tradingOrderTemplates.userId, userId)
        )
      )
      .returning()

    if (!template) throw new Error("Order template not found")
    if (values.isDefault) {
      return applyDefaultOrderTemplate(userId, template.id, tx)
    }
    return template
  })
}

export async function deleteOrderTemplate(
  userId: string,
  templateId: string,
  database: CustomShellDb = db
) {
  return database.transaction(async (tx) => {
    const template = await getOrderTemplate(userId, templateId, tx)
    if (!template) throw new Error("Order template not found")

    const [deleted] = await tx
      .delete(tradingOrderTemplates)
      .where(
        and(
          eq(tradingOrderTemplates.id, templateId),
          eq(tradingOrderTemplates.userId, userId)
        )
      )
      .returning({ id: tradingOrderTemplates.id })

    if (!deleted) throw new Error("Order template not found")
    if (template.isDefault) {
      const [fallback] = await tx
        .select({ id: tradingOrderTemplates.id })
        .from(tradingOrderTemplates)
        .where(eq(tradingOrderTemplates.userId, userId))
        .orderBy(asc(tradingOrderTemplates.createdAt))
        .limit(1)
      if (fallback) await applyDefaultOrderTemplate(userId, fallback.id, tx)
    }
    return { templateId: deleted.id }
  })
}

export async function setDefaultOrderTemplate(
  userId: string,
  templateId: string,
  database: CustomShellDb = db
) {
  return database.transaction((tx) =>
    applyDefaultOrderTemplate(userId, templateId, tx)
  )
}

async function applyDefaultOrderTemplate(
  userId: string,
  templateId: string,
  database: OrderTemplateDb
) {
  const template = await getOrderTemplate(userId, templateId, database)
  if (!template) throw new Error("Order template not found")

  const updatedAt = now()
  await database
    .update(tradingOrderTemplates)
    .set({ isDefault: false, updatedAt })
    .where(eq(tradingOrderTemplates.userId, userId))

  const [updated] = await database
    .update(tradingOrderTemplates)
    .set({ isDefault: true, updatedAt })
    .where(
      and(
        eq(tradingOrderTemplates.id, templateId),
        eq(tradingOrderTemplates.userId, userId)
      )
    )
    .returning()

  if (!updated) throw new Error("Order template not found")
  return updated
}

export function serializeOrderTemplate(row: TradingOrderTemplate) {
  return {
    id: row.id,
    name: row.name,
    orderSizePct: Number(row.orderSizePct),
    sizingMode: row.sizingMode,
    leverage: row.leverage,
    stopLossPct: Number(row.stopLossPct),
    takeProfitPct: Number(row.takeProfitPct),
    useLimitOrder: row.useLimitOrder,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function cleanValues(values: OrderTemplateValues) {
  return {
    name: values.name.trim(),
    orderSizePct: String(values.orderSizePct),
    sizingMode: values.sizingMode,
    leverage: values.leverage,
    stopLossPct: String(values.stopLossPct),
    takeProfitPct: String(values.takeProfitPct),
    useLimitOrder: values.useLimitOrder,
  }
}
