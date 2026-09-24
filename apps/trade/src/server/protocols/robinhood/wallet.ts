import { evmWallet } from "@/server/protocols/evm-chain/wallet"

const wallet = evmWallet("Robinhood Chain")

export const packRobinhoodCredential = wallet.pack
export const verifyRobinhoodWallet = wallet.verify
