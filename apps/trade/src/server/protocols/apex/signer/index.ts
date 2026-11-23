import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { TextDecoder, TextEncoder } from "node:util"
import { runInThisContext } from "node:vm"

/**
 * ApeX Omni's own zkLink signer, run in this process.
 *
 * Every ApeX order carries a zkLink signature besides the request's HMAC.
 * ApeX publishes the signer as a prebuilt WebAssembly file with its
 * JavaScript glue in its Node connector, and this folder holds an unedited
 * copy of both. `PROVENANCE.md` names the repository, the commit and each
 * file's checksum.
 *
 * Nothing outside this folder may load either file: `fence.test.ts` fails
 * the build if anything does. Everything the app needs goes through the
 * typed functions at the bottom of this file.
 */

type ZkModule = {
  ZkLinkSigner: { ethSig(seed: string): unknown }
  ContractBuilder: new (
    accountId: number,
    subAccountId: number,
    slotId: number,
    nonce: number,
    pairId: number,
    size: string,
    price: string,
    isBuy: boolean,
    makerFeeRate: number,
    takerFeeRate: number,
    hasSubsidy: boolean
  ) => unknown
  newContract(builder: unknown): {
    sign(signer: unknown): unknown
    jsValue(): { signature?: { pubKey?: string; signature?: string } }
  }
}

const GLUE_FILE = "zklink-sdk-node.js"
const WASM_FILE = "zklink-sdk-node_bg.wasm"

/**
 * Reads one vendored file in each layout this module runs under, the way
 * Lighter's signer does: Nitro's server assets on the website, the source
 * folder in tests and development, the copy beside the engine's bundle.
 */
async function signerFile(name: string): Promise<Uint8Array> {
  try {
    const { useStorage: nitroStorage } = await import("nitro/storage")
    const stored = await nitroStorage("assets").getItemRaw(`apex-signer/${name}`)
    if (stored instanceof Uint8Array) return stored
    if (typeof stored === "string") return new TextEncoder().encode(stored)
  } catch {
    // Direct Node tests and the worker have no Nitro virtual storage.
  }
  // `fileURLToPath`, not `.pathname`: this checkout lives under
  // "Application Support", and a raw pathname leaves the space encoded.
  const beside = dirname(fileURLToPath(import.meta.url))
  const tried = [
    join(beside, "assets"),
    join(process.cwd(), "src", "server", "protocols", "apex", "signer", "assets"),
    beside,
    join(process.cwd(), "worker", "dist"),
  ]
  for (const home of tried) {
    const file = join(home, name)
    if (existsSync(file)) return new Uint8Array(await readFile(file))
  }
  throw new Error(
    `APEX_SIGNER_MISSING:ApeX Omni's signing file ${name} is not on this server, so no ApeX order can be signed. Looked in Nitro's server assets and ${tried.join(", ")}.`
  )
}

let loading: Promise<ZkModule> | null = null

/**
 * Runs ApeX's glue once and keeps it.
 *
 * The glue is CommonJS that reads its `.wasm` from its own folder the
 * moment it loads, which no bundle can keep true. So it is run unedited,
 * inside the same wrapper Node puts around every CommonJS file, with a
 * `require` whose `fs.readFileSync` hands back the bytes read above.
 */
async function load(): Promise<ZkModule> {
  const [glue, wasm] = await Promise.all([
    signerFile(GLUE_FILE),
    signerFile(WASM_FILE),
  ])
  const module = { exports: {} as Record<string, unknown> }
  const fakeRequire = (id: string): unknown => {
    if (id === "util") return { TextDecoder, TextEncoder }
    if (id === "path") return { join: (...parts: string[]) => parts.at(-1) }
    if (id === "fs") {
      return {
        readFileSync: (name: string) => {
          if (name !== WASM_FILE) throw new Error("APEX_SIGNER_UNEXPECTED_FILE")
          return wasm
        },
      }
    }
    throw new Error("APEX_SIGNER_UNEXPECTED_MODULE")
  }
  const wrapped = runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {${new TextDecoder().decode(glue)}\n})`,
    { filename: GLUE_FILE }
  ) as (
    exports: unknown,
    require: (id: string) => unknown,
    module: { exports: Record<string, unknown> },
    filename: string,
    dirname: string
  ) => void
  wrapped(module.exports, fakeRequire, module, GLUE_FILE, ".")
  const zk = module.exports as unknown as ZkModule
  // Proven, not assumed: a copy that loaded but exposed nothing would
  // otherwise fail later with a key in hand.
  if (
    typeof zk.ZkLinkSigner?.ethSig !== "function" ||
    typeof zk.ContractBuilder !== "function" ||
    typeof zk.newContract !== "function"
  ) {
    throw new Error("APEX_SIGNER_UNAVAILABLE")
  }
  return zk
}

function zkModule(): Promise<ZkModule> {
  loading ??= load().catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}

const UINT32_MAX = 4_294_967_295n
const UINT64_MAX = 18_446_744_073_709_551_615n

/** A decimal string times 10^18, the rest dropped, as ApeX's connector does. */
export function scaleBy1e18(decimal: string): string {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(decimal)
  if (!match) throw new Error("LIVE_PRICE")
  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? "").slice(0, 18).padEnd(18, "0"))
  return (whole * 10n ** 18n + fraction).toString()
}

/**
 * The three numbers the connector derives from a client order id: the slot,
 * the nonce, and the account id folded into 32 bits. Written to match
 * `getZKContractSignatureObj` in ApeX's connector: SHA-256 of the id's text,
 * the slot the hash modulo 2^64-1 divided by 2^32-1 and floored, the nonce
 * the hash modulo 2^32-1.
 */
export function apexOrderSlots(clientOrderId: string, accountId: string): {
  slotId: number
  nonce: number
  accountId: number
} {
  // The connector's hash treats an id starting with 0x as hex bytes rather
  // than text. None of Trade's ids do, and one that did would sign
  // something else, so it is refused.
  if (clientOrderId === "" || /^0x/i.test(clientOrderId)) {
    throw new Error("LIVE_ORDER_ID")
  }
  if (!/^\d+$/.test(accountId)) throw new Error("LIVE_WALLET_KEY")
  const hash = BigInt(`0x${createHash("sha256").update(clientOrderId, "utf8").digest("hex")}`)
  return {
    slotId: Number((hash % UINT64_MAX) / UINT32_MAX),
    nonce: Number(hash % UINT32_MAX),
    accountId: Number(((BigInt(accountId) % UINT32_MAX) + UINT32_MAX) % UINT32_MAX),
  }
}

/** What one zkLink order signature is made from. */
type ApexContractToSign = {
  /** ApeX's account id, the long number `GET /v3/account` answers as `id`. */
  accountId: string
  clientOrderId: string
  l2PairId: number
  /** Decimal text, already snapped to the market's step and tick. */
  size: string
  price: string
  side: "BUY" | "SELL"
  makerFeeRate: string
  takerFeeRate: string
}

/**
 * One order's zkLink signature, and the public key it was signed with.
 *
 * **A fresh signer every time.** ApeX's signer is used up by a signature:
 * signing twice with one answered "null pointer passed to rust" when this was
 * built. The connector makes a new one before every order for the same
 * reason. It costs about 124 milliseconds, most of it deriving the key.
 */
export async function signApexContract(
  omniKey: string,
  order: ApexContractToSign
): Promise<{ signature: string; pubKey: string }> {
  const zk = await zkModule()
  const slots = apexOrderSlots(order.clientOrderId, order.accountId)
  const builder = new zk.ContractBuilder(
    slots.accountId,
    0,
    slots.slotId,
    slots.nonce,
    order.l2PairId,
    scaleBy1e18(order.size),
    scaleBy1e18(order.price),
    order.side === "BUY",
    Math.ceil(Number(order.makerFeeRate) * 10_000),
    Math.ceil(Number(order.takerFeeRate) * 10_000),
    false
  )
  const contract = zk.newContract(builder)
  let signer: unknown
  try {
    signer = zk.ZkLinkSigner.ethSig(omniKey)
  } catch {
    // ApeX's own words here would quote nothing secret, but they are
    // replaced anyway so the omni key can never ride out on one.
    throw new Error(
      "KEY_NOT_APPROVED:The omni key could not be read by ApeX's signer. Copy it again from ApeX's API management page."
    )
  }
  contract.sign(signer)
  const signed = contract.jsValue().signature
  if (!signed?.signature || !signed.pubKey) throw new Error("APEX_SIGNER_UNAVAILABLE")
  return { signature: signed.signature, pubKey: signed.pubKey }
}

/**
 * The public key an omni key signs with, which ApeX stores on the account
 * as `l2Key`. Comparing the two is how a wrong omni key is caught before
 * anything is saved: any omni key signs, but only the account's own signs
 * as the key ApeX has on file.
 */
export async function apexPublicKeyOf(omniKey: string): Promise<string> {
  const { pubKey } = await signApexContract(omniKey, {
    accountId: "0",
    clientOrderId: "trade-key-check",
    l2PairId: 1,
    size: "1",
    price: "1",
    side: "BUY",
    makerFeeRate: "0",
    takerFeeRate: "0",
  })
  return pubKey.toLowerCase()
}
