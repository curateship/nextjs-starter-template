import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  clearStripeSecret,
  getStripeSettingsStatus,
  setStripeSecret,
  setStripeText,
  setStripeUseSandbox,
  STRIPE_SECRET_FIELDS,
  STRIPE_TEXT_FIELDS,
  type StripeSecretField,
  type StripeSecretStatus,
  type StripeSettingsStatus,
  type StripeTextField,
} from "@/server/billing/settings"

import { createErrorMessage } from "./error-message"

export type {
  StripeSecretField,
  StripeSecretStatus,
  StripeSettingsStatus,
  StripeTextField,
}

export const getStripeSettingsErrorMessage = createErrorMessage(
  {
    FORBIDDEN: "Only an admin can manage Stripe settings.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server can't store keys yet: its CUSTOM_SHELL_SECRET_ENCRYPTION_KEY setting is missing. Nothing was saved — keys are never stored unscrambled.",
    SECRET_UNREADABLE:
      "The saved key can't be read back because the server's scrambling secret changed. Paste the key again to fix it.",
    EMPTY_KEY: "Paste a key before saving.",
  },
  "We could not load or save the Stripe settings. Please try again."
)

const secretFieldSchema = z.enum(STRIPE_SECRET_FIELDS)
const textFieldSchema = z.enum(STRIPE_TEXT_FIELDS)

const loadStripeSettingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<StripeSettingsStatus> => {
    return getStripeSettingsStatus()
  })

export function loadStripeSettings() {
  return loadStripeSettingsFn()
}

// Every write returns the fresh status so the card never shows a stale
// masked tail or switch position after a save.
const saveStripeSecretFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      field: secretFieldSchema,
      // Long enough for any real Stripe key, short enough to reject junk.
      value: z.string().min(1).max(1000),
    })
  )
  .handler(async ({ data }): Promise<StripeSettingsStatus> => {
    await setStripeSecret(data.field, data.value)
    return getStripeSettingsStatus()
  })

export function saveStripeSecret(field: StripeSecretField, value: string) {
  return saveStripeSecretFn({ data: { field, value } })
}

const removeStripeSecretFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ field: secretFieldSchema }))
  .handler(async ({ data }): Promise<StripeSettingsStatus> => {
    await clearStripeSecret(data.field)
    return getStripeSettingsStatus()
  })

export function removeStripeSecret(field: StripeSecretField) {
  return removeStripeSecretFn({ data: { field } })
}

const saveStripeTextFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      field: textFieldSchema,
      // "" is allowed and clears the field.
      value: z.string().max(1000),
    })
  )
  .handler(async ({ data }): Promise<StripeSettingsStatus> => {
    await setStripeText(data.field, data.value)
    return getStripeSettingsStatus()
  })

export function saveStripeText(field: StripeTextField, value: string) {
  return saveStripeTextFn({ data: { field, value } })
}

const setStripeSandboxFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ useSandbox: z.boolean() }))
  .handler(async ({ data }): Promise<StripeSettingsStatus> => {
    await setStripeUseSandbox(data.useSandbox)
    return getStripeSettingsStatus()
  })

export function saveStripeUseSandbox(useSandbox: boolean) {
  return setStripeSandboxFn({ data: { useSandbox } })
}
