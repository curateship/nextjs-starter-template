import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type OrderTemplateItem = {
  id: string
  name: string
  orderSizePct: number
  leverage: number
  stopLossPct: number
  takeProfitPct: number
  useLimitOrder: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

const valuesSchema = z.object({
  name: z.string().trim().min(1).max(80),
  orderSizePct: z.number().positive().max(100),
  leverage: z.number().int().min(1).max(100),
  stopLossPct: z.number().positive().lt(100),
  takeProfitPct: z.number().positive().lt(100),
  useLimitOrder: z.boolean(),
  isDefault: z.boolean(),
})
const idSchema = z.object({ templateId: z.string().min(1) })
const updateSchema = valuesSchema.extend({ templateId: z.string().min(1) })

const loadFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return listForUser(user.id)
})

const createFn = createServerFn({ method: "POST" })
  .inputValidator(valuesSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { createOrderTemplate } = await import("@/server/order-templates")
    await createOrderTemplate(user.id, data)
    return listForUser(user.id)
  })

const updateFn = createServerFn({ method: "POST" })
  .inputValidator(updateSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { updateOrderTemplate } = await import("@/server/order-templates")
    await updateOrderTemplate(user.id, data.templateId, data)
    return listForUser(user.id)
  })

const deleteFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { deleteOrderTemplate } = await import("@/server/order-templates")
    await deleteOrderTemplate(user.id, data.templateId)
    return listForUser(user.id)
  })

const setDefaultFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { setDefaultOrderTemplate } = await import("@/server/order-templates")
    await setDefaultOrderTemplate(user.id, data.templateId)
    return listForUser(user.id)
  })

export async function loadOrderTemplates() {
  return loadFn() as Promise<OrderTemplateItem[]>
}

export function createOrderTemplate(values: z.infer<typeof valuesSchema>) {
  return createFn({ data: values }) as Promise<OrderTemplateItem[]>
}

export function updateOrderTemplate(
  templateId: string,
  values: z.infer<typeof valuesSchema>
) {
  return updateFn({ data: { templateId, ...values } }) as Promise<
    OrderTemplateItem[]
  >
}

export function deleteOrderTemplate(templateId: string) {
  return deleteFn({ data: { templateId } }) as Promise<OrderTemplateItem[]>
}

export function setDefaultOrderTemplate(templateId: string) {
  return setDefaultFn({ data: { templateId } }) as Promise<OrderTemplateItem[]>
}

export function getOrderTemplateErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    ["Order template not found", "Order template was not created"].includes(
      error.message
    )
  ) {
    return error.message
  }
  return "Order template request failed."
}

async function requireMutation() {
  const { requireAppOrigin } = await import("@/server/origin")
  requireAppOrigin()
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}

async function listForUser(userId: string): Promise<OrderTemplateItem[]> {
  const { listOrderTemplates, serializeOrderTemplate } =
    await import("@/server/order-templates")
  const templates = await listOrderTemplates(userId)
  return templates.map(serializeOrderTemplate)
}
