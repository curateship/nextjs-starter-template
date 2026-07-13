export function resolveSelectedWalletValue(
  requestedValue: string | undefined,
  savedValue: string | null,
  validValues: ReadonlySet<string>,
  fallbackValue: string | null
) {
  if (requestedValue && validValues.has(requestedValue)) return requestedValue
  if (savedValue && validValues.has(savedValue)) return savedValue
  return fallbackValue
}
