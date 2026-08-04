import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { dripConfigSchema, type DripConfig } from "@/lib/broadcasts/drip"
import {
  clearEmailApiKey,
  clearResendWebhookSecret,
  getEmailSettingsStatus,
  saveDripDefaults,
  saveEmailSender,
  setEmailApiKey,
  setResendWebhookSecret,
  testEmailApiKey,
  type EmailDeliveryStatus,
  type EmailKeyTestResult,
  type EmailSettingsStatus,
} from "@/server/email-settings"
import { adminGet, adminPost } from "@/server/guards"
import { getOrCreateCurrentWorkspace } from "@/server/workspaces"

import { createErrorMessage } from "./error-message"

export type { EmailDeliveryStatus, EmailKeyTestResult, EmailSettingsStatus }

export const getEmailSettingsErrorMessage = createErrorMessage(
  {
    FORBIDDEN: "Only an admin can manage email settings.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server can't store keys yet: its CUSTOM_SHELL_SECRET_ENCRYPTION_KEY setting is missing. Nothing was saved — keys are never stored unscrambled.",
    SECRET_UNREADABLE:
      "The saved key can't be read back because the server's scrambling secret changed. Paste the key again to fix it.",
    EMPTY_KEY: "Paste a key before saving.",
    NO_KEY: "There's no key to test yet — paste one first.",
    INVALID_FROM_EMAIL:
      "The from address doesn't look like an email address. Check it and try again.",
    DRIP_SETTINGS_INVALID:
      "Those batch settings contradict each other. Check the smallest is not bigger than the largest.",
  },
  "Something went wrong with the email settings. Please try again."
)

async function currentWorkspaceId(userId: string) {
  return (await getOrCreateCurrentWorkspace(userId)).id
}

const loadEmailSettingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<EmailSettingsStatus> => {
    return getEmailSettingsStatus(await currentWorkspaceId(context.user.id))
  })

export function loadEmailSettings() {
  return loadEmailSettingsFn()
}

// Every write returns the fresh status so the card never shows a stale
// masked tail or from-address after a save.
const saveEmailSenderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      // "" is allowed and clears the address; anything else must be an email.
      fromEmail: z.union([z.literal(""), z.string().email().max(255)]),
      fromName: z.string().max(255),
    })
  )
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveEmailSender(workspaceId, data)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveEmailSenderSettings(fromEmail: string, fromName: string) {
  return saveEmailSenderFn({
    data: { fromEmail: fromEmail.trim(), fromName },
  })
}

const saveEmailKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      // Long enough for any real Resend key, short enough to reject junk.
      apiKey: z.string().min(1).max(1000),
    })
  )
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await setEmailApiKey(workspaceId, data.apiKey)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveEmailApiKey(apiKey: string) {
  return saveEmailKeyFn({ data: { apiKey } })
}

const removeEmailKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await clearEmailApiKey(workspaceId)
    return getEmailSettingsStatus(workspaceId)
  })

export function removeEmailApiKey() {
  return removeEmailKeyFn()
}

const saveWebhookSecretFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ secret: z.string().min(1).max(1000) }))
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await setResendWebhookSecret(workspaceId, data.secret)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveResendWebhookSecret(secret: string) {
  return saveWebhookSecretFn({ data: { secret } })
}

const removeWebhookSecretFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await clearResendWebhookSecret(workspaceId)
    return getEmailSettingsStatus(workspaceId)
  })

export function removeResendWebhookSecret() {
  return removeWebhookSecretFn()
}

const saveDripDefaultsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  // The whole config is re-checked here rather than trusted: this is what gets
  // copied onto every newsletter made from now on.
  .inputValidator(z.object({ drip: dripConfigSchema }))
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveDripDefaults(workspaceId, data.drip)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveNewsletterDripDefaults(drip: DripConfig) {
  return saveDripDefaultsFn({ data: { drip } })
}

// POST although it changes nothing: the pasted key rides in the body, and a
// secret must never sit in a GET url that request logs would keep.
const testEmailKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().max(1000).optional() }))
  .handler(async ({ data, context }): Promise<EmailKeyTestResult> => {
    return testEmailApiKey(
      await currentWorkspaceId(context.user.id),
      data.apiKey
    )
  })

export function testEmailKey(apiKey?: string) {
  return testEmailKeyFn({
    data: { apiKey: apiKey?.trim() ? apiKey : undefined },
  })
}
