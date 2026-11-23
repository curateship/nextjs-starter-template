/**
 * What keeping files in the R2 bucket costs a month.
 *
 * Cloudflare charges $0.015 for each GB stored for a month, counted the same
 * way the sizes on screen are (1GB is 1,024MB). Reading the files back costs
 * nothing extra, so storage is the whole bill. The first 10GB of each month
 * are free on Cloudflare's side; the figure here leaves that out, so it is
 * the most the files could cost.
 */

export const R2_DOLLARS_PER_GB_MONTH = 0.015

const GB = 1024 * 1024 * 1024

export function storageDollarsPerMonth(bytes: number) {
  return (Math.max(0, bytes) / GB) * R2_DOLLARS_PER_GB_MONTH
}

/** "about $1.50 a month", or "under 1 cent a month" for a small library. */
export function storageCostText(bytes: number) {
  const dollars = storageDollarsPerMonth(bytes)
  if (dollars < 0.01) return "under 1 cent a month"
  return `about $${dollars.toFixed(2)} a month`
}
