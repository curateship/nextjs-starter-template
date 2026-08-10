import { describe, expect, it, vi } from "vitest"

import type { AutomationExecutorContext } from "./executors"
import {
  resolvePublicWebhookTarget,
  type PublicWebhookTarget,
} from "./net-guard"
import { executeWebhookNode } from "./webhook"
import type { CustomShellAutomationRun } from "../schema"

const target: PublicWebhookTarget = {
  url: new URL("https://hooks.example.com/automation"),
  address: "93.184.216.34",
  family: 4 as const,
}

function context(
  overrides: Partial<AutomationExecutorContext> = {}
): AutomationExecutorContext {
  const run = {
    id: "run-1",
    automationId: "flow-1",
    subjectUserId: "member-1",
    triggerKind: "billingMoment",
    triggerFacts: { invoiceNumber: "INV-42", amountDue: "$20.00" },
  } as unknown as CustomShellAutomationRun
  const database = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ email: "member@example.com" }] }),
      }),
    }),
  } as unknown as AutomationExecutorContext["database"]

  return {
    database,
    run,
    nodeId: "webhook-1",
    settings: {
      url: "https://hooks.example.com/automation",
      secret: "shared-secret",
    },
    now: () => new Date("2026-08-09T14:30:00.000Z"),
    ...overrides,
  }
}

type TestDependencies = NonNullable<Parameters<typeof executeWebhookNode>[1]>

function dependencies(
  send: TestDependencies["send"],
  overrides: Partial<TestDependencies> = {}
): TestDependencies {
  const times = [100, 142]
  return {
    resolveTarget: async () => target,
    send,
    timeoutMs: 10_000,
    elapsed: () => times.shift() ?? 142,
    ...overrides,
  }
}

describe("Webhook executor", () => {
  it("posts the documented payload and reports the status and duration", async () => {
    const send = vi.fn(async () => 204)

    await expect(
      executeWebhookNode(context(), dependencies(send))
    ).resolves.toEqual({
      type: "next",
      summary: "Webhook returned HTTP 204 in 42 ms.",
    })
    expect(send).toHaveBeenCalledWith(
      target,
      {
        event: "billingMoment",
        timestamp: "2026-08-09T14:30:00.000Z",
        automation: { id: "flow-1", runId: "run-1" },
        subject: { id: "member-1", email: "member@example.com" },
        facts: { invoiceNumber: "INV-42", amountDue: "$20.00" },
      },
      "shared-secret",
      expect.any(AbortSignal)
    )
  })

  it("fails a non-success status so the engine can retry it", async () => {
    await expect(
      executeWebhookNode(
        context(),
        dependencies(async () => 500)
      )
    ).rejects.toThrow("HTTP 500 after 42 ms")
  })

  it("aborts and fails a request that reaches the short timeout", async () => {
    const send = (
      _target: PublicWebhookTarget,
      _payload: unknown,
      _secret: string,
      signal: AbortSignal
    ) =>
      new Promise<number>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")))
      })

    await expect(
      executeWebhookNode(context(), dependencies(send, { timeoutMs: 1 }))
    ).rejects.toThrow("timed out after 1 seconds")
  })

  it("refuses a private target at run time before sending", async () => {
    const send = vi.fn(async () => 204)
    await expect(
      executeWebhookNode(
        context({
          settings: { url: "https://127.0.0.1/hook", secret: "" },
        }),
        dependencies(send, { resolveTarget: resolvePublicWebhookTarget })
      )
    ).rejects.toThrow("private or internal")
    expect(send).not.toHaveBeenCalled()
  })

  it("describes a dry run without resolving or sending", async () => {
    const resolveTarget = vi.fn(async () => target)
    const send = vi.fn(async () => 204)
    await expect(
      executeWebhookNode(
        context({ dryRun: true }),
        dependencies(send, { resolveTarget })
      )
    ).resolves.toEqual({
      type: "next",
      summary: "Would have called https://hooks.example.com/automation.",
    })
    expect(resolveTarget).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
