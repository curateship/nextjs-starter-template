import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  isAgentKey,
  isWalletAddress,
  MAX_STARTING_BALANCE,
  WALLET_LABEL_MAX,
  type TradeWallet,
  type WalletAccountSummary,
} from "@/lib/trade/wallets"
import { userGet, userPost } from "@/server/guards"
import { loadLastWalletId, saveLastWalletId } from "@/server/trade/prefs"
import {
  createWallet as createWalletRow,
  deleteWallet as deleteWalletRow,
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

const createWalletSchema = z
  .object({
    label: walletLabelSchema,
    kind: z.enum(["paper", "live"]),
    protocol: z.enum(["hyperliquid"]),
    network: z.enum(["mainnet", "testnet"]),
    startingBalance: z
      .number()
      .positive()
      .max(MAX_STARTING_BALANCE)
      .optional(),
    address: z
      .string()
      .refine(isWalletAddress, { message: "Not a wallet address." })
      .optional(),
    agentKey: z
      .string()
      .refine(isAgentKey, { message: "Not a trading key." })
      .optional(),
  })
  // The per-kind requirements are enforced again in the store; checking here
  // too means a half-filled form is refused before it costs a round trip.
  .refine((input) => input.kind !== "paper" || input.startingBalance, {
    message: "WALLET_BALANCE_REQUIRED",
  })
  .refine(
    (input) => input.kind !== "live" || (input.address && input.agentKey),
    { message: "WALLET_CREDENTIALS_REQUIRED" }
  )

const updateWalletSchema = z.object({
  id: z.string().max(36),
  label: walletLabelSchema.optional(),
  startingBalance: z.number().positive().max(MAX_STARTING_BALANCE).optional(),
  agentKey: z
    .string()
    .refine(isAgentKey, { message: "Not a trading key." })
    .optional(),
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

export const getWalletErrorMessage = createErrorMessage(
  {
    WALLET_LIMIT: "Twenty wallets is the cap — delete one before adding another.",
    WALLET_BALANCE_REQUIRED: "Enter the cash a practice wallet starts with.",
    WALLET_CREDENTIALS_REQUIRED:
      "A live wallet needs its address and its trading key.",
    WALLET_UNREACHABLE:
      "Hyperliquid did not answer for that address. Check the address and try again.",
    KEY_IS_ACCOUNT:
      "That is the account's MAIN key — the one that can move money out — and it is never stored here. On Hyperliquid, create an API key (a limited trading key) and paste that instead.",
    KEY_NOT_APPROVED:
      "Hyperliquid does not list that key as approved to trade for this account. Check it is the API key you created for exactly this account.",
    KEY_EXPIRED:
      "That trading key's approval has run out. Create a fresh API key on Hyperliquid and paste it.",
    KEY_CHECK_UNAVAILABLE:
      "Hyperliquid could not be reached to check the key, so nothing was saved. Try again in a moment.",
    WALLET_NOT_FOUND:
      "That wallet is not there any more — it may have been deleted in another tab.",
    WALLET_BALANCE_KIND: "Only a practice wallet's starting cash can be changed.",
    WALLET_KEY_KIND: "Only a live wallet has a trading key.",
    ENCRYPTION_NOT_CONFIGURED:
      "Secret storage is not set up on this server, so a trading key cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    "Not a wallet address.":
      "That address does not look right — it should be 0x followed by 40 characters.",
    "Not a trading key.":
      "That key does not look right — it should be 64 characters of hex.",
  },
  "That did not save. Try it again."
)
