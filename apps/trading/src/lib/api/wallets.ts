import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type WalletItem = {
  id: string
  label: string
  network: "testnet" | "mainnet"
  account_address: string
  agent_address: string
  vault_address: string | null
  is_active: boolean
  status: "pending" | "active"
  created_via: "imported" | "generated"
  agent_name: string | null
  approval_valid_until: string | null
  created_at: string
  updated_at: string
  /** Live perps equity on the exchange; only the wallets list fetches it. */
  equity?: number | null
}

export type WalletListResponse = {
  wallets: WalletItem[]
  mainnetEnabled: boolean
}

const evmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 0x-prefixed 20-byte hex address")

const createWalletSchema = z.object({
  label: z.string().min(1).max(255),
  network: z.enum(["testnet", "mainnet"]),
  accountAddress: evmAddressSchema,
  agentAddress: evmAddressSchema,
  vaultAddress: evmAddressSchema.optional(),
  privateKey: z
    .string()
    .regex(
      /^(0x)?[0-9a-fA-F]{64}$/,
      "Private key must be 32 bytes of hex"
    ),
})

const updateWalletSchema = z.object({
  walletId: z.string().min(1),
  label: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
})

const deleteWalletSchema = z.object({
  walletId: z.string().min(1),
})

export function getWalletErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Wallet request failed."
}

const loadWalletsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<WalletListResponse> => {
    const user = await requireUser()
    return walletListForUser(user.id)
  }
)

const createWalletFn = createServerFn({ method: "POST" })
  .inputValidator(createWalletSchema)
  .handler(async ({ data }): Promise<WalletListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { createUserWallet } = await import("@/server/wallets")
    requireAppOrigin()
    const user = await requireUser()
    await createUserWallet(user.id, data)
    return walletListForUser(user.id)
  })

const updateWalletFn = createServerFn({ method: "POST" })
  .inputValidator(updateWalletSchema)
  .handler(async ({ data }): Promise<WalletListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { updateUserWallet } = await import("@/server/wallets")
    requireAppOrigin()
    const user = await requireUser()
    await updateUserWallet(user.id, data.walletId, {
      label: data.label,
      isActive: data.isActive,
    })
    return walletListForUser(user.id)
  })

const deleteWalletFn = createServerFn({ method: "POST" })
  .inputValidator(deleteWalletSchema)
  .handler(async ({ data }): Promise<WalletListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { deleteUserWallet } = await import("@/server/wallets")
    requireAppOrigin()
    const user = await requireUser()
    await deleteUserWallet(user.id, data.walletId)
    return walletListForUser(user.id)
  })

export function loadWallets() {
  return loadWalletsFn()
}

export function createWallet(input: z.infer<typeof createWalletSchema>) {
  return createWalletFn({ data: input })
}

export function updateWallet(
  walletId: string,
  input: { label?: string; isActive?: boolean }
) {
  return updateWalletFn({ data: { walletId, ...input } })
}

export function deleteWallet(walletId: string) {
  return deleteWalletFn({ data: { walletId } })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

async function walletListForUser(userId: string): Promise<WalletListResponse> {
  const { listUserWallets, serializeWalletsWithEquity } = await import(
    "@/server/wallets"
  )
  const { isMainnetEnabled } = await import("@/server/hyperliquid/transport")
  const wallets = await listUserWallets(userId)
  return {
    wallets: await serializeWalletsWithEquity(wallets),
    mainnetEnabled: isMainnetEnabled(),
  }
}
