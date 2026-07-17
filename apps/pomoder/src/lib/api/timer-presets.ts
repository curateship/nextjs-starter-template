import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TIMER_PRESET_NAME_MAX } from "@/lib/timer-presets"
import { requireAppOrigin } from "@/server/origin"
import { requireUser } from "@/server/security"
import { createTimerPreset as createPreset, deleteTimerPreset as deletePreset, listTimerPresets as listPresets, updateTimerPreset as updatePreset } from "@/server/timer-presets"

const presetValuesSchema = z.object({
  name: z.string().trim().min(1).max(TIMER_PRESET_NAME_MAX),
  focusMinutes: z.number().int().min(1).max(90),
  shortBreakMinutes: z.number().int().min(1).max(90),
  longBreakMinutes: z.number().int().min(1).max(90),
  autoStart: z.boolean(),
})
const updatePresetSchema = presetValuesSchema.extend({ presetId: z.string().uuid() })
const presetIdSchema = z.object({ presetId: z.string().uuid() })

const listTimerPresetsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser()
  return listPresets(user.id)
})

const createTimerPresetFn = createServerFn({ method: "POST" }).inputValidator(presetValuesSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  return createPreset(user.id, data)
})

const updateTimerPresetFn = createServerFn({ method: "POST" }).inputValidator(updatePresetSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const { presetId, ...values } = data
  return updatePreset(user.id, presetId, values)
})

const deleteTimerPresetFn = createServerFn({ method: "POST" }).inputValidator(presetIdSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  return deletePreset(user.id, data.presetId)
})

export const loadTimerPresets = () => listTimerPresetsFn()
export const createTimerPreset = (data: z.infer<typeof presetValuesSchema>) => createTimerPresetFn({ data })
export const updateTimerPreset = (data: z.infer<typeof updatePresetSchema>) => updateTimerPresetFn({ data })
export const deleteTimerPreset = (presetId: string) => deleteTimerPresetFn({ data: { presetId } })
