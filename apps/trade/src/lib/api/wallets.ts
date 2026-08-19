import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { KNOWN_PROTOCOLS } from "@/lib/protocols/contracts"
import {
  MAX_STARTING_BALANCE,
  WALLET_LABEL_MAX,
  type TradeWallet,
  type WalletAccountSummary,
  describeKeyMismatch,
} from "@/lib/trade/wallets"
import { userGet, userPost } from "@/server/guards"
import { loadLastWalletId, saveLastWalletId } from "@/server/trade/prefs"
import {
  createWallet as createWalletRow,
  deleteWallet as deleteWalletRow,
  findTradingWallet,
  loadWalletSummaries,
  updateWallet as updateWalletRow,
} from "@/server/trade/wallets"

import { createErrorMessage } from "./error-message"

/**
 * Wallets and their figures. One read serves the whole account panel — the
 * wallets, each one's summary, and which one was active — so the poll is one
 * request, not one per wallet.
 *
 * The trading key passes through exactly one of these functions, once, on its
 * way to being encrypted. It is never part of an answer.
 */

const walletLabelSchema = z
  .string()
  .trim()
  .min(1, "Give the wallet a name.")
  .max(WALLET_LABEL_MAX)

/**
 * The credential fields are shape-checked lightly here and properly in the
 * store, where the wallet's exchange is in hand: each exchange declares what
 * its identifier looks like and which fields its sign-in needs, and the
 * server refuses against THAT — this schema only keeps junk and novels out.
 */
const credentialFieldSchema = z.string().trim().min(1).max(256)

const createWalletSchema = z
  .object({
    label: walletLabelSchema,
    kind: z.enum(["paper", "live"]),
    protocol: z.enum(KNOWN_PROTOCOLS),
    network: z.enum(["mainnet", "testnet"]),
    startingBalance: z
      .number()
      .positive()
      .max(MAX_STARTING_BALANCE)
      .optional(),
    address: z.string().trim().min(1).max(64).optional(),
    agentKey: credentialFieldSchema.optional(),
    secret: credentialFieldSchema.optional(),
    passphrase: credentialFieldSchema.optional(),
  })
  // The per-kind requirements are enforced again in the store; checking here
  // too means a half-filled form is refused before it costs a round trip.
  .refine((input) => input.kind !== "paper" || input.startingBalance, {
    message: "WALLET_BALANCE_REQUIRED",
  })
  .refine(
    (input) =>
      input.kind !== "live" ||
      (input.address && (input.agentKey || input.secret)),
    { message: "WALLET_CREDENTIALS_REQUIRED" }
  )

const updateWalletSchema = z.object({
  id: z.string().max(36),
  label: walletLabelSchema.optional(),
  startingBalance: z.number().positive().max(MAX_STARTING_BALANCE).optional(),
  agentKey: credentialFieldSchema.optional(),
  secret: credentialFieldSchema.optional(),
  passphrase: credentialFieldSchema.optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

const walletIdSchema = z.object({ id: z.string().max(36) })

const loadWalletAccountsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(
    async ({
      context,
    }): Promise<{
      wallets: TradeWallet[]
      summaries: WalletAccountSummary[]
      lastWalletId: string | null
    }> => {
      const [{ wallets, summaries }, lastWalletId] = await Promise.all([
        loadWalletSummaries(context.user.id),
        loadLastWalletId(context.user.id),
      ])
      return { wallets, summaries, lastWalletId }
    }
  )

const createWalletFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createWalletSchema)
  .handler(async ({ data, context }): Promise<{ wallet: TradeWallet }> => {
    return { wallet: await createWalletRow(context.user.id, data) }
  })

const updateWalletFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateWalletSchema)
  .handler(async ({ data, context }): Promise<{ wallet: TradeWallet }> => {
    return { wallet: await updateWalletRow(context.user.id, data) }
  })

const deleteWalletFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(walletIdSchema)
  .handler(async ({ data, context }): Promise<{ deleted: true }> => {
    await deleteWalletRow(context.user.id, data.id)
    return { deleted: true }
  })

const pickWalletFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(walletIdSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    const wallet = await findTradingWallet(context.user.id, data.id)
    if (!wallet) throw new Error("WALLET_NOT_FOUND")
    await saveLastWalletId(context.user.id, data.id)
    return { saved: true }
  })

export function loadWalletAccounts() {
  return loadWalletAccountsFn()
}

export function createWallet(input: z.infer<typeof createWalletSchema>) {
  return createWalletFn({ data: input })
}

export function updateWallet(input: z.infer<typeof updateWalletSchema>) {
  return updateWalletFn({ data: input })
}

export function deleteWallet(id: string) {
  return deleteWalletFn({ data: { id } })
}

export function pickWallet(id: string) {
  return pickWalletFn({ data: { id } })
}

const baseWalletErrorMessage = createErrorMessage(
  {
    WALLET_LIMIT: "Twenty wallets is the cap — delete one before adding another.",
    WALLET_BALANCE_REQUIRED: "Enter the cash a practice wallet starts with.",
    WALLET_CREDENTIALS_REQUIRED:
      "A live wallet needs its address and its trading key.",
    WALLET_NETWORK:
      "That exchange does not run this network, so the wallet was not saved.",
    WALLET_ADDRESS_SHAPE:
      "That does not look like this exchange's identifier — check it against the hint under the field.",
    KEY_REQUIRED: "Paste the key before saving.",
    KEY_SECRET_REQUIRED: "Paste the API secret before saving.",
    KEY_PASSPHRASE_REQUIRED:
      "This exchange also needs the passphrase you set when creating the key.",
    WALLET_UNREACHABLE:
      "The exchange did not answer for that account. Check what you pasted and try again.",
    KEY_IS_ACCOUNT:
      "That is the account's MAIN key — the one that can move money out — and it is never stored here. On the exchange, create an API key (a limited trading key) and paste that instead.",
    KEY_NOT_APPROVED:
      "The exchange does not accept that key for this account. On Hyperliquid the usual cause: a key only counts if you pressed Authorize on that exact generation — copy the key and authorize in the same breath, then paste that one. On an API-key exchange: check the key id, the secret, and that the key has trade permission.",
    KEY_EXPIRED:
      "That key's approval has run out. Create a fresh API key on the exchange and paste it.",
    KEY_CHECK_UNAVAILABLE:
      "The exchange could not be reached to check the key, so nothing was saved. Try again in a moment.",
    WALLET_NOT_FOUND:
      "That wallet is not there any more — it may have been deleted in another tab.",
    WALLET_INACTIVE: "Make this wallet active before trading with it.",
    WALLET_BALANCE_KIND: "Only a practice wallet's starting cash can be changed.",
    WALLET_KEY_KIND: "Only a live wallet has a trading key.",
    ENCRYPTION_NOT_CONFIGURED:
      "Secret storage is not set up on this server, so a trading key cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
  },
  "That did not save. Try it again."
)

/**
 * A wallet refusal in words, with the addresses attached when the refusal was
 * about a key not being approved.
 *
 * The generic sentence explains the usual cause; the addresses prove which case
 * this actually is, which is the difference between acting and guessing.
 */
export function getWalletErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  const detail = describeKeyMismatch(message)
  const base = baseWalletErrorMessage(error)
  return detail ? `${base} ${detail}` : base
}
