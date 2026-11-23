// Shared, dependency-free parsing helpers used by the node registry to validate
// untrusted stored graph config. Kept separate so node descriptor modules can
// import them without pulling in the whole graph module.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function requiredString(value: unknown, label: string, max: number) {
  const result = boundedString(value, label, max).trim()
  if (!result) throw new Error(`${label} is required`)
  return result
}

export function boundedString(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} is invalid`)
  return value
}

export function finiteNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error(`${label} is invalid`)
  return value
}
