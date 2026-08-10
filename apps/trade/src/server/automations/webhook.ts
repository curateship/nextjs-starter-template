import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"

import { eq } from "drizzle-orm"

import {
  readWebhookSettings,
  WEBHOOK_SECRET_HEADER,
} from "@/lib/automations/nodes/webhook"
import type { AutomationTriggerFacts } from "@/lib/automations/run"
import type {
  AutomationExecutorContext,
  AutomationExecutorResult,
} from "@/server/automations/executors"
import {
  resolvePublicWebhookTarget,
  type PublicWebhookTarget,
} from "@/server/automations/net-guard"
import { customShellUsers } from "@/server/schema"

const WEBHOOK_TIMEOUT_MS = 10_000

export type WebhookPayload = {
  event: string
  timestamp: string
  automation: { id: string; runId: string }
  subject: { id: string; email: string } | null
  facts: AutomationTriggerFacts
}

type SendWebhook = (
  target: PublicWebhookTarget,
  payload: WebhookPayload,
  secret: string,
  signal: AbortSignal
) => Promise<number>

type WebhookDependencies = {
  resolveTarget: typeof resolvePublicWebhookTarget
  send: SendWebhook
  timeoutMs: number
  elapsed: () => number
}

const defaultDependencies: WebhookDependencies = {
  resolveTarget: resolvePublicWebhookTarget,
  send: sendWebhookRequest,
  timeoutMs: WEBHOOK_TIMEOUT_MS,
  elapsed: () => performance.now(),
}

/**
 * Calls the outside service once. Throwing is deliberate: the engine records
 * the failed attempt and schedules the retry using its shared policy.
 */
export async function executeWebhookNode(
  context: AutomationExecutorContext,
  dependencies: WebhookDependencies = defaultDependencies
): Promise<AutomationExecutorResult> {
  const settings = readWebhookSettings(context.settings)
  if (context.dryRun) {
    return {
      type: "next",
      summary: `Would have called ${settings.url}.`,
    }
  }

  const startedAt = dependencies.elapsed()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs)

  let status: number
  try {
    const target = await stopOnAbort(
      dependencies.resolveTarget(settings.url),
      controller.signal
    )
    const payload = await stopOnAbort(
      buildWebhookPayload(context),
      controller.signal
    )
    status = await stopOnAbort(
      dependencies.send(target, payload, settings.secret, controller.signal),
      controller.signal
    )
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Webhook timed out after ${Math.max(1, Math.round(dependencies.timeoutMs / 1_000))} seconds.`
      )
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Webhook request failed: ${message}`)
  } finally {
    clearTimeout(timeout)
  }

  const duration = Math.max(0, Math.round(dependencies.elapsed() - startedAt))
  if (status < 200 || status >= 300) {
    throw new Error(`Webhook returned HTTP ${status} after ${duration} ms.`)
  }
  return {
    type: "next",
    summary: `Webhook returned HTTP ${status} in ${duration} ms.`,
  }
}

/** Stops waiting even when the operation itself has no AbortSignal support. */
function stopOnAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("aborted"))
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("aborted"))
    signal.addEventListener("abort", abort, { once: true })
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort)
    })
  })
}

async function buildWebhookPayload(
  context: AutomationExecutorContext
): Promise<WebhookPayload> {
  let subject: WebhookPayload["subject"] = null
  if (context.run.subjectUserId) {
    const [member] = await context.database
      .select({ email: customShellUsers.email })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, context.run.subjectUserId))
      .limit(1)
    if (member) {
      subject = { id: context.run.subjectUserId, email: member.email }
    }
  }

  return {
    event: context.run.triggerKind ?? "automation.manual",
    timestamp: context.now().toISOString(),
    automation: {
      id: context.run.automationId,
      runId: context.run.id,
    },
    subject,
    facts: context.run.triggerFacts ?? {},
  }
}

/**
 * Connects to the already-approved IP while keeping the original hostname for
 * TLS certificate checks and the Host header. Redirects are not followed.
 */
export function sendWebhookRequest(
  target: PublicWebhookTarget,
  payload: WebhookPayload,
  secret: string,
  signal: AbortSignal
): Promise<number> {
  const body = JSON.stringify(payload)
  const originalHostname = target.url.hostname.replace(/^\[|\]$/g, "")
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: target.address,
        family: target.family,
        port: target.url.port || 443,
        path: `${target.url.pathname}${target.url.search}`,
        method: "POST",
        servername: isIP(originalHostname) ? undefined : originalHostname,
        signal,
        headers: {
          host: target.url.host,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          ...(secret ? { [WEBHOOK_SECRET_HEADER]: secret } : {}),
        },
      },
      (response) => {
        const status = response.statusCode ?? 0
        response.destroy()
        resolve(status)
      }
    )
    request.on("error", reject)
    request.end(body)
  })
}
