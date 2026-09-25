import type { WalletPortfolio } from "@/lib/protocols/contracts"
import type { TradeWallet } from "@/lib/trade/wallets"
import { accountOf, getProtocol, ordersOf } from "@/server/protocols/registry"

/** One answer covers the one-second engine passes that arrive just after it. */
const ENGINE_EXCHANGE_READ_HOLD_MS = 5_000

type WalletRef = Pick<TradeWallet, "protocol" | "network" | "address">
type Credential = () => string | null
type AccountAnswer = Awaited<ReturnType<ReturnType<typeof accountOf>["fetch"]>>
type Held<T> = { startedAt: number; answer: Promise<T> }

const heldAccounts = new Map<string, Held<AccountAnswer>>()
const heldPortfolios = new Map<string, Held<WalletPortfolio>>()

function readKey(wallet: WalletRef): string {
  return `${wallet.protocol}:${wallet.network}:${wallet.address?.toLowerCase() ?? ""}`
}

function heldRead<T>(
  cache: Map<string, Held<T>>,
  key: string,
  read: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.startedAt < ENGINE_EXCHANGE_READ_HOLD_MS) {
    return cached.answer
  }

  const startedAt = Date.now()
  const answer = Promise.resolve().then(read)
  answer.catch(() => {
    if (cache.get(key)?.answer === answer) cache.delete(key)
  })
  cache.set(key, { startedAt, answer })
  setTimeout(() => {
    if (cache.get(key)?.answer === answer) cache.delete(key)
  }, ENGINE_EXCHANGE_READ_HOLD_MS).unref?.()
  return answer
}

export function heldEngineAccount(
  wallet: WalletRef,
  credential: Credential
): Promise<AccountAnswer> {
  const protocol = getProtocol(wallet.protocol)
  return heldRead(heldAccounts, readKey(wallet), () =>
    accountOf(protocol).fetch(wallet.network, wallet.address ?? "", credential)
  )
}

export function heldEnginePortfolio(
  wallet: WalletRef,
  credential: Credential
): Promise<WalletPortfolio> {
  const protocol = getProtocol(wallet.protocol)
  return heldRead(heldPortfolios, readKey(wallet), () =>
    ordersOf(protocol).portfolio(
      wallet.network,
      wallet.address ?? "",
      credential
    )
  )
}

/** A successful exchange mutation makes every earlier account answer obsolete. */
export function dropEngineExchangeReads(wallet: WalletRef): void {
  const key = readKey(wallet)
  heldAccounts.delete(key)
  heldPortfolios.delete(key)
}
