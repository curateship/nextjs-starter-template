/** Stripe meter event names are short identifiers, not customer-facing text. */
export const USAGE_METER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/

export function isUsageMeter(value: string) {
  return USAGE_METER_PATTERN.test(value)
}
