/** Fixed storage: 61 recent seconds and 25 older ten-second samples per market. */
const SLOTS = 86
export const MAX_HISTORY_MARKETS = 3000
export const MAX_HISTORY_BYTES = MAX_HISTORY_MARKETS * SLOTS * 3 * 8
export type MarketWindow = { move: number; fraction: number; traded: number }

export class MarketHistory {
  private samples = new Map<string, Float64Array>()

  clear(key?: string) {
    if (key === undefined) this.samples.clear()
    else this.samples.delete(key)
  }

  sample(key: string, time: number, price: number, volume: number) {
    if (
      !Number.isFinite(time) ||
      !(price > 0) ||
      !Number.isFinite(price) ||
      !Number.isFinite(volume)
    )
      return
    let data = this.samples.get(key)
    if (!data) {
      if (this.samples.size >= MAX_HISTORY_MARKETS) return
      data = new Float64Array(SLOTS * 3)
      this.samples.set(key, data)
    }
    const second = Math.floor(time / 1000)
    const slot = (second % 61) * 3
    // A second is sampled once; a late tick cannot rewrite a finished second.
    let latest = 0
    for (let index = 0; index < 61 * 3; index += 3)
      latest = Math.max(latest, data[index])
    if (second <= latest) return
    if (latest && second - latest > 30) data.fill(0)
    const oldSecond = data[slot]
    if (oldSecond) {
      const coarse = (61 + (Math.floor(oldSecond / 10) % 25)) * 3
      if (Math.floor(data[coarse] / 10) !== Math.floor(oldSecond / 10)) {
        data.set(data.subarray(slot, slot + 3), coarse)
      }
    }
    data.set([second, price, volume], slot)
  }

  window(key: string, now: number, seconds: 5 | 60 | 300): MarketWindow | null {
    const data = this.samples.get(key)
    if (!data) return null
    let latest = -1
    for (let index = 0; index < 61 * 3; index += 3) {
      if (data[index] && (latest < 0 || data[index] > data[latest]))
        latest = index
    }
    if (latest < 0 || now / 1000 - data[latest] > 30) return null
    const target = data[latest] - seconds
    let start = -1
    for (let index = 0; index < data.length; index += 3) {
      if (
        data[index] &&
        data[index] <= target &&
        (start < 0 || data[index] > data[start])
      )
        start = index
    }
    if (start < 0 || target - data[start] > (seconds === 300 ? 10 : 2))
      return null
    const move = data[latest + 1] - data[start + 1]
    return {
      move,
      fraction: move / data[start + 1],
      traded: Math.max(0, data[latest + 2] - data[start + 2]),
    }
  }
}
