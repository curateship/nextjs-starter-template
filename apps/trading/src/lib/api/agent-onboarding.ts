import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  ApproveAgentTypedData,
  BeginOnboardingResult,
  CompleteOnboardingResult,
  VerifyApprovalResult,
} from "@/server/agent-onboarding"

export type { ApproveAgentTypedData, BeginOnboardingResult }

const evmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 0x-prefixed 20-byte hex address")

const chainIdSchema = z
  .string()
  .regex(/^(0x[0-9a-fA-F]+|\d+)$/, "Invalid chain id")

const beginSchema = z.object({
  label: z.string().min(1).max(255),
  network: z.enum(["testnet", "mainnet"]),
  masterAddress: evmAddressSchema,
  chainId: chainIdSchema,
  vaultAddress: evmAddressSchema.optional(),
})

const renewSchema = z.object({
  walletId: z.string().min(1),
  chainId: chainIdSchema,
})

const completeSchema = z.object({
  walletId: z.string().min(1),
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]{130}$/, "Signature must be 65 bytes of hex"),
})

const verifySchema = z.object({
  walletId: z.string().min(1),
})

export function getOnboardingErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Wallet approval failed."
}

const beginAgentOnboardingFn = createServerFn({ method: "POST" })
  .inputValidator(beginSchema)
  .handler(async ({ data }): Promise<BeginOnboardingResult> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { beginAgentOnboarding } = await import("@/server/agent-onboarding")
    requireAppOrigin()
    const user = await requireUser()
    return beginAgentOnboarding(user.id, data)
  })

const beginAgentRenewalFn = createServerFn({ method: "POST" })
  .inputValidator(renewSchema)
  .handler(async ({ data }): Promise<BeginOnboardingResult> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { beginAgentRenewal } = await import("@/server/agent-onboarding")
    requireAppOrigin()
    const user = await requireUser()
    return beginAgentRenewal(user.id, data.walletId, data.chainId)
  })

const completeAgentOnboardingFn = createServerFn({ method: "POST" })
  .inputValidator(completeSchema)
  .handler(async ({ data }): Promise<CompleteOnboardingResult> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { completeAgentOnboarding } = await import(
      "@/server/agent-onboarding"
    )
    requireAppOrigin()
    const user = await requireUser()
    return completeAgentOnboarding(user.id, data)
  })

const verifyAgentApprovalFn = createServerFn({ method: "POST" })
  .inputValidator(verifySchema)
  .handler(async ({ data }): Promise<VerifyApprovalResult> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { verifyAgentApproval } = await import("@/server/agent-onboarding")
    requireAppOrigin()
    const user = await requireUser()
    return verifyAgentApproval(user.id, data.walletId)
  })

export function beginAgentOnboarding(input: z.infer<typeof beginSchema>) {
  return beginAgentOnboardingFn({ data: input })
}

export function beginAgentRenewal(walletId: string, chainId: string) {
  return beginAgentRenewalFn({ data: { walletId, chainId } })
}

export function completeAgentOnboarding(walletId: string, signature: string) {
  return completeAgentOnboardingFn({ data: { walletId, signature } })
}

export function verifyAgentApproval(walletId: string) {
  return verifyAgentApprovalFn({ data: { walletId } })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
