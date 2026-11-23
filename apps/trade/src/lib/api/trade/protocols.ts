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
      gridStop: "exchange",
      changeLeverage: { can: true },
      adjustMargin: { can: true },
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
  /**
   * ApeX Omni: a decentralised perpetuals exchange built on zkLink, the
   * Lighter kind of venue. Not the Variational Omni in `Protocols/Omni/`,
   * which is a different product. Mainnet only (Tyler, 5 Sep 2026).
   */
  {
    id: "apex",
    label: "ApeX Omni",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: false,
      // Stops rest on ApeX as its own conditional orders.
      gridStop: "exchange",
      // Leverage is a per-market setting ApeX takes at any time.
      changeLeverage: { can: true },
      // ApeX's docs describe one margin for the whole account, liquidated
      // as a whole, and list no call that moves cash behind one position.
      adjustMargin: {
        can: false,
        because:
          "ApeX Omni holds every position on the account's one shared margin, so there is no cash behind a single position to add to or take back.",
      },
    },
    credentialForm: {
      addressLabel: "Wallet address",
      addressHint: "0x…",
      addressPattern: "^0x[0-9a-fA-F]{40}$",
      secretLabel: "API values",
      needsPassphrase: true,
      // Not an Ethereum agent key: turning this on would run the 64-hex
      // agent-key check on ApeX's three values and refuse every real paste.
      secretIsAgentKey: false,
      canMakeWallet: false,
      keyHelp:
        "Open API management on ApeX Omni and copy three values into API values, separated by spaces: the API key, the secret and the omni key. The passphrase goes in its own box. The first field takes the wallet address you sign in to ApeX with. Trade never asks for that wallet's own key, so it can trade but never withdraw.",
    },
  },
  /**
   * edgeX: a decentralised perpetuals exchange with coin, stock, metal and
   * currency contracts, all in USDC (`edgex.md`). Mainnet only: its practice
   * network redirects to a staff-only login (Tyler, 5 Sep 2026).
   */
  {
    id: "edgex",
    label: "edgeX",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: false,
      // Stops rest on edgeX as its own conditional orders.
      gridStop: "exchange",
      // Leverage is a per-contract setting edgeX takes at any time without
      // open orders on that contract.
      changeLeverage: { can: true },
      // edgeX's docs list no call that adds cash to, or takes it back from,
      // one position (checked 24 Sep 2026).
      adjustMargin: {
        can: false,
        because:
          "edgeX has no way to add cash to one position or take it back. Change the leverage instead, which changes how much cash the position holds.",
      },
    },
    credentialForm: {
      addressLabel: "Account id",
      addressHint: "The Account ID from edgeX's API Management list",
      addressPattern: "^\\d{1,20}$",
      secretLabel: "SDK Signer values",
      needsPassphrase: true,
      // Not an Ethereum agent key on its own: turning this on would run the
      // 64-hex agent-key check on the three values and refuse every paste.
      secretIsAgentKey: false,
      canMakeWallet: false,
      keyHelp:
        "On edgeX open API Management → Perps V2 → SDK Signer. Copy three values into SDK Signer values, separated by spaces, in the order the dialog shows them: the Private Key, the API Key and the secret. The passphrase goes in its own box, and the Account ID from the API Management list in the first field. The Private Key can place orders but never withdraw, and Trade never asks for your wallet's own key.",
    },
  },
  /**
   * Binance USDⓈ-M futures. Trading added 24 Sep 2026 (`binance.md`). Mainnet
   * only: Binance's futures testnet needs a separate testnet account.
   */
  {
    id: "binance",
    label: "Binance",
    networks: ["mainnet"],
    defaultNetwork: "mainnet",
    capabilities: {
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: false,
      // Stops rest on Binance's own stop-order service.
      gridStop: "exchange",
      changeLeverage: { can: true },
      // Binance moves cash behind an isolated position only, and refuses a
      // cross one in its own words.
      adjustMargin: { can: true },
    },
    credentialForm: {
      addressLabel: "API key",
      addressHint: "The API Key from Binance's API Management page",
      // Binance's keys are 64 letters and digits today. The shape check is
      // tolerant; the signed reads are what prove the key.
      addressPattern: "^[0-9A-Za-z]{16,128}$",
      secretLabel: "Secret key",
      needsPassphrase: false,
      secretIsAgentKey: false,
      canMakeWallet: false,
      keyHelp:
        "Make a key on Binance's API Management page (the system-generated kind) and tick Enable Futures. Leave Enable Withdrawals off. Copy the API Key and the Secret Key while the secret is shown. If you restrict the key to certain internet addresses, this server's address must be on the list.",
    },
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
  {
    id: "bnb",
    label: "BNB Chain",
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
          "BNB Chain is spot only: a coin is bought and owned outright, so there is no leverage to change.",
      },
      adjustMargin: {
        can: false,
        because:
          "BNB Chain is spot only: a coin is bought and owned outright, so there is no margin behind it.",
      },
    },
    credentialForm: {
      addressLabel: "Wallet address",
      addressHint: "0x followed by 40 hexadecimal characters",
      addressPattern: "^0x[0-9a-fA-F]{40}$",
      secretLabel: "Private key",
      needsPassphrase: false,
      secretIsAgentKey: false,
      canMakeWallet: true,
      keyHelp:
        "This private key holds the coins in your BNB Chain wallet. Keep in this wallet only what you mean to trade. Paste your wallet's private key, or make a new wallet below. BNB Chain uses USDT for purchases and BNB for network fees.",
    },
  },
  /**
   * Robinhood Chain: Robinhood's own network, where Stock Tokens such as
   * NVDA and SPY trade around the clock against USDG. The same shape as BNB
   * Chain, and the same shared chain code. Spot only: every order is a swap,
   * through KyberSwap or Velora, whichever gives more. Mainnet only, because
   * neither router works on the testnet.
   */
  {
    id: "robinhood",
    label: "Robinhood Chain",
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
          "Robinhood Chain is spot only: a coin is bought and owned outright, so there is no leverage to change.",
      },
      adjustMargin: {
        can: false,
        because:
          "Robinhood Chain is spot only: a coin is bought and owned outright, so there is no margin behind it.",
      },
    },
    credentialForm: {
      addressLabel: "Wallet address",
      addressHint: "0x followed by 40 hexadecimal characters",
      addressPattern: "^0x[0-9a-fA-F]{40}$",
      secretLabel: "Private key",
      needsPassphrase: false,
      secretIsAgentKey: false,
      canMakeWallet: true,
      keyHelp:
        "This private key holds the coins in your Robinhood Chain wallet. Keep in this wallet only what you mean to trade. Paste your wallet's private key, or make a new wallet below. Robinhood Chain uses USDG for purchases and ETH for network fees. Robinhood's terms bar Stock Tokens in the US and restrict them in Canada, the UK and Switzerland, so whether you may hold them is yours to check.",
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
