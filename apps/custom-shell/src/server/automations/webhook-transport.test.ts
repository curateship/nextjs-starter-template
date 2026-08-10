import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"

import { beforeEach, describe, expect, it, vi } from "vitest"

const https = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock("node:https", () => ({ request: https.request }))

import type { PublicWebhookTarget } from "./net-guard"
import { sendWebhookRequest, type WebhookPayload } from "./webhook"

const payload: WebhookPayload = {
  event: "paymentFailed",
  timestamp: "2026-08-09T14:30:00.000Z",
  automation: { id: "flow-1", runId: "run-1" },
  subject: { id: "member-1", email: "member@example.com" },
  facts: { invoiceNumber: "INV-42" },
}

let requestOptions: Record<string, unknown>
let requestBody: string
let responseDestroyed: boolean

beforeEach(() => {
  requestOptions = {}
  requestBody = ""
  responseDestroyed = false
  https.request.mockReset()
  https.request.mockImplementation((options, onResponse) => {
    requestOptions = options as Record<string, unknown>
    const request = new EventEmitter() as EventEmitter & {
      end: (body: string) => void
    }
    request.end = (body) => {
      requestBody = body
      const response = new PassThrough() as PassThrough & {
        statusCode: number
      }
      response.statusCode = 202
      const respond = onResponse as (
        response: PassThrough & { statusCode: number }
      ) => void
      respond(response)
      responseDestroyed = response.destroyed
    }
    return request
  })
})

describe("Webhook HTTPS transport", () => {
  it("pins the approved address and sends the documented header and body", async () => {
    const target: PublicWebhookTarget = {
      url: new URL("https://hooks.example.com:8443/automation?source=flow"),
      address: "93.184.216.34",
      family: 4,
    }

    await expect(
      sendWebhookRequest(
        target,
        payload,
        "shared-secret",
        new AbortController().signal
      )
    ).resolves.toBe(202)

    expect(requestOptions).toMatchObject({
      protocol: "https:",
      hostname: "93.184.216.34",
      family: 4,
      port: "8443",
      path: "/automation?source=flow",
      method: "POST",
      servername: "hooks.example.com",
    })
    expect(requestOptions.headers).toMatchObject({
      host: "hooks.example.com:8443",
      "content-type": "application/json",
      "X-Webhook-Secret": "shared-secret",
    })
    expect(JSON.parse(requestBody)).toEqual(payload)
    expect(responseDestroyed).toBe(true)
  })

  it("does not send an IP literal as a TLS server name", async () => {
    const target: PublicWebhookTarget = {
      url: new URL("https://[2606:4700:4700::1111]/automation"),
      address: "2606:4700:4700::1111",
      family: 6,
    }

    await sendWebhookRequest(target, payload, "", new AbortController().signal)
    expect(requestOptions.servername).toBeUndefined()
  })
})
