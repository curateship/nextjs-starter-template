import {
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"

export type ServiceConfig = {
  label: string
  base: string
  /** Requests allowed in one rolling window. */
  cap: number
  windowMs: number
  /** Kept back from reads so a swap always has room. */
  reserve: number
  /** Stop asking for at least a minute after a 429, instead of retrying. */
  pauseAfter429?: boolean
}
type Priority = "read" | "order"

/**
 * One chain's outside services, each with its own rolling allowance.
 *
 * A read the window has no room for is refused at once as `EXCHANGE_BUSY:`
 * with the count. A 429 is retried once after the service's own wait, capped
 * at five seconds, never in a loop. `code` names the chain's error codes, such
 * as `<code>_REFUSED`. Every chain gets its own counts.
 */
export function evmServices<S extends string>(
  services: Record<S, ServiceConfig>,
  code: string
) {
  const sentAt = Object.fromEntries(
    Object.keys(services).map((name) => [name, [] as number[]])
  ) as Record<S, number[]>
  const pausedUntil = new Map<S, number>()

  function pausedMessage(service: S): string {
    return `EXCHANGE_BUSY:${services[service].label} — requests are paused after a rate-limit response`
  }

  function reserve(
    service: S,
    priority: Priority = "read",
    ceiling = Infinity
  ): void {
    const config = services[service]
    const now = Date.now()
    if (now < (pausedUntil.get(service) ?? 0))
      throw new Error(pausedMessage(service))
    const sent = sentAt[service]
    while (sent.length && sent[0] <= now - config.windowMs) sent.shift()
    const cap = Math.min(
      ceiling,
      config.cap - (priority === "read" ? config.reserve : 0)
    )
    if (sent.length >= cap) {
      throw new Error(
        `EXCHANGE_BUSY:${config.label} spent ${sent.length} of ${cap} requests in ${config.windowMs / 1000} seconds.`
      )
    }
    sent.push(now)
  }

  /** Reads only. Signed transactions must never use a retrying request. */
  async function get(
    service: S,
    path: string,
    params: Record<string, string | number> = {},
    priority: Priority = "read",
    ceiling = Infinity
  ): Promise<unknown> {
    const config = services[service]
    const url = new URL(path, config.base)
    if (url.origin !== config.base || url.username || url.password)
      throw new Error(`${code}_PATH`)
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, String(value))
    async function send(): Promise<Response> {
      reserve(service, priority, ceiling)
      try {
        return await fetch(url, {
          headers: { accept: "application/json" },
          signal: requestSignal(READ_TIMEOUT_MS),
          redirect: "error",
        })
      } catch {
        // Do not expose a provider URL or response containing credentials.
        throw new Error(
          `EXCHANGE_BUSY:${config.label} did not answer. Try again shortly.`
        )
      }
    }
    let response = await send()
    if (response.status === 429 && config.pauseAfter429) {
      const retryAfter = response.headers.get("retry-after")
      const seconds = Number(retryAfter)
      const retryAt =
        retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) : NaN
      const delay = Number.isFinite(retryAt)
        ? retryAt - Date.now()
        : Number.isFinite(seconds)
          ? seconds * 1000
          : 0
      pausedUntil.set(service, Date.now() + Math.max(60_000, delay))
      throw new Error(pausedMessage(service))
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"))
      const delay =
        Number.isFinite(seconds) && seconds > 0
          ? Math.min(seconds * 1000, 5000)
          : 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
      response = await send()
    }
    if (response.status === 429)
      throw new Error(
        `EXCHANGE_BUSY:${config.label} refused the retry. Try again shortly.`
      )
    if (!response.ok)
      throw new Error(`${code}_REFUSED:${config.label}:${response.status}`)
    try {
      return await response.json()
    } catch {
      throw new Error(`${code}_REFUSED:${config.label}:invalid-json`)
    }
  }

  /** Actual outgoing requests in each rolling window, including retries. */
  function counts(): Record<S, number> {
    const now = Date.now()
    return Object.fromEntries(
      (Object.entries(services) as [S, ServiceConfig][]).map(
        ([name, config]) => [
          name,
          sentAt[name].filter((at) => at > now - config.windowMs).length,
        ]
      )
    ) as Record<S, number>
  }

  return { reserve, get, counts }
}
