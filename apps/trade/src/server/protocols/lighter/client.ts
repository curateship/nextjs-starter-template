import type { NetworkId } from "@/lib/protocols/contracts"
import {
  reserveLighterRequest,
  clearLighterBudgets,
} from "@/server/protocols/lighter/budget"
import { lighterRefusalError } from "@/server/protocols/lighter/refusals"
import { LIGHTER_PRIVATE_KEY_BYTES } from "@/server/protocols/lighter/signer"
import {
  isTimeout,
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"
import { scrubbedMessage } from "@/server/protocols/scrub"

/**
 * Mainnet only. The registry lists no other network for Lighter, so a
 * testnet call reaching this deep is a bug, stopped loudly rather than sent
 * to a host nothing should ever talk to.
 *
 * Lighter runs a testnet and it is deliberately not carried (decided 26 Aug
 * 2026). It held three markets, had been reset two days earlier, and served
 * zero candles on every timeframe over a 400-day window, so there was nothing
 * to look at there. The signing work proves itself the way Phemex's and
 * KuCoin's did: signed READS first, which cost nothing and move no money,
 * then one deliberately tiny real order behind both real-money switches.
 */
function restBase(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("LIGHTER_NETWORK_UNSUPPORTED")
  return "https://mainnet.zklighter.elliot.ai"
}

/**
 * How long Lighter is left alone after a 429 or 405.
 *
 * Sixty seconds rather than the shared rationing file's twenty, because
 * Lighter's own docs state a static 60-second firewall cooldown — asking
 * again at twenty would spend a third of the next minute's sixty requests on
 * refusals. Held here rather than in `rationing.ts` so the other venues keep
 * their measured shorter hold.
 */
const RATE_HOLD_MS = 60_000

const holds = new Map<NetworkId, number>()

function assertAvailable(network: NetworkId): void {
  const until = holds.get(network)
  if (until === undefined) return
  if (Date.now() >= until) {
    holds.delete(network)
    return
  }
  throw new Error("EXCHANGE_BUSY")
}

type LighterEnvelope = { code?: unknown; message?: unknown }

/**
 * One budgeted public Lighter read.
 *
 * `weight` is Lighter's stated weight for the endpoint, declared at the call
 * site the way Aster's client demands it. A Standard account's cap counts
 * requests rather than weight, so the budget spends one request either way —
 * the weight rides along for the snapshot and the doc's arithmetic.
 */
export async function lighterPublic(
  network: NetworkId,
  path: string,
  weight: number,
  params: Record<string, string | number> = {},
  /**
   * `"watched"` for a request somebody is sitting in front of — a chart they
   * just opened. It keeps a little of the minute back from the idle reads,
   * which ask first on every poll and would otherwise take the lot.
   */
  priority: "background" | "watched" = "background"
): Promise<unknown> {
  assertAvailable(network)
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new Error("LIGHTER_REQUEST_WEIGHT_INVALID")
  }
  const base = restBase(network)
  reserveLighterRequest(network, { weight, priority })

  const url = new URL(path, base)
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
    throw new Error(scrubbedMessage(error))
  }

  if (response.status === 429 || response.status === 405) {
    holds.set(network, Date.now() + RATE_HOLD_MS)
    throw lighterRefusalError({ status: response.status, code: "" })
  }

  const payload = (await response
    .json()
    .catch(() => null)) as LighterEnvelope | null
  // Lighter answers `code: 200` inside a healthy body; anything else is its
  // own refusal code, kept as a number and never as its free-form text.
  const code =
    payload !== null &&
    (typeof payload.code === "number" || typeof payload.code === "string")
      ? String(payload.code)
      : String(response.status)
  if (!response.ok || (payload !== null && code !== "200")) {
    throw lighterRefusalError({ status: response.status, code })
  }
  return payload
}

/**
 * Sends one signed transaction. This is the only call in the Lighter folder
 * that changes anything.
 *
 * Form-encoded, not JSON: `sendTx` wants `tx_type` and `tx_info` as ordinary
 * form fields, with the body exactly as the signer produced it. Nothing here
 * re-encodes or reformats that string, because the signature covers it.
 *
 * **It counts as order work in the budget**, so it may use the fifth of the
 * minute that background reads are kept out of.
 */
export async function lighterSendTx(
  network: NetworkId,
  input: { txType: number; txInfo: string }
): Promise<unknown> {
  assertAvailable(network)
  const base = restBase(network)
  reserveLighterRequest(network, { weight: SEND_TX_WEIGHT, priority: "order" })

  const body = new URLSearchParams()
  body.set("tx_type", String(input.txType))
  body.set("tx_info", input.txInfo)

  let response: Response
  try {
    response = await fetch(new URL("/api/v1/sendTx", base), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: requestSignal(READ_TIMEOUT_MS),
    })
  } catch (error) {
    if (isTimeout(error)) throw new Error("EXCHANGE_BUSY")
    throw new Error(scrubbedMessage(error))
  }

  if (response.status === 429 || response.status === 405) {
    holds.set(network, Date.now() + RATE_HOLD_MS)
    throw lighterRefusalError({ status: response.status, code: "" })
  }

  const payload = (await response
    .json()
    .catch(() => null)) as LighterEnvelope | null
  const code =
    payload !== null &&
    (typeof payload.code === "number" || typeof payload.code === "string")
      ? String(payload.code)
      : String(response.status)
  if (!response.ok || (payload !== null && code !== "200")) {
    throw lighterRefusalError({ status: response.status, code })
  }
  return payload
}

/** Lighter's docs put `sendTx` at weight 6. */
const SEND_TX_WEIGHT = 6

/**
 * One read that needs the account's own signature.
 *
 * Lighter takes the auth token as an `auth` query parameter. It is a signed
 * string with a deadline in it, not a secret of lasting value, but it is
 * still an account credential — so it goes on the query the same way Lighter
 * expects and never into a log or a refusal.
 */
export async function lighterPrivate(
  network: NetworkId,
  path: string,
  weight: number,
  token: string,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  return lighterPublic(network, path, weight, { ...params, auth: token })
}

/**
 * The credential blob, which for Lighter is the API private key and nothing
 * else.
 *
 * Lighter's account number and the slot its key sits in are not stored: they
 * are Lighter's own answers, looked up when needed and cached. Writing them
 * down at save time would go stale the day a key is registered again in a
 * different slot, and a stale index signs perfectly valid rubbish that
 * Lighter then refuses — which reads as a bad key.
 *
 * Opaque outside this folder, as `OrderAuth.agentKey` requires.
 */
export function packLighterCredential(input: {
  agentKey?: string
  secret?: string
}): string {
  /**
   * **The pasted key arrives as `secret`, not `agentKey`.** The wallet dialog
   * chooses between those two field names from `secretIsAgentKey`, and
   * Lighter's is false because its keys are its own 40-byte kind rather than
   * an Ethereum agent key. Reading only `agentKey` here meant every save
   * arrived with an empty key and was refused as malformed — while the field
   * on screen plainly had a key in it.
   *
   * Both names are read, so that flag and this function can never disagree
   * again. That is not future-proofing for a case nobody has met: it is the
   * bug above, which reached a person.
   */
  const pasted = (input.secret ?? input.agentKey ?? "").trim()
  if (!pasted) throw new Error("KEY_SECRET_REQUIRED")
  const bare = bareLighterKey(pasted)
  if (bare === null) {
    throw new Error(
      `KEY_NOT_APPROVED:A Lighter API key is ${LIGHTER_PRIVATE_KEY_BYTES} bytes — ${LIGHTER_PRIVATE_KEY_BYTES * 2} characters of hex, with or without the leading 0x. Copy the private key Lighter showed you when you made the API key.`
    )
  }
  return `0x${bare}`
}

/**
 * Reads back what `packLighterCredential` stored. A blob that no longer
 * reads is a stored credential problem rather than something just typed, so
 * it refuses with the code the trading paths already know.
 */
export function parseLighterCredential(blob: string): { privateKey: string } {
  const bare = bareLighterKey(blob)
  if (bare === null) throw new Error("LIVE_WALLET_KEY")
  return { privateKey: `0x${bare}` }
}

/**
 * Lighter's keys are exactly forty bytes — its own signer refuses anything
 * else, naming the length it wanted. Checked here too so a mistyped key is
 * caught before it reaches the signer. Answers null rather than throwing, so
 * each caller can refuse in the words its own situation needs, and neither
 * ever repeats the key back.
 */
function bareLighterKey(value: string): string | null {
  const bare = value.trim().replace(/^0x/i, "").toLowerCase()
  const wanted = LIGHTER_PRIVATE_KEY_BYTES * 2
  return bare.length === wanted && /^[0-9a-f]+$/.test(bare) ? bare : null
}

/** Test state must not carry a hold or a spent minute into another case. */
export function clearLighterClientState(): void {
  holds.clear()
  clearLighterBudgets()
}
