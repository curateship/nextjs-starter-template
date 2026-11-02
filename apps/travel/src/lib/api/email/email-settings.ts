import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { dripConfigSchema, type DripConfig } from "@/lib/broadcasts/drip"
import {
  QUIET_AFTER_EMAILS_MAX,
  QUIET_AFTER_EMAILS_MIN,
} from "@/lib/contacts/gone-quiet"
import {
  authLinkExpirySchema,
  type AuthLinkExpiry,
} from "@/lib/email/auth-token-expiry"
import {
  clearEmailApiKey,
  clearResendWebhookSecret,
  getEmailSettingsStatus,
  saveAuthLinkExpiry,
  saveCrmQuoteReplies,
  saveCrmReplyName,
  saveCrmReplySignature,
  saveDripDefaults,
  saveEmailSender,
  saveQuietAfterEmails,
  saveInboundAddress,
  saveSystemEmailSender,
  setEmailApiKey,
  setResendWebhookSecret,
  testEmailApiKey,
  type EmailDeliveryStatus,
  type EmailKeyTestResult,
  type EmailSettingsStatus,
} from "@/server/email/settings"
import { adminGet, adminPost } from "@/server/guards"
import { currentWorkspaceId } from "@/server/people/workspaces"

import { createErrorMessage } from "../error-message"

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
    INVALID_INBOUND_ADDRESS:
      "The address mail arrives at doesn't look like an email address. Check it and try again.",
    DRIP_SETTINGS_INVALID:
      "Those batch settings contradict each other. Check the smallest is not bigger than the largest.",
  },
  "We could not load or save the email settings. Please try again."
)


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

/**
 * Where mail comes IN: the Resend inbound address the CRM reads and replies
 * from.
 *
 * "" is allowed and clears it, which turns the CRM's replying off rather than
 * leaving it pointed at an address nobody owns.
 */
const saveInboundAddressFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      inboundAddress: z.union([z.literal(""), z.string().email().max(255)]),
    })
  )
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveInboundAddress(workspaceId, data.inboundAddress)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveInboundAddressSetting(inboundAddress: string) {
  return saveInboundAddressFn({
    data: { inboundAddress: inboundAddress.trim() },
  })
}

/**
 * The name CRM replies go out under.
 *
 * "" is allowed and clears it, which sends replies under the app name instead.
 * Nothing here checks the characters: `composeFromAddress` takes out anything
 * that could split the From header, and it does that at send time so an
 * already-saved name is cleaned too.
 */
const saveCrmReplyNameFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ crmReplyName: z.string().max(255) }))
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveCrmReplyName(workspaceId, data.crmReplyName)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveCrmReplyNameSetting(crmReplyName: string) {
  return saveCrmReplyNameFn({ data: { crmReplyName } })
}

/**
 * The lines that go under every CRM reply.
 *
 * "" is allowed and clears it, which sends replies with nothing added. The
 * length cap is generous because it holds an address, and the signature is
 * escaped when the mail is built, not here.
 */
const saveCrmReplySignatureFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ crmReplySignature: z.string().max(2000) }))
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveCrmReplySignature(workspaceId, data.crmReplySignature)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveCrmReplySignatureSetting(crmReplySignature: string) {
  return saveCrmReplySignatureFn({ data: { crmReplySignature } })
}

/** Whether a CRM reply carries the message it answers underneath it. */
const saveCrmQuoteRepliesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ crmQuoteReplies: z.boolean() }))
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveCrmQuoteReplies(workspaceId, data.crmQuoteReplies)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveCrmQuoteRepliesSetting(crmQuoteReplies: boolean) {
  return saveCrmQuoteRepliesFn({ data: { crmQuoteReplies } })
}

/** How many unopened sends in a row mark somebody as gone quiet. */
const saveQuietAfterEmailsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      quietAfterEmails: z
        .number()
        .int()
        .min(QUIET_AFTER_EMAILS_MIN)
        .max(QUIET_AFTER_EMAILS_MAX),
    })
  )
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveQuietAfterEmails(workspaceId, data.quietAfterEmails)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveQuietAfterEmailsSetting(quietAfterEmails: number) {
  return saveQuietAfterEmailsFn({ data: { quietAfterEmails } })
}

const saveSystemEmailSenderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      systemFromEmail: z.union([z.literal(""), z.string().email().max(255)]),
    }),
  )
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveSystemEmailSender(workspaceId, data.systemFromEmail)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveSystemEmailSenderSetting(systemFromEmail: string) {
  return saveSystemEmailSenderFn({
    data: { systemFromEmail: systemFromEmail.trim() },
  })
}

const saveAuthLinkExpiryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(authLinkExpirySchema)
  .handler(async ({ data, context }): Promise<EmailSettingsStatus> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveAuthLinkExpiry(workspaceId, data)
    return getEmailSettingsStatus(workspaceId)
  })

export function saveAuthLinkExpirySetting(expiry: AuthLinkExpiry) {
  return saveAuthLinkExpiryFn({ data: expiry })
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
