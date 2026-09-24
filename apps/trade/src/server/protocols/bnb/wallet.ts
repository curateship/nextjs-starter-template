import { evmWallet } from "@/server/protocols/evm-chain/wallet"

const wallet = evmWallet("BNB Chain")

export const packBnbCredential = wallet.pack
export const verifyBnbWallet = wallet.verify
