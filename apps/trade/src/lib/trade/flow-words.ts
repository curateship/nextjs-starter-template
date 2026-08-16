/**
 * Every reason a flow will not switch on, said the way it will be read.
 *
 * Browser-safe and in one place, because the same refusal reaches a person two
 * ways — as the step's row in the run history when Run was pressed, and as a
 * toast when the Start button was. Two copies of these sentences would drift,
 * and the one that drifted would be the one somebody read.
 *
 * Each says what to fix, not what went wrong: "add a trading key" beats "the
 * wallet has no key", because the second leaves you working out the first.
 */
export function flowStartProblem(code: string, walletLabel: string): string {
  if (code.includes("FLOW_NO_WALLET")) {
    return "This flow does not name a wallet, so there is nothing to trade. Pick one on the Wallet step."
  }
  if (code.includes("FLOW_NO_CAP")) {
    return "Say how much of the wallet this flow may use, on the Wallet step. It will not start without a limit."
  }
  if (code.includes("FLOW_WALLET_GONE")) {
    return `${walletLabel} has been deleted. Pick another wallet on the Wallet step.`
  }
  if (code.includes("FLOW_WALLET_INACTIVE")) {
    return `${walletLabel} is switched off. Make it active in the account panel, or pick another wallet.`
  }
  if (code.includes("FLOW_WALLET_KEY")) {
    return `${walletLabel} has no trading key saved, so it cannot place an order. Add one in the account panel.`
  }
  if (code.includes("FLOW_NO_COINS")) {
    return "No coins are chosen on the Markets step, so there is nothing to watch."
  }
  if (code.includes("FLOW_NO_INDICATORS")) {
    return "No indicators are switched on, so this flow would never buy anything. Open the Signals step and switch one on."
  }
  if (code.includes("FLOW_STRATEGY_UNREADABLE")) {
    return "The strategy step's settings could not be read. Open it and check the numbers."
  }
  if (code.includes("FLOW_WRONG_EXCHANGE")) {
    return `The coins on the Markets step are not from ${walletLabel}'s exchange, so it could not trade any of them. Open the Markets step and choose them again.`
  }
  if (code.includes("FLOW_ALREADY_RUNNING")) {
    return "This flow is already switched on. Stop it first if you want to start it again with different settings."
  }
  if (code.includes("FLOW_UNFUNDED_MARKET")) {
    return `Some of these coins are on markets where ${walletLabel} holds no money — Hyperliquid keeps each market's money separate, so every buy there would be refused. Open the Markets step and choose the coins again; the list now only offers what this wallet can pay for.`
  }
  if (code.includes("FLOW_WALLET_BUSY")) {
    return `Another flow is already trading ${walletLabel}. Two flows on one wallet would double every position, so stop that one first.`
  }
  // Thrown by the signing path rather than by the checks above, which is why it
  // is matched on the engine's own code rather than a FLOW_ one.
  if (code.includes("LIVE_MAINNET_OFF")) {
    return "Real trading on the main network is switched off on this server, so this flow cannot start. It has to be turned on where the app runs."
  }
  return "This flow could not be switched on. Check the Wallet and Markets steps."
}
