import { and, eq, sql } from "drizzle-orm"

import { automationCompiledConfigSchema } from "@/lib/automations/compile"
import { readSendEmailSettings } from "@/lib/automations/nodes/send-email"
import {
  personalizeEmail,
  renderBroadcastEmailHtml,
} from "@/lib/broadcasts/render"
import {
  listAutomationAudienceContacts,
  readAutomationAudience,
  type AutomationAudienceContact,
} from "@/server/automations/audience"
import { syncContactsFromUsers } from "@/server/people/contacts"
import { currentWorkspaceId } from "@/server/people/workspaces"
import type { CustomShellDb } from "@/server/db"
import { getEmailProvider, type EmailProvider } from "@/server/email/provider"
import { composeFromAddress } from "@/server/email/send"
import { getSendableEmailConfig } from "@/server/email/settings"
import {
  buildUnsubscribeUrl,
  canBuildUnsubscribeLinks,
} from "@/server/email/unsubscribe"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellContacts,
  customShellUsers,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { uuid } from "@/server/auth/security"

const SEND_BATCH_SIZE = 50
const CLAIM_REFRESH_EVERY = 10
const DEV_FROM = "Custom Shell <onboarding@resend.dev>"

type SendEmailContext = {
  database: CustomShellDb
  run: CustomShellAutomationRun
  nodeId: string
  settings: Record<string, unknown>
  now: () => Date
}

type Recipient = Pick<
  AutomationAudienceContact,
  "id" | "userId" | "email" | "firstName" | "lastName" | "emailVerifiedAt"
>

/** The closest upstream Audience step this run actually completed, if any. */
async function audienceForRun(
  run: CustomShellAutomationRun,
  currentNodeId: string,
  database: CustomShellDb
) {
  const steps = await database
    .select({ nodeId: customShellAutomationRunSteps.nodeId })
    .from(customShellAutomationRunSteps)
    .where(
      and(
        eq(customShellAutomationRunSteps.runId, run.id),
        eq(customShellAutomationRunSteps.kind, "audience"),
        eq(customShellAutomationRunSteps.status, "completed")
      )
    )
  if (steps.length === 0) return null

  const config = automationCompiledConfigSchema.parse(run.configSnapshot)
  const completed = new Set(steps.map((step) => step.nodeId))
  const visited = new Set([currentNodeId])
  let frontier = [currentNodeId]

  while (frontier.length > 0) {
    const parents = Array.from(
      new Set(
        config.edges
          .filter((edge) => frontier.includes(edge.to))
          .map((edge) => edge.from)
          .filter((id) => !visited.has(id))
      )
    )
    const audiences = parents.filter(
      (id) => completed.has(id) && config.nodes[id]?.kind === "audience"
    )
    if (audiences.length > 1) {
      throw new Error(
        "More than one completed Audience step can feed this email, so the run cannot safely choose who to contact."
      )
    }
    if (audiences.length === 1) {
      return readAutomationAudience(config.nodes[audiences[0]].settings)
    }

    for (const id of parents) visited.add(id)
    frontier = parents
  }

  throw new Error(
    "This run's completed Audience step does not feed this email, so nobody was emailed."
  )
}

/** The run's one subject member, used only when no Audience step came first. */
async function subjectRecipient(
  run: CustomShellAutomationRun,
  workspaceId: string,
  database: CustomShellDb
): Promise<Recipient | null> {
  if (!run.subjectUserId) return null

  const [recipient] = await database
    .select({
      id: customShellContacts.id,
      userId: customShellContacts.userId,
      email: customShellContacts.email,
      firstName: customShellContacts.firstName,
      lastName: customShellContacts.lastName,
      emailVerifiedAt: customShellUsers.emailVerifiedAt,
    })
    .from(customShellContacts)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellContacts.userId)
    )
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        eq(customShellContacts.userId, run.subjectUserId),
        eq(customShellContacts.status, "subscribed"),
        eq(customShellUsers.status, "active")
      )
    )
    .limit(1)

  return recipient ?? null
}

function isProduction() {
  return (
    process.env.CUSTOM_SHELL_API_ENV === "production" ||
    process.env.NODE_ENV === "production"
  )
}

/** Real Resend in production; the existing logging provider in local work. */
async function emailProvider(
  workspaceId: string,
  database: CustomShellDb
): Promise<{ provider: EmailProvider; from: string }> {
  const config = await getSendableEmailConfig(workspaceId, database)
  if (config) {
    return {
      provider: getEmailProvider(config.apiKey),
      from: config.from,
    }
  }
  if (isProduction()) {
    throw new Error(
      "Email is not set up for this workspace. Add a sender and Resend key in Settings → Email."
    )
  }

  return {
    provider: getEmailProvider(""),
    from: process.env.CUSTOM_SHELL_EMAIL_FROM || DEV_FROM,
  }
}

/** Keep a long send's five-minute engine claim alive while batches run. */
async function refreshRunClaim(
  run: CustomShellAutomationRun,
  database: CustomShellDb,
  timestamp: Date
) {
  if (!run.claimToken) return
  const [stillOurs] = await database
    .update(customShellAutomationRuns)
    .set({ claimedAt: timestamp })
    .where(
      and(
        eq(customShellAutomationRuns.id, run.id),
        eq(customShellAutomationRuns.claimToken, run.claimToken)
      )
    )
    .returning({ id: customShellAutomationRuns.id })
  if (!stillOurs) {
    throw new Error("This email step lost its run claim before it finished.")
  }
}

/**
 * Sends one recipient after reserving their paper-trail row.
 *
 * The future volume guard belongs before the first call to this function. More
 * suppression rules belong in audience/subject selection, before a row is
 * reserved. That keeps every safety check ahead of the irreversible send.
 */
async function sendRecipient({
  recipient,
  run,
  nodeId,
  subjectTemplate,
  htmlTemplate,
  includeUnsubscribe,
  provider,
  from,
  database,
  timestamp,
}: {
  recipient: Recipient
  run: CustomShellAutomationRun
  nodeId: string
  subjectTemplate: string
  htmlTemplate: string
  includeUnsubscribe: boolean
  provider: EmailProvider
  from: string
  database: CustomShellDb
  timestamp: Date
}) {
  const id = uuid()
  const unsubscribeUrl = includeUnsubscribe
    ? buildUnsubscribeUrl(recipient.id)
    : undefined
  const subject = personalizeEmail(subjectTemplate, recipient, {
    html: false,
  }).replace(/[\r\n]+/g, " ")
  const html = personalizeEmail(htmlTemplate, recipient, {
    html: true,
    unsubscribeUrl,
  })
  const [reserved] = await database
    .insert(customShellAutomationDeliveries)
    .values({
      id,
      runId: run.id,
      nodeId,
      contactId: recipient.id,
      userId: recipient.userId,
      toEmail: recipient.email,
      subject,
      status: "failed",
      error: "The send was interrupted, so delivery could not be confirmed.",
      createdAt: timestamp,
    })
    .onConflictDoNothing()
    .returning({ id: customShellAutomationDeliveries.id })
  if (!reserved) return

  let status: "sent" | "failed" = "failed"
  let providerMessageId: string | null = null
  let errorMessage: string | null = null
  try {
    const result = await provider.send({
      from,
      to: recipient.email,
      subject,
      html,
      ...(unsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    })
    status = result.success ? "sent" : "failed"
    providerMessageId = result.messageId ?? null
    errorMessage = result.success
      ? null
      : (result.error ?? "The send did not go through")
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
  }

  await database
    .update(customShellAutomationDeliveries)
    .set({ status, providerMessageId, error: errorMessage })
    .where(eq(customShellAutomationDeliveries.id, id))
}

/** Runs the built-in Send Email node. */
export async function executeSendEmailNode({
  database,
  run,
  nodeId,
  settings: rawSettings,
  now,
}: SendEmailContext) {
  const settings = readSendEmailSettings(rawSettings)
  // The run's own workspace, fixed when it started. See executors.ts.
  const workspaceId =
    run.workspaceId ?? (await currentWorkspaceId(run.userId, database))
  await syncContactsFromUsers(workspaceId, database)

  const audience = await audienceForRun(run, nodeId, database)
  const fixedAt = now()
  const htmlTemplate = renderBroadcastEmailHtml(settings.blocks, {
    preheader: settings.preheader,
  })
  const includeUnsubscribe = settings.blocks.some(
    (block) => block.kind === "footer" && block.content.showUnsubscribe
  )
  let skipped = 0
  let attempted = 0
  let emptyReason = ""
  let sender: Awaited<ReturnType<typeof emailProvider>> | null = null

  const processRecipient = async (recipient: Recipient) => {
    if (recipient.userId && !recipient.emailVerifiedAt) {
      skipped += 1
      return
    }
    if (includeUnsubscribe && !canBuildUnsubscribeLinks()) {
      throw new Error(
        "Unsubscribe links are not set up, so this email cannot be sent safely."
      )
    }
    sender ??= await emailProvider(workspaceId, database)
    if (attempted % CLAIM_REFRESH_EVERY === 0) {
      await refreshRunClaim(run, database, now())
    }
    attempted += 1
    await sendRecipient({
      recipient,
      run,
      nodeId,
      subjectTemplate: settings.subject,
      htmlTemplate,
      includeUnsubscribe,
      provider: sender.provider,
      from: composeFromAddress(settings.fromName, sender.from),
      database,
      timestamp: now(),
    })
  }

  if (audience) {
    let after: { createdAt: Date; id: string } | undefined
    while (true) {
      const page = await listAutomationAudienceContacts(
        audience,
        workspaceId,
        { limit: SEND_BATCH_SIZE, after, timestamp: fixedAt },
        database
      )
      for (const recipient of page) await processRecipient(recipient)
      const last = page.at(-1)
      if (!last || page.length < SEND_BATCH_SIZE) break
      after = { createdAt: last.createdAt, id: last.id }
    }
  } else {
    const recipient = await subjectRecipient(run, workspaceId, database)
    if (recipient) {
      await processRecipient(recipient)
    } else {
      emptyReason = run.subjectUserId
        ? "the member this run was about could not receive email"
        : "this run had no Audience step and was not about a member"
    }
  }

  if (attempted > 0) await refreshRunClaim(run, database, now())

  const [counts] = await database
    .select({
      sent: sql<number>`count(*) filter (where ${customShellAutomationDeliveries.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${customShellAutomationDeliveries.status} = 'failed')::int`,
    })
    .from(customShellAutomationDeliveries)
    .where(
      and(
        eq(customShellAutomationDeliveries.runId, run.id),
        eq(customShellAutomationDeliveries.nodeId, nodeId)
      )
    )

  const sent = counts?.sent ?? 0
  const failed = counts?.failed ?? 0
  if (sent === 0 && failed === 0 && skipped === 0) {
    return {
      type: "next" as const,
      summary: `Emailed 0, 0 failed — ${emptyReason || "nobody matched the audience"}.`,
    }
  }
  return {
    type: "next" as const,
    summary: `Emailed ${sent}, ${failed} failed, ${skipped} skipped because their email was not confirmed.`,
  }
}
