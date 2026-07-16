import { z } from "zod"

import { ensureTickerStarted } from "@/server/automations/engine"
import { enrollContact } from "@/server/automations/enroll"
import {
  CONNECTION_SECRET_PREFIX,
  findConnectionBySecret,
} from "@/server/connections"
import { upsertContact } from "@/server/contacts"

const INGEST_MAX_PER_MINUTE = 120
const INGEST_WINDOW_SECONDS = 60
const INGEST_MAX_BODY_BYTES = 64 * 1024

// In-memory sliding window per connection — fine for this single-process app;
// a shared store would be needed if the server ever runs multiple instances.
const ingestRequests = new Map<string, number[]>()

const ingestBodySchema = z.object({
  email: z.string().trim().max(255).pipe(z.email()),
  firstName: z.string().trim().max(255).optional(),
  lastName: z.string().trim().max(255).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

export async function handleIngestRequest(request: Request): Promise<Response> {
  ensureTickerStarted()

  const secret = bearerSecret(request)
  const connection = secret ? await findConnectionBySecret(secret) : null
  if (!connection) {
    return Response.json(
      { detail: "Invalid connection secret" },
      { status: 401 }
    )
  }

  if (isIngestRateLimited(connection.id)) {
    return Response.json({ detail: "Too many requests" }, { status: 429 })
  }

  let text: string
  try {
    text = await request.text()
  } catch {
    return Response.json({ detail: "Invalid JSON" }, { status: 400 })
  }
  if (text.length > INGEST_MAX_BODY_BYTES) {
    return Response.json({ detail: "Request body too large" }, { status: 413 })
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return Response.json({ detail: "Invalid JSON" }, { status: 400 })
  }

  const parsed = ingestBodySchema.safeParse(json)
  if (!parsed.success) {
    return Response.json(
      { detail: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    )
  }

  const contact = await upsertContact(connection.workspaceId, {
    ...parsed.data,
    source: connection.appKey,
  })

  const enrolledAutomationIds = await enrollContact(
    connection.workspaceId,
    contact,
    connection.appKey
  )

  return Response.json({
    contact: {
      id: contact.id,
      email: contact.email,
      tags: contact.tags,
      source: contact.source,
      status: contact.status,
    },
    enrolledAutomationIds,
  })
}

function bearerSecret(request: Request) {
  const header = request.headers.get("authorization") ?? ""
  const [scheme, token] = header.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) return null
  if (!token.startsWith(CONNECTION_SECRET_PREFIX)) return null
  return token
}

function isIngestRateLimited(connectionId: string) {
  const cutoff = Date.now() / 1000 - INGEST_WINDOW_SECONDS
  const recent = (ingestRequests.get(connectionId) ?? []).filter(
    (time) => time > cutoff
  )
  if (recent.length >= INGEST_MAX_PER_MINUTE) {
    ingestRequests.set(connectionId, recent)
    return true
  }
  recent.push(Date.now() / 1000)
  ingestRequests.set(connectionId, recent)
  return false
}
