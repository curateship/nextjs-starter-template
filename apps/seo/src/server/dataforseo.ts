import { createHash } from "node:crypto"

import { count, eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { apiUsageLogs } from "@/server/schema"

export type ApiCallContext = {
  userId: string
  projectId?: string
  jobId?: string
  endpointName: string
  keywordCount?: number
}

export type DataForSeoTask<TResult> = {
  status_code: number
  status_message: string
  cost: number | null
  result: TResult[] | null
}

export type DataForSeoResponse<TResult> = {
  status_code: number
  status_message: string
  cost: number | null
  tasks: DataForSeoTask<TResult>[] | null
}

export class DataForSeoError extends Error {
  retryable: boolean
  statusCode: number | null

  constructor(
    message: string,
    options: { retryable?: boolean; statusCode?: number | null } = {}
  ) {
    super(message)
    this.name = "DataForSeoError"
    this.retryable = options.retryable ?? false
    this.statusCode = options.statusCode ?? null
  }
}

const MAX_ATTEMPTS = 3

export function getMaxRequestsPerJob() {
  return Number.parseInt(
    process.env.MAX_DATAFORSEO_REQUESTS_PER_JOB || "100",
    10
  )
}

export function buildBasicAuthHeader(login: string, password: string) {
  return `Basic ${Buffer.from(`${login}:${password}`, "utf8").toString("base64")}`
}

export function hashPayload(payload: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(payload) ?? "", "utf8")
    .digest("hex")
}

function getBaseUrl() {
  const useSandbox = process.env.DATAFORSEO_USE_SANDBOX === "true"
  if (useSandbox) {
    return (
      process.env.DATAFORSEO_SANDBOX_BASE_URL || "https://sandbox.dataforseo.com"
    )
  }
  return process.env.DATAFORSEO_BASE_URL || "https://api.dataforseo.com"
}

function getCredentials() {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) {
    throw new DataForSeoError(
      "DataForSEO credentials are not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD."
    )
  }
  return { login, password }
}

async function logUsage(
  context: ApiCallContext,
  path: string,
  payloadHash: string | null,
  result: {
    cost: number | null
    statusCode: number | null
    statusMessage: string
    success: boolean
  },
  database: CustomShellDb
) {
  try {
    await database.insert(apiUsageLogs).values({
      userId: context.userId,
      projectId: context.projectId ?? null,
      jobId: context.jobId ?? null,
      provider: "dataforseo",
      endpoint: path,
      requestPayloadHash: payloadHash,
      requestCount: 1,
      keywordCount: context.keywordCount ?? null,
      cost: result.cost != null ? String(result.cost) : null,
      statusCode: result.statusCode,
      statusMessage: result.statusMessage.slice(0, 1000),
      success: result.success,
    })
  } catch (error) {
    console.error("Failed to log DataForSEO usage", error)
  }
}

async function assertJobRequestLimit(jobId: string, database: CustomShellDb) {
  const [row] = await database
    .select({ value: count() })
    .from(apiUsageLogs)
    .where(eq(apiUsageLogs.jobId, jobId))

  if ((row?.value ?? 0) >= getMaxRequestsPerJob()) {
    throw new DataForSeoError(
      `Job exceeded the DataForSEO request safety limit (${getMaxRequestsPerJob()} requests).`
    )
  }
}

async function request<TResult>(
  method: "GET" | "POST",
  path: string,
  body: unknown[] | null,
  context: ApiCallContext,
  database: CustomShellDb
): Promise<DataForSeoResponse<TResult>> {
  const { login, password } = getCredentials()

  if (context.jobId) {
    await assertJobRequestLimit(context.jobId, database)
  }

  const payloadHash = body ? hashPayload(body) : null
  let lastError: DataForSeoError | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response
    try {
      response = await fetch(`${getBaseUrl()}${path}`, {
        method,
        headers: {
          Authorization: buildBasicAuthHeader(login, password),
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      lastError = new DataForSeoError(
        `DataForSEO network error: ${error instanceof Error ? error.message : "unknown"}`,
        { retryable: true }
      )
      await backoff(attempt)
      continue
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new DataForSeoError(
        `DataForSEO responded with HTTP ${response.status}.`,
        { retryable: true, statusCode: response.status }
      )
      await logUsage(
        context,
        path,
        payloadHash,
        {
          cost: null,
          statusCode: response.status,
          statusMessage: `HTTP ${response.status}`,
          success: false,
        },
        database
      )
      await backoff(attempt, response.status === 429 ? 4000 : 1000)
      continue
    }

    let parsed: DataForSeoResponse<TResult>
    try {
      parsed = (await response.json()) as DataForSeoResponse<TResult>
    } catch {
      throw new DataForSeoError("DataForSEO returned an invalid response.", {
        statusCode: response.status,
      })
    }

    const success = response.ok && parsed.status_code === 20000
    await logUsage(
      context,
      path,
      payloadHash,
      {
        cost: parsed.cost ?? null,
        statusCode: parsed.status_code ?? response.status,
        statusMessage: parsed.status_message || `HTTP ${response.status}`,
        success,
      },
      database
    )

    if (!success) {
      throw new DataForSeoError(
        `DataForSEO error ${parsed.status_code ?? response.status}: ${parsed.status_message || "request failed"}`,
        { statusCode: parsed.status_code ?? response.status }
      )
    }

    return parsed
  }

  const finalError =
    lastError ?? new DataForSeoError("DataForSEO request failed.")
  await logUsage(
    context,
    path,
    payloadHash,
    {
      cost: null,
      statusCode: finalError.statusCode,
      statusMessage: finalError.message,
      success: false,
    },
    database
  )
  throw finalError
}

function backoff(attempt: number, baseMs = 1000) {
  if (attempt >= MAX_ATTEMPTS) return Promise.resolve()
  return new Promise((resolve) =>
    setTimeout(resolve, baseMs * 2 ** (attempt - 1))
  )
}

export function dataForSeoPost<TResult>(
  path: string,
  tasks: unknown[],
  context: ApiCallContext,
  database: CustomShellDb = db
) {
  return request<TResult>("POST", path, tasks, context, database)
}

export function dataForSeoGet<TResult>(
  path: string,
  context: ApiCallContext,
  database: CustomShellDb = db
) {
  return request<TResult>("GET", path, null, context, database)
}

/** Flattens successful task results; collects task-level errors for reporting. */
export function collectTaskResults<TResult>(
  response: DataForSeoResponse<TResult>
): { results: TResult[]; errors: string[] } {
  const results: TResult[] = []
  const errors: string[] = []
  for (const task of response.tasks ?? []) {
    if (task.status_code === 20000) {
      results.push(...(task.result ?? []))
    } else {
      errors.push(`${task.status_code}: ${task.status_message}`)
    }
  }
  return { results, errors }
}
