import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid"

import { createInjectedWalletSigner } from "@/lib/eth-wallet"
import { loadTradingAccountState } from "@/lib/hl/account-balance"

export type RecoveryNetwork = "mainnet" | "testnet"

export type RecoveryBalance = {
  equity: string
  withdrawable: string
}

export type RecoveryWithdrawalResult = {
  balance: RecoveryBalance | null
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const USDC_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/
const UNSIGNED_DECIMAL = /^\d+(?:\.\d+)?$/
const SIGNED_DECIMAL = /^-?\d+(?:\.\d+)?$/
const MAX_BALANCE_LENGTH = 128

export function validateRecoveryAmount(
  amount: string,
  withdrawable: string
): string | null {
  if (!USDC_AMOUNT.test(amount) || compareDecimals(amount, "0") <= 0) {
    return "Enter a positive USDC amount with no more than 6 decimal places."
  }
  if (compareDecimals(amount, withdrawable) > 0) {
    return "Amount exceeds the available USDC balance."
  }
  return null
}

export function buildRecoveryWithdrawal(
  address: string,
  amount: string,
  withdrawable: string
) {
  if (!EVM_ADDRESS.test(address)) {
    throw new Error("The connected wallet returned an invalid address.")
  }
  const error = validateRecoveryAmount(amount, withdrawable)
  if (error) throw new Error(error)
  return {
    destination: address.toLowerCase() as `0x${string}`,
    amount,
  }
}

export async function loadRecoveryBalance(
  network: RecoveryNetwork,
  address: string
): Promise<RecoveryBalance> {
  if (!EVM_ADDRESS.test(address)) {
    throw new Error("The connected wallet returned an invalid address.")
  }
  const transport = new HttpTransport({ isTestnet: network === "testnet" })
  const client = new InfoClient({ transport })
  const state = await loadTradingAccountState(
    client,
    address.toLowerCase() as `0x${string}`
  )
  if (
    !isBoundedDecimal(state.equity, true) ||
    !isBoundedDecimal(state.withdrawable, false)
  ) {
    throw new Error("Hyperliquid returned an invalid balance.")
  }
  return { equity: state.equity, withdrawable: state.withdrawable }
}

export async function submitRecoveryWithdrawal(input: {
  network: RecoveryNetwork
  address: string
  amount: string
}): Promise<RecoveryWithdrawalResult> {
  const balance = await loadRecoveryBalance(input.network, input.address)
  const request = buildRecoveryWithdrawal(
    input.address,
    input.amount,
    balance.withdrawable
  )
  const transport = new HttpTransport({
    isTestnet: input.network === "testnet",
  })
  const client = new ExchangeClient({
    transport,
    wallet: createInjectedWalletSigner(request.destination),
  })
  await client.withdraw3(request)
  try {
    return {
      balance: await loadRecoveryBalance(input.network, request.destination),
    }
  } catch {
    return { balance: null }
  }
}

function compareDecimals(left: string, right: string) {
  const [leftWhole, leftFraction = ""] = left.split(".")
  const [rightWhole, rightFraction = ""] = right.split(".")
  const scale = Math.max(leftFraction.length, rightFraction.length)
  const leftValue = BigInt(leftWhole + leftFraction.padEnd(scale, "0"))
  const rightValue = BigInt(rightWhole + rightFraction.padEnd(scale, "0"))
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}

function isBoundedDecimal(value: unknown, allowNegative: boolean) {
  return (
    typeof value === "string" &&
    value.length <= MAX_BALANCE_LENGTH &&
    (allowNegative ? SIGNED_DECIMAL : UNSIGNED_DECIMAL).test(value)
  )
}
