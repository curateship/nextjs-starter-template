import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Lighter's own signing library, run in this process.
 *
 * **Lighter does not sign the way any other venue here does.** It runs its own
 * chain, and its signatures are Poseidon hashes over its own curve rather than
 * the Ethereum signing Aster and Hyperliquid use, so `viem` cannot produce
 * them. There is no official JavaScript kit either — only community copies on
 * npm, which is not something to hand a private key to. What Lighter does
 * publish is a compiled WebAssembly build of its Go library, and that is what
 * this folder holds. `PROVENANCE.md` records exactly which file, from which
 * commit, and its checksum.
 *
 * Nothing outside this folder may import the `.wasm` or Go's `wasm_exec.js`
 * glue: `fence.test.ts` fails the build if anything does. Everything the app
 * needs goes through the small typed surface at the bottom of this file, so
 * no caller ever touches a global the Go runtime installed.
 */

/** Lighter's chain, as its own examples and its API both use. */
export const LIGHTER_CHAIN_ID = 304

/** Lighter refuses anything that is not exactly forty bytes. Measured. */
export const LIGHTER_PRIVATE_KEY_BYTES = 40

type SignerGlobals = {
  Go: new () => {
    importObject: WebAssembly.Imports
    run(instance: WebAssembly.Instance): void
  }
  /**
   * Both of Lighter's browser-build functions are curried and promise-shaped:
   * calling one returns a function, and calling THAT returns the promise.
   * The wrappers below hide that, so nothing else in the app has to know.
   */
  _createClientByPrv?: (
    privateKey: string,
    chainId: number,
    accountIndex: number,
    nonce: number,
    apiKeyIndex: number,
    skipNonce?: boolean
  ) => () => Promise<unknown>
  _createAuthToken?: (
    accountIndex: number,
    apiKeyIndex: number
  ) => () => Promise<unknown>
}

let loading: Promise<SignerGlobals> | null = null

/**
 * Starts the Go runtime once and keeps it.
 *
 * `go.run` starts a scheduler that never finishes on purpose — Lighter's main
 * registers its functions and then blocks forever — so this must happen once
 * per process, not once per signature. Loading is about a second; a signature
 * after that is a couple of milliseconds.
 */
async function load(): Promise<SignerGlobals> {
  // `fileURLToPath`, not `.pathname`: this app's own checkout lives under
  // "Application Support", and a raw pathname leaves the space percent-encoded
  // so both files below fail to open.
  const here = dirname(fileURLToPath(import.meta.url))
  // Go's glue installs `globalThis.Go`; it has no export of its own.
  await import(/* @vite-ignore */ join(here, "wasm_exec.js"))
  const scope = globalThis as unknown as SignerGlobals
  if (typeof scope.Go !== "function") {
    throw new Error("LIGHTER_SIGNER_UNAVAILABLE")
  }
  const go = new scope.Go()
  const bytes = await readFile(join(here, "lighter-signer.wasm"))
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject)
  go.run(instance)
  // Proven, not assumed: a build that instantiated but registered nothing
  // would otherwise fail later as "undefined is not a function", deep inside
  // a signing call with a key in hand.
  if (
    typeof scope._createClientByPrv !== "function" ||
    typeof scope._createAuthToken !== "function"
  ) {
    throw new Error("LIGHTER_SIGNER_UNAVAILABLE")
  }
  return scope
}

function signer(): Promise<SignerGlobals> {
  loading ??= load().catch((error: unknown) => {
    // A failed load must not stick forever; the next attempt tries again.
    loading = null
    throw error
  })
  return loading
}

/** What Lighter answers when it will not accept a key or a request. */
function errorOf(answer: unknown): string | null {
  if (answer === null || typeof answer !== "object") return null
  const stated = (answer as { error?: unknown }).error
  return typeof stated === "string" && stated !== "" ? stated : null
}

export type LighterAuthToken = {
  /** `deadline:accountIndex:apiKeyIndex:signature`, as Lighter wants it. */
  token: string
  /** Epoch SECONDS the token stops being accepted. */
  deadline: number
}

/**
 * Loads a key into the signer and answers the public key Lighter would have
 * registered for it.
 *
 * The public key is the whole point of this call: comparing it against what
 * Lighter says is registered proves a pasted key belongs to an account,
 * without signing anything or spending an order.
 *
 * The key is held in the WASM's own memory afterwards, filed under the
 * account index. Loading the same account again replaces it, so only one key
 * per account is ever resident.
 */
export async function loadLighterKey(input: {
  privateKey: string
  accountIndex: number
  apiKeyIndex: number
  nonce?: number
}): Promise<{ publicKey: string }> {
  const scope = await signer()
  const answer = await scope._createClientByPrv!(
    input.privateKey,
    LIGHTER_CHAIN_ID,
    input.accountIndex,
    input.nonce ?? 0,
    input.apiKeyIndex
  )()
  const failed = errorOf(answer)
  // Lighter's message names the byte length it wanted and got, which is safe
  // to keep. It never contains the key.
  if (failed) throw new Error(`LIGHTER_SIGNER_KEY:${failed}`)
  const publicKey = (answer as { pk?: unknown }).pk
  if (typeof publicKey !== "string" || publicKey === "") {
    throw new Error("LIGHTER_SIGNER_KEY:no public key")
  }
  return { publicKey }
}

/**
 * One auth token for Lighter's private reads and its private socket
 * channels. `loadLighterKey` must have run for this account first.
 *
 * **Not called by a screen yet, and not dead.** Reading a Lighter account is
 * public, so nothing in the app needs a token today; the private fill stream
 * and the order path both will. It stays because it is the only thing that
 * proves the vendored binary can SIGN rather than merely derive a public key,
 * and that proof is the whole point of `signer.test.ts` — the biggest risk in
 * the Lighter work is this binary quietly not working.
 *
 * **Lighter's own build fixes the life of this token at one hour**, measured
 * 26 Aug 2026, whichever longer figure its written docs mention. Callers
 * renew against `deadline` rather than assuming any number.
 */
export async function lighterAuthToken(input: {
  accountIndex: number
  apiKeyIndex: number
}): Promise<LighterAuthToken> {
  const scope = await signer()
  const answer = await scope._createAuthToken!(
    input.accountIndex,
    input.apiKeyIndex
  )()
  const failed = errorOf(answer)
  if (failed) throw new Error(`LIGHTER_SIGNER_TOKEN:${failed}`)
  const token = (answer as { token?: unknown }).token
  const deadline = (answer as { deadline?: unknown }).deadline
  if (typeof token !== "string" || typeof deadline !== "number") {
    throw new Error("LIGHTER_SIGNER_TOKEN:unreadable answer")
  }
  return { token, deadline }
}
