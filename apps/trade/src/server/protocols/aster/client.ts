import type { NetworkId } from "@/lib/protocols/contracts"
import {
  isTimeout,
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"

const REST_BASE: Record<NetworkId, string> = {
  mainnet: "https://fapi.asterdex.com",
  testnet: "https://fapi.asterdex-testnet.com",
}

type AsterError = { code?: unknown; msg?: unknown }

/** One public V3 read, with the host and failure wording kept in one place. */
export async function asterPublic(
  network: NetworkId,
  path: string,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  const url = new URL(path, REST_BASE[network])
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: requestSignal(READ_TIMEOUT_MS),
    })
  } catch (error) {
    if (isTimeout(error)) throw new Error("EXCHANGE_BUSY")
    throw error
  }

  if (response.status === 418 || response.status === 429) {
    throw new Error("EXCHANGE_BUSY")
  }

  const payload = (await response.json().catch(() => null)) as AsterError | null
  if (!response.ok) {
    const code =
      typeof payload?.code === "number" || typeof payload?.code === "string"
        ? String(payload.code)
        : String(response.status)
    throw new Error(`ASTER_${code}:${path}`)
  }
  if (
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.code === "number" &&
    payload.code < 0
  ) {
    throw new Error(`ASTER_${payload.code}:${path}`)
  }
  return payload
}
