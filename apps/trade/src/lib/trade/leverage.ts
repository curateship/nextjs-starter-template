/** The highest whole leverage the order windows may offer for one market. */
export function marketLeverageLimit(maxLeverage: number | null): number {
  return maxLeverage === null
    ? 50
    : Math.max(1, Math.min(50, Math.floor(maxLeverage)))
}
