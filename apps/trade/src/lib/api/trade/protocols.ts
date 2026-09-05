import type {
  CredentialForm,
  NetworkId,
  ProtocolCapabilities,
  ProtocolId,
} from "@/lib/protocols/contracts"

/** The public, browser-safe part of one exchange adapter. */
export type ProtocolDescription = {
  id: ProtocolId
  label: string
  networks: readonly NetworkId[]
  defaultNetwork: NetworkId
  capabilities: ProtocolCapabilities
  /**
   * Present wherever a wallet can be added — how a wallet there signs in.
   * Every exchange whose accounts can be read has one; Solana has one before
   * its holdings can be read, so the wallet can be made and funded first.
   */
  credentialForm: CredentialForm | null
}

/**
 * The exchanges this build ships, as data a screen can draw.
 *
 * This is build-time data, not account data. Keeping it in the browser bundle
 * means the wallet dialog and capability gates no longer pay a session check
 * to ask the server which code was compiled into the same build.
 */
export const PROTOCOL_DESCRIPTIONS = [
  {
    id: "hyperliquid",
    label: "Hyperliquid",
    networks: ["mainnet", "testnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: false,
      gridStop: "exchange",
      changeLeverage: { can: true },
      adjustMargin: { can: true },
    },
    credentialForm: {
      addressLabel: "Account address",
      addressHint: "0x…",
      addressPattern: "^0x[0-9a-fA-F]{40}$",
      secretLabel: "Trading key (agent key)",
      needsPassphrase: false,
      secretIsAgentKey: true,
      canMakeWallet: false,
      keyHelp:
        "An agent key made on the exchange's API page — approved to trade " +
        "for this account and nothing more. Never the account's own key, " +
        "which can move money out and is refused here.",
    },
  },
  {
    id: "phemex",
    label: "Phemex",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: false,
      gridStop: "exchange",
      changeLeverage: { can: true },
      adjustMargin: { can: true },
    },
    credentialForm: {
      addressLabel: "API key ID",
      addressHint: "The key's ID from Phemex's API Management page",
      // Phemex issues UUID-shaped ids. This checks shape, while the signed
      // exchange request is what proves the credential.
      addressPattern: "^[0-9A-Za-z-]{16,42}$",
      secretLabel: "API secret",
      needsPassphrase: false,
      secretIsAgentKey: false,
      canMakeWallet: false,
      keyHelp:
        "Made on Phemex under API Management — give it trade permission, " +
        "and copy both the ID and the secret while they are shown.",
    },
  },
  {
    id: "kucoin",
    label: "KuCoin",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: false,
      gridStop: "exchange",
      changeLeverage: { can: true },
      adjustMargin: { can: true },
    },
    credentialForm: {
      addressLabel: "API key",
      addressHint: "The key from KuCoin's API Management page",
      // KuCoin currently issues 24-character hex ids. The tolerant shape
      // check leaves proof to the signed exchange request.
      addressPattern: "^[0-9A-Za-z]{16,42}$",
      secretLabel: "API secret",
      needsPassphrase: true,
      secretIsAgentKey: false,
      canMakeWallet: false,
      keyHelp:
        "Made on KuCoin under API Management, with Futures trading " +
        "permission. Copy all three — the key, the secret and the " +
        "passphrase you chose — while they are shown. If the key is " +
        "restricted to certain addresses, this server's address must be " +
        "on that list.",
    },
  },
  {
    id: "aster",
    label: "Aster",
    networks: ["mainnet", "testnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: false,
      gridStop: "exchange",
      changeLeverage: { can: true },
      adjustMargin: { can: true },
    },
    credentialForm: {
      addressLabel: "Main Aster wallet address",
      addressHint: "0x…",
      addressPattern: "^0x[0-9a-fA-F]{40}$",
      secretLabel: "API wallet key",
      needsPassphrase: false,
      secretIsAgentKey: true,
      canMakeWallet: false,
      keyHelp:
        "Make a separate Pro API wallet on Aster's API Wallet page and give it perpetual trading permission. The first field takes your main Aster login wallet. Paste the generated API wallet private key here. Trade derives the generated API wallet address, so you do not paste that address.",
    },
  },
  {
    id: "lighter",
    label: "Lighter",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: false,
      gridStop: "watched",
      changeLeverage: {
        can: false,
        because:
          "Changing a Lighter position's leverage is not built yet. Lighter takes it as its own kind of transaction, which is the next thing after stops.",
      },
      adjustMargin: {
        can: false,
        because:
          "Moving the cash behind a Lighter position is not built yet. Lighter takes it as its own kind of transaction, which is the next thing after stops.",
      },
    },
    credentialForm: {
      addressLabel: "Lighter account address",
      addressHint: "0x…",
      addressPattern: "^0x[0-9a-fA-F]{40}$",
      secretLabel: "API private key",
      needsPassphrase: false,
      // Lighter keys are 40 bytes, not 32-byte EVM agent keys. Turning this on
      // would reject every real Lighter key before its own signer sees it.
      secretIsAgentKey: false,
      canMakeWallet: false,
      keyHelp:
        "Make an API key on Lighter's own site and paste the private key it " +
        "shows you. The first field takes the wallet address you trade with " +
        "on Lighter. Trade finds your account number and which key slot it " +
        "sits in by itself, and never asks for the wallet's own Ethereum " +
        "key.",
    },
  },
  {
    id: "binance",
    label: "Binance",
    // Binance has a testnet, but Trade uses this adapter for mainnet candles.
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: false,
      orders: false,
      ordersAreSwaps: false,
      gridStop: "exchange",
      changeLeverage: {
        can: false,
        because:
          "Binance is here for its candles only — no wallet trades on it.",
      },
      adjustMargin: {
        can: false,
        because:
          "Binance is here for its candles only — no wallet trades on it.",
      },
    },
    credentialForm: null,
  },
  {
    id: "dukascopy",
    label: "Dukascopy",
    // A public price feed, not an exchange: nobody holds an account there.
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: false,
      orders: false,
      ordersAreSwaps: false,
      gridStop: "watched",
      changeLeverage: {
        can: false,
        because:
          "Dukascopy is here for its candles only — no wallet trades on it.",
      },
      adjustMargin: {
        can: false,
        because:
          "Dukascopy is here for its candles only — no wallet trades on it.",
      },
    },
    credentialForm: null,
  },
  /**
   * Solana: buying and owning coins through Jupiter, the swap router. Spot
   * only — no leverage, no short side, no funding, no liquidation. Each
   * capability is switched on by the task that builds it: markets, holdings
   * and swaps are here. Every order is a swap, so `ordersAreSwaps` is what
   * the order window reads to show a quote and drop the resting shape.
   *
   * Mainnet only. Solana has a practice network with a faucet, but Jupiter
   * cannot swap on it, so the first swap is a tiny real one.
   */
  {
    id: "solana",
    label: "Solana",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: true,
      gridStop: "watched",
      changeLeverage: {
        can: false,
        because:
          "Solana is spot only: a coin is bought and owned outright, so there is no leverage to change.",
      },
      adjustMargin: {
        can: false,
        because:
          "Solana is spot only: a coin is bought and owned outright, so there is no margin behind it.",
      },
    },
    credentialForm: {
      addressLabel: "Wallet address",
      addressHint: "Base58, 32 to 44 characters",
      addressPattern: "^[1-9A-HJ-NP-Za-km-z]{32,44}$",
      secretLabel: "Secret key",
      needsPassphrase: false,
      // A Solana key is an Ed25519 key in base58, not a 32-byte EVM key.
      // The shape and the match against the address are checked by the
      // Solana folder, which is the only place that can derive one.
      secretIsAgentKey: false,
      canMakeWallet: true,
      keyHelp:
        "This is the key that holds the coins, not a limited trading key: " +
        "Solana has no way for one key to act for another. Keep in this " +
        "wallet only what you mean to trade. Paste the secret key a wallet " +
        "app such as Phantom exports, or make a new wallet below and send " +
        "USDC and a little SOL to it.",
    },
  },
] as const satisfies readonly ProtocolDescription[]

const byId = new Map(
  PROTOCOL_DESCRIPTIONS.map((description) => [description.id, description])
)

export function protocolDescription(id: ProtocolId): ProtocolDescription {
  return byId.get(id) as ProtocolDescription
}

export function protocolCore(
  id: ProtocolId
): Omit<ProtocolDescription, "credentialForm"> {
  const { credentialForm: _credentialForm, ...core } = protocolDescription(id)
  return core
}

const answer = { protocols: PROTOCOL_DESCRIPTIONS }

export function loadProtocols(): Promise<{
  protocols: readonly ProtocolDescription[]
}> {
  return Promise.resolve(answer)
}

/** Kept as the shared entry point for callers that already ask once. */
export function loadProtocolsOnce() {
  return loadProtocols()
}
