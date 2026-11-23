/**
 * What a running backtest's progress bar shows.
 *
 * A coin's saved progress is 0 waiting, 0.1 while its candles load, 0.3 once
 * they are in, 0.4 to 0.95 while the strategy walks, and 1 when it is done or
 * skipped. Averaged, a 314-coin run with every crypto coin loaded sat near 30%
 * for over an hour while its stocks loaded, and a finished stock moved the bar
 * by less than a third of a percent. Tyler asked on 15 Sep 2026 for the bar to
 * show how many coins are loaded while that is what the run is doing.
 */

/** The progress the worker saves on a coin whose candles are in. */
export const COIN_LOADED_PROGRESS = 0.3

export type BacktestMeter = {
  /** From zero to one. */
  value: number
  text: string
}

type CoinProgress = { status: string; progress: number }

function isLoaded(coin: CoinProgress): boolean {
  if (coin.status === "waiting") return false
  if (coin.status === "running") return coin.progress >= COIN_LOADED_PROGRESS
  // Done, skipped, stopped and failed coins have nothing left to load.
  return true
}

export function backtestMeter(coins: readonly CoinProgress[]): BacktestMeter {
  if (coins.length === 0) return { value: 0, text: "0% through" }
  const loaded = coins.filter(isLoaded).length
  if (loaded < coins.length) {
    return {
      // Across the first 30% of the bar, which is where a fully loaded run
      // starts. Filled to the plain share instead, the bar reached 98% while
      // coins loaded and then fell back to 30% when the walk began.
      value: (loaded / coins.length) * COIN_LOADED_PROGRESS,
      text: `Loaded ${loaded} of ${coins.length} coins`,
    }
  }
  const value =
    coins.reduce((sum, coin) => sum + coin.progress, 0) / coins.length
  return { value, text: `${Math.round(value * 100)}% through` }
}
