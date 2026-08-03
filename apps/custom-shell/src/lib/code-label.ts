/**
 * Turns a machine's word into a person's: `product_not_received` becomes
 * "Product not received".
 *
 * For the codes that come from outside — Stripe's invoice statuses, dispute
 * statuses and dispute reasons — where the screens keep a lookup of the ones
 * worth wording carefully, and fall back to this for anything added later. A
 * code nobody has written a sentence for still has to read as something.
 */
export function describeCode(value: string) {
  const words = value.replace(/[_-]+/g, " ").trim()
  if (!words) return "Unknown"

  return words.charAt(0).toUpperCase() + words.slice(1)
}
