import { and, eq, lt } from "drizzle-orm"
import { recoverTypedDataAddress, parseSignature } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

import { ApproveAgentTypes } from "@nktkas/hyperliquid/api/exchange"

import { db, type CustomShellDb } from "@/server/db"
import { scrubErrorMessage } from "@/server/hyperliquid/exchange"
import { getInfoClient } from "@/server/hyperliquid/info"
import { CURRENT_KEY_VERSION, encryptPrivateKey } from "@/server/hyperliquid/keys"
import {
  assertNetworkEnabled,
  createHttpTransport,
} from "@/server/hyperliquid/transport"
import {
  normalizeEvmAddress,
  type TradingNetwork,
} from "@/server/hyperliquid/types"
import { findUserWallet } from "@/server/wallets"
import { tradingAuditLog, tradingWallets, type TradingWallet } from "@/server/schema"
import { now, uuid } from "@/server/util"

/** Abandoned connect flows are swept on the next begin call after this. */
const PENDING_MAX_AGE_MS = 60 * 60 * 1000

const EIP712_DOMAIN_NAME = "HyperliquidSignTransaction"
const EIP712_DOMAIN_VERSION = "1"
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const

/**
 * The full EIP-712 payload the browser wallet signs. Built server-side so the
 * client cannot substitute a different agent address or name — complete()
 * reconstructs the same action from the stored row and submits only that.
 */
export type ApproveAgentTypedData = {
  domain: {
    name: typeof EIP712_DOMAIN_NAME
    version: typeof EIP712_DOMAIN_VERSION
    chainId: number
    verifyingContract: typeof ZERO_ADDRESS
  }
  types: typeof ApproveAgentTypes
  primaryType: "HyperliquidTransaction:ApproveAgent"
  message: {
    hyperliquidChain: "Testnet" | "Mainnet"
    agentAddress: `0x${string}`
    agentName: string
    nonce: number
  }
}

export type BeginOnboardingInput = {
  label: string
  network: TradingNetwork
  masterAddress: string
  /** The browser wallet's current chain id, hex ("0x1") or decimal string. */
  chainId: string
  vaultAddress?: string | null
}

export type BeginOnboardingResult = {
  walletId: string
  agentAddress: string
  typedData: ApproveAgentTypedData
}

/**
 * Step 1 of the connect flow: generate an agent keypair, store it encrypted on
 * a pending (inert) wallet row, and return the typed data for the master
 * wallet to sign. The plaintext key never leaves this function's scope.
 */
export async function beginAgentOnboarding(
  userId: string,
  input: BeginOnboardingInput,
  database: CustomShellDb = db
): Promise<BeginOnboardingResult> {
  const label = input.label.trim()
  if (!label) {
    throw new Error("Wallet label is required")
  }
  assertNetworkEnabled(input.network)
  const masterAddress = normalizeEvmAddress(input.masterAddress)
  const vaultAddress = input.vaultAddress?.trim()
    ? normalizeEvmAddress(input.vaultAddress.trim())
    : null
  const signatureChainId = normalizeChainId(input.chainId)

  await sweepStalePendingWallets(userId, database)

  const agentPrivateKey = generatePrivateKey()
  const agentAddress = privateKeyToAccount(agentPrivateKey)
    .address.toLowerCase() as `0x${string}`
  const agentName = buildAgentName()
  const nonce = Date.now()
  const createdAt = now()

  const [wallet] = await database
    .insert(tradingWallets)
    .values({
      id: uuid(),
      userId,
      label: label.slice(0, 255),
      network: input.network,
      accountAddress: masterAddress,
      agentAddress,
      vaultAddress,
      encryptedPrivateKey: encryptPrivateKey(agentPrivateKey),
      keyVersion: CURRENT_KEY_VERSION,
      isActive: false,
      status: "pending",
      createdVia: "generated",
      agentName,
      pendingAction: { nonce, signatureChainId },
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!wallet) {
    throw new Error("Wallet was not created")
  }

  return {
    walletId: wallet.id,
    agentAddress,
    typedData: buildTypedData(wallet),
  }
}

/**
 * Step 1 of a renewal: keep the existing agent address + key (so running bots
 * and nonce state are untouched) and stage a fresh approval for the master
 * wallet to re-sign. The row stays in its current status.
 */
export async function beginAgentRenewal(
  userId: string,
  walletId: string,
  chainId: string,
  database: CustomShellDb = db
): Promise<BeginOnboardingResult> {
  const wallet = await findUserWallet(userId, walletId, database)
  if (!wallet) {
    throw new Error("Wallet not found")
  }
  assertNetworkEnabled(wallet.network as TradingNetwork)

  const signatureChainId = normalizeChainId(chainId)
  const nonce = Date.now()
  const agentName = wallet.agentName ?? buildAgentName()

  const [updated] = await database
    .update(tradingWallets)
    .set({
      agentName,
      pendingAction: { nonce, signatureChainId },
      updatedAt: now(),
    })
    .where(
      and(eq(tradingWallets.id, walletId), eq(tradingWallets.userId, userId))
    )
    .returning()

  if (!updated) {
    throw new Error("Wallet not found")
  }

  return {
    walletId: updated.id,
    agentAddress: updated.agentAddress,
    typedData: buildTypedData(updated),
  }
}

export type CompleteOnboardingResult = {
  walletId: string
  agentAddress: string
  approvalValidUntil: string | null
}

/**
 * Step 2 of the connect flow: verify the browser signature really came from
 * the stored master address, relay the approval to Hyperliquid, confirm it via
 * extraAgents, then activate the row.
 */
export async function completeAgentOnboarding(
  userId: string,
  input: { walletId: string; signature: string },
  database: CustomShellDb = db
): Promise<CompleteOnboardingResult> {
  const wallet = await findUserWallet(userId, input.walletId, database)
  if (!wallet) {
    throw new Error("Wallet not found")
  }
  if (!wallet.pendingAction) {
    throw new Error(
      "No approval is in progress for this wallet. Start the Connect Wallet flow again."
    )
  }
  const network = wallet.network as TradingNetwork
  assertNetworkEnabled(network)

  const typedData = buildTypedData(wallet)
  const signature = input.signature as `0x${string}`

  // Tamper check before anything touches Hyperliquid: the signer must be the
  // master account this pending row was created for.
  const recovered = await recoverTypedDataAddress({ ...typedData, signature })
  if (recovered.toLowerCase() !== wallet.accountAddress) {
    throw new Error(
      "The signature does not match the connected wallet. Sign with the account that was connected when the flow started."
    )
  }

  const parsed = parseSignature(signature)
  const v = parsed.v !== undefined ? Number(parsed.v) : parsed.yParity + 27
  const action = {
    type: "approveAgent" as const,
    signatureChainId: wallet.pendingAction.signatureChainId,
    hyperliquidChain: typedData.message.hyperliquidChain,
    agentAddress: wallet.agentAddress,
    agentName: typedData.message.agentName,
    nonce: wallet.pendingAction.nonce,
  }

  try {
    const transport = createHttpTransport(network)
    const response = (await transport.request("exchange", {
      action,
      nonce: action.nonce,
      signature: { r: parsed.r, s: parsed.s, v },
    })) as { status: "ok" | "err"; response: unknown }
    if (response.status !== "ok") {
      throw new Error(
        typeof response.response === "string"
          ? response.response
          : "Hyperliquid rejected the approval"
      )
    }
  } catch (error) {
    await writeApprovalAudit(database, wallet, {
      status: "error",
      errorMessage: scrubErrorMessage(error),
    })
    throw new Error(scrubErrorMessage(error))
  }

  const approval = await queryAgentApproval(wallet)

  const [updated] = await database
    .update(tradingWallets)
    .set({
      status: "active",
      isActive: true,
      approvalValidUntil: approval?.validUntil ?? null,
      pendingAction: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(tradingWallets.id, wallet.id),
        eq(tradingWallets.userId, userId)
      )
    )
    .returning()

  if (!updated) {
    throw new Error("Wallet not found")
  }

  // Audit with the pre-update row so the approval nonce is recorded.
  await writeApprovalAudit(database, wallet, { status: "ok" })

  return {
    walletId: updated.id,
    agentAddress: updated.agentAddress,
    approvalValidUntil: updated.approvalValidUntil?.toISOString() ?? null,
  }
}

export type VerifyApprovalResult = {
  walletId: string
  approved: boolean
  approvalValidUntil: string | null
}

/**
 * Re-checks Hyperliquid's extraAgents for an existing wallet: refreshes the
 * stored expiry, or deactivates the wallet when the approval was revoked.
 */
export async function verifyAgentApproval(
  userId: string,
  walletId: string,
  database: CustomShellDb = db
): Promise<VerifyApprovalResult> {
  const wallet = await findUserWallet(userId, walletId, database)
  if (!wallet) {
    throw new Error("Wallet not found")
  }
  if (wallet.status !== "active") {
    return { walletId, approved: false, approvalValidUntil: null }
  }

  const approval = await queryAgentApproval(wallet)
  if (!approval) {
    // Query failed — never deactivate a wallet over a network hiccup.
    return {
      walletId,
      approved: true,
      approvalValidUntil: wallet.approvalValidUntil?.toISOString() ?? null,
    }
  }

  await database
    .update(tradingWallets)
    .set({
      approvalValidUntil: approval.validUntil,
      ...(approval.listed ? {} : { isActive: false }),
      updatedAt: now(),
    })
    .where(
      and(eq(tradingWallets.id, walletId), eq(tradingWallets.userId, userId))
    )

  return {
    walletId,
    approved: approval.listed,
    approvalValidUntil: approval.validUntil?.toISOString() ?? null,
  }
}

function buildTypedData(wallet: TradingWallet): ApproveAgentTypedData {
  if (!wallet.pendingAction) {
    throw new Error("Wallet has no approval in progress")
  }
  return {
    domain: {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: parseInt(wallet.pendingAction.signatureChainId),
      verifyingContract: ZERO_ADDRESS,
    },
    types: ApproveAgentTypes,
    primaryType: "HyperliquidTransaction:ApproveAgent",
    message: {
      hyperliquidChain:
        (wallet.network as TradingNetwork) === "testnet"
          ? "Testnet"
          : "Mainnet",
      agentAddress: wallet.agentAddress as `0x${string}`,
      agentName: wallet.agentName ?? "",
      nonce: wallet.pendingAction.nonce,
    },
  }
}

/** ≤16 chars per Hyperliquid's agentName limit. */
function buildAgentName(): string {
  return `se-${uuid().slice(0, 8)}`
}

function normalizeChainId(chainId: string): string {
  const value = chainId.trim()
  if (/^0x[0-9a-fA-F]+$/.test(value)) return value.toLowerCase()
  if (/^\d+$/.test(value)) return `0x${Number(value).toString(16)}`
  throw new Error("Invalid chain id")
}

async function sweepStalePendingWallets(
  userId: string,
  database: CustomShellDb
) {
  const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MS)
  await database
    .delete(tradingWallets)
    .where(
      and(
        eq(tradingWallets.userId, userId),
        eq(tradingWallets.status, "pending"),
        eq(tradingWallets.createdVia, "generated"),
        lt(tradingWallets.createdAt, cutoff)
      )
    )
}

/** Ground truth from Hyperliquid's extraAgents; null when the query failed. */
async function queryAgentApproval(
  wallet: TradingWallet
): Promise<{ listed: boolean; validUntil: Date | null } | null> {
  try {
    const agents = await getInfoClient(
      wallet.network as TradingNetwork
    ).extraAgents({ user: wallet.accountAddress as `0x${string}` })
    const match = agents.find(
      (agent) => agent.address.toLowerCase() === wallet.agentAddress
    )
    return {
      listed: Boolean(match),
      validUntil:
        typeof match?.validUntil === "number"
          ? new Date(match.validUntil)
          : null,
    }
  } catch {
    // Verification is best-effort; callers decide what a failed query means.
    return null
  }
}

async function writeApprovalAudit(
  database: CustomShellDb,
  wallet: TradingWallet,
  details: { status: "ok" | "error"; errorMessage?: string | null }
) {
  try {
    await database.insert(tradingAuditLog).values({
      id: uuid(),
      userId: wallet.userId,
      walletId: wallet.id,
      botId: null,
      actor: "user",
      actionType: "agent.approve",
      network: wallet.network,
      market: null,
      nonce: wallet.pendingAction?.nonce ?? null,
      cloid: null,
      request: {
        agentAddress: wallet.agentAddress,
        agentName: wallet.agentName,
      },
      response: null,
      status: details.status,
      errorMessage: details.errorMessage ?? null,
      createdAt: now(),
    })
  } catch (error) {
    // The audit trail must never take the onboarding path down with it.
    console.error("audit_log write failed", error)
  }
}
